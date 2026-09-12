const { totalsFor, profitFor, labelFor, CHARGE_BY_KEY } = require("./chargeTypes");
const { resolveTimeZone, utcFromLocal } = require("../utils/timezone");
// "Has this been billed" is a question about the invoice register, not about a
// field on the load. See services/billingState.js.
const billingState = require("../services/billingState");

// ─── Report definitions ───────────────────────────────────────────────────────
// Every report the system can produce, declared as data: which loads it selects,
// which columns it shows, which filters it accepts, and how its totals are
// reached.
//
// Declared rather than written as seventeen handlers because the reports differ
// only in those four things. One runner (controllers/reportController.js)
// executes them all, which means filtering, sorting, pagination, CSV export and
// the empty state are implemented once and behave identically everywhere — and
// a new report is an entry here rather than a new endpoint.
//
// ── On "the data must reflect the latest load information" ───────────────────
// Nothing here is precomputed or cached. Every report runs against the live
// Load collection at the moment it is asked for, and the financial ones total
// through the same config/chargeTypes.js the accounting screens use. A report
// that disagrees with the load it describes is worse than no report.
// ─────────────────────────────────────────────────────────────────────────────

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

const daysBetween = (from, to = new Date()) => {
  if (!from) return null;
  const start = new Date(from);
  if (Number.isNaN(start.getTime())) return null;
  return Math.max(0, Math.floor((to - start) / (1000 * 60 * 60 * 24)));
};

/**
 * When a load last entered the given transport status.
 *
 * Read from `transportStatusHistory` rather than from `updatedAt`: a load
 * sitting in the yard still gets touched by unrelated edits, and using
 * updatedAt would reset its age every time somebody fixed a typo — which is
 * exactly the number "days in yard" exists to expose.
 */
const enteredStatusAt = (load, status) => {
  const history = load.transportStatusHistory || [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].status === status) return history[i].changedAt;
  }
  return null;
};

// ── Shared column builders ───────────────────────────────────────────────────

const COL = {
  loadId: { key: "loadId", label: "Load ID" },
  customer: { key: "customerName", label: "Customer" },
  carrier: { key: "carrierName", label: "Carrier" },
  container: { key: "containerNo", label: "Container #" },
  booking: { key: "bookingNo", label: "Booking #" },
  ref: { key: "refNo", label: "Reference #" },
  shippingLine: { key: "shippingLine", label: "Shipping Line" },
  status: { key: "transportStatus", label: "Status" },
  pickupCity: { key: "pickupCity", label: "Pickup" },
  dropCity: { key: "dropCity", label: "Delivery" },
  lfd: { key: "lastFreeDate", label: "LFD", type: "date" },
  created: { key: "createdAt", label: "Entered", type: "date" },
  amount: { key: "amount", label: "Amount", type: "money" },
};

/**
 * A stop as the lines a settlement sheet stacks in one cell: who, street, city.
 * Load stops call the first `company`; older records used `name`.
 */
const stopLines = (stop) =>
  [stop?.company || stop?.name, stop?.address, [stop?.city, stop?.state].filter(Boolean).join(", ")]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join("\n");

/**
 * Total, paid and open for a payee's charges.
 *
 * Shared by the driver and carrier sheets so "paid" means the same on both. An
 * advance is money already out, so it counts as paid — capped at the total,
 * because an advance larger than the run is a recovery to chase, not a negative
 * balance to print.
 */
const settle = (charges, advances = 0) => {
  const total = money(charges.reduce((sum, c) => sum + c.amount, 0));
  const paid = money(
    Math.min(
      total,
      charges.filter((c) => c.paid).reduce((sum, c) => sum + c.amount, 0) + advances,
    ),
  );
  return { total, paid, openBalance: money(total - paid) };
};

const payState = (paid, openBalance) =>
  openBalance <= 0 ? "Paid" : paid > 0 ? "Part paid" : "Pending";

const kindOf = (line) => CHARGE_BY_KEY.get(line.chargeType)?.kind || "accessorial";

/**
 * Everything owed to the payroll driver on one load, charge by charge, counted
 * once.
 *
 * ── Why this has to decide between two records ───────────────────────────────
 * A driver's pay can be recorded two ways. The older one is the load's
 * `accounting.payroll` figure. The newer one is lines on the payables ledger
 * stamped with the driver — which the Load model names as the authority, so a
 * split load can pay each driver their own amount. Offices use both, and adding
 * the two together reports a $262.50 run as $525 the moment somebody enters the
 * pay in both places.
 *
 * So the ledger's charge kinds decide:
 *   - A linehaul line for the driver IS their pay. The payroll figure is then
 *     the same money recorded twice, and is left out.
 *   - No linehaul line means the payroll figure is the pay, and any lines are
 *     extras on top of it — a detention, a lumper — which is how a load paid
 *     through payroll picks up an accessorial afterwards.
 *   - A settlement line is an advance: money that has already gone to the
 *     driver. It is never a charge; it counts as paid. Same rule as
 *     config/chargeTypes.js applies to every other ledger.
 */
const driverChargesFor = (load) => {
  const payroll = load.accounting?.payroll || {};
  const driverId = payroll.driver ? String(payroll.driver) : null;

  const lines = driverId
    ? (load.accounting?.payables?.lines || []).filter(
        (line) => line.driverId && String(line.driverId) === driverId,
      )
    : [];

  const payIsOnLedger = lines.some((line) => kindOf(line) === "linehaul");

  const charges = [];

  if (!payIsOnLedger && money(payroll.amount) > 0) {
    charges.push({
      label: "Driver pay",
      amount: money(payroll.amount),
      paid: !!payroll.settledAt,
    });
  }

  lines
    .filter((line) => kindOf(line) !== "settlement")
    .forEach((line) => {
      charges.push({
        label: labelFor(line.chargeType) || line.chargeType,
        amount: money(line.amount),
        note: line.note || "",
        paid: !!line.paidAt,
      });
    });

  const advances = money(
    lines
      .filter((line) => kindOf(line) === "settlement")
      .reduce((sum, line) => sum + (Number(line.amount) || 0), 0),
  );

  return { charges, advances, ...settle(charges, advances) };
};

/**
 * What each carrier on one load is owed, one entry per carrier.
 *
 * The payables ledger holds both carriers and drivers. Lines stamped with a
 * driver are driver pay and belong on the driver sheet, so they are left out
 * here — counting them on both would be the same double count driverChargesFor
 * exists to prevent. On a split load each line names its carrier; on an ordinary
 * load the lines carry no carrier and all belong to the one assigned.
 *
 * A charge is paid when its own line is, or when the whole payables side was
 * marked paid — the older, load-level way of settling a carrier.
 */
const carrierChargesFor = (load) => {
  const ledgerPaid = !!load.accounting?.payables?.paidAt;
  const assigned = load.assignedFleetOwner || {};
  const legs = load.assignments || [];

  const byCarrier = new Map();
  const entryFor = (fleetOwnerId) => {
    const key = String(fleetOwnerId || assigned.fleetOwnerId || "unassigned");
    if (!byCarrier.has(key)) {
      const leg = legs.find((l) => String(l.fleetOwnerId || "") === key);
      byCarrier.set(key, {
        fleetOwnerId: key === "unassigned" ? null : key,
        carrierName: leg?.fleetOwnerName || assigned.fleetOwnerName || "Unassigned",
        leg,
        charges: [],
        advances: 0,
      });
    }
    return byCarrier.get(key);
  };

  (load.accounting?.payables?.lines || [])
    .filter((line) => !line.driverId)
    .forEach((line) => {
      const entry = entryFor(line.fleetOwnerId);
      if (kindOf(line) === "settlement") {
        entry.advances = money(entry.advances + (Number(line.amount) || 0));
        return;
      }
      entry.charges.push({
        label: labelFor(line.chargeType) || line.chargeType,
        amount: money(line.amount),
        note: line.note || "",
        paid: !!(line.paidAt || ledgerPaid),
      });
    });

  return [...byCarrier.values()].map((entry) => ({
    ...entry,
    ...settle(entry.charges, entry.advances),
  }));
};

/** The row shape every operational report starts from. */
const baseRow = (load) => ({
  loadId: load.loadId,
  customerName: load.customerName || "",
  carrierName: load.assignedFleetOwner?.fleetOwnerName || "",
  containerNo: load.containerNo || "",
  bookingNo: load.bookingNo || "",
  refNo: load.refNo || "",
  shippingLine: load.shippingLine || "",
  transportStatus: load.transportStatus || "",
  status: load.status || "",
  pickupCity: [load.pickup?.city, load.pickup?.state].filter(Boolean).join(", "),
  dropCity: [load.drop?.city, load.drop?.state].filter(Boolean).join(", "),
  lastFreeDate: load.lastFreeDate || null,
  createdAt: load.createdAt,
  amount: money(load.amount),
});

/**
 * A day-bounded filter on one date field.
 *
 * The dates come off a date picker, so they are calendar days in the *user's*
 * timezone, not instants. Resolving them with `new Date("2026-08-14")` parses
 * UTC midnight and then `setHours` applies server-local time — two different
 * zones in one calculation, which silently shifts every boundary by the offset
 * between them. A user in Los Angeles asking for "today" would get a window
 * that starts eight hours early and ends eight hours early.
 *
 * So the same helper the dashboards use resolves both ends
 * (utils/timezone.js), and the range is half-open: `[start of from, start of
 * the day after to)`. Half-open rather than `$lte 23:59:59.999` because a
 * timestamp landing exactly on the boundary must belong to one day, not two.
 */
const dateRange = (field, { from, to, timeZone = "UTC" }) => {
  if (!from && !to) return {};

  const zone = resolveTimeZone(timeZone);
  const range = {};

  if (from) range.$gte = utcFromLocal(`${from}T00:00:00`, zone);

  if (to) {
    const dayAfter = new Date(`${to}T00:00:00Z`);
    dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
    range.$lt = utcFromLocal(
      `${dayAfter.toISOString().slice(0, 10)}T00:00:00`,
      zone,
    );
  }

  return { [field]: range };
};

// Statuses that mean the load has not been collected yet. Used by more than one
// report, so the list lives in one place — the two drifting apart would make
// "no pickup" and "ready for pickup" disagree about the same load.
const NOT_YET_PICKED_UP = [
  "LOAD_PLANNER",
  "NEW_LOAD",
  "ASSIGNED",
  "READY_TO_PICKUP",
];

/**
 * Fill in whether each row's load has been invoiced and paid.
 *
 * Read from the invoice register rather than from the date on the load — see
 * services/billingState.js for why those two disagreed, and why the date is
 * still consulted as a fallback for loads billed before the register existed.
 *
 * Used by every report that selects on invoice state, so that the answer a
 * report gives matches the badge on the accounting screen. Two screens
 * disagreeing about whether a customer has been billed is worse than either of
 * them being wrong on its own.
 */
const withBillingState = async (rows, loads) => {
  const byLoad = await billingState.arStateFor(loads.map((load) => load.loadId));

  return rows.map((row, index) => {
    const state = billingState.stateOf(loads[index], byLoad);

    return {
      ...row,
      invoiced: state.invoiced,
      paid: state.paid,
      invoiceNumber: state.invoiceNumber,
      invoicedAt: state.invoicedAt,
      paidAt: state.paidAt,
    };
  });
};

// ─── The reports ──────────────────────────────────────────────────────────────

const REPORTS = [
  // ══ Financial ═════════════════════════════════════════════════════════════
  {
    key: "receivables",
    label: "Receivable Report",
    group: "Financial",
    description:
      "Every receivable line billed in the period, with what has been collected and what is still owed.",
    filters: ["dateRange", "customer", "invoiceState"],
    dateField: "createdAt",
    dateLabel: "Load entered",
    // Led by who and which invoice, because that is how a receivable is chased —
    // a customer quotes their invoice, their own reference or the box, never our
    // load number, so the load id is left off and the two numbers they do quote
    // sit right beside the invoice.
    columns: [
      COL.customer,
      { key: "invoiceNumber", label: "Invoice #" },
      COL.ref,
      COL.container,
      { key: "invoicedAt", label: "Invoiced", type: "date" },
      { key: "linehaul", label: "Gross", type: "money" },
      { key: "accessorials", label: "Accessorials", type: "money" },
      { key: "total", label: "Total", type: "money" },
      { key: "settled", label: "Advance", type: "money" },
      { key: "balance", label: "Balance Due", type: "money" },
      { key: "paidAt", label: "Paid", type: "date" },
    ],
    filter: (params) => {
      const query = {
        // Only loads that actually have receivables — a load nobody has billed
        // is not a zero-value row on a receivables report, it is not on it.
        "accounting.receivables.lines.0": { $exists: true },
        ...dateRange("createdAt", params),
      };
      if (params.customer) query.customer = params.customer;
      // The invoice-state filters are NOT applied here. Whether a load has been
      // invoiced or paid is answered by the invoice register, so the selection
      // happens in postFilter below, once `enrich` has read it.
      return query;
    },
    row: (load) => {
      const totals = totalsFor(load.accounting?.receivables?.lines || []);
      return {
        ...baseRow(load),
        ...totals,
      };
    },
    enrich: withBillingState,
    postFilter: (row, params) => {
      if (params.invoiceState === "unpaid") return !row.paid;
      if (params.invoiceState === "uninvoiced") return !row.invoiced;
      return true;
    },
    totals: ["linehaul", "accessorials", "total", "settled", "balance"],
  },

  {
    key: "payables",
    label: "Payable Report",
    group: "Financial",
    description:
      "What each carrier is owed for the period, charge by charge, with what has been paid and what is still open.",
    filters: ["dateRange", "carrier"],
    dateField: "createdAt",
    dateLabel: "Load entered",
    // The same sheet as the driver payable report, per carrier: the job, every
    // charge on it, where the box went, and whether the carrier has had it.
    columns: [
      COL.loadId,
      COL.container,
      COL.carrier,
      { key: "total", label: "Total", type: "money" },
      { key: "chargeSummary", label: "Total Report" },
      { key: "from", label: "From" },
      { key: "to", label: "To" },
      { key: "payState", label: "Status" },
    ],
    filter: (params) => {
      const query = {
        "accounting.payables.lines.0": { $exists: true },
        ...dateRange("createdAt", params),
      };
      if (params.carrier) {
        // Either the carrier the load was given to, or one leg of a split load.
        query.$or = [
          { "assignedFleetOwner.fleetOwnerId": params.carrier },
          { "assignments.fleetOwnerId": params.carrier },
        ];
      }
      return query;
    },
    // One row per carrier per load. A split load owes two carriers two amounts
    // on two stretches, and a single row could only show one of them.
    row: (load) =>
      carrierChargesFor(load)
        .filter((entry) => entry.charges.length || entry.advances)
        .map((entry) => {
          const note = String(load.accounting?.payables?.notes || "").trim();
          const reference = String(load.accounting?.payables?.reference || "").trim();

          return {
            ...baseRow(load),
            carrier: entry.fleetOwnerId,
            carrierName: entry.carrierName,
            charges: entry.charges,
            advances: entry.advances,
            checkNumber: reference,
            reason: note,
            total: entry.total,
            paid: entry.paid,
            openBalance: entry.openBalance,
            chargeSummary:
              entry.charges.map((c) => `${c.label}: ${c.amount.toFixed(2)}`).join("; ") +
              ` | Check #: ${reference || "—"} | Reason: ${note || "—"} | Total: ${entry.total.toFixed(2)}`,
            from: stopLines(entry.leg?.origin || load.pickup),
            to: stopLines(entry.leg?.destination || load.drop),
            settledAt: load.accounting?.payables?.paidAt || null,
            payState: payState(entry.paid, entry.openBalance),
          };
        }),
    // The cheque number a carrier was paid by lives on the payments against
    // their bill, not on the ledger, so it is read from the register here — one
    // query for all rows. Reversed payments are left out: a bounced cheque did
    // not pay anybody.
    enrich: async (rows) => {
      const loadIds = [...new Set(rows.map((row) => row.loadId).filter(Boolean))];
      if (!loadIds.length) return rows;

      const Invoice = require("../models/Invoice");
      const Payment = require("../models/Payment");

      const bills = await Invoice.find({
        direction: "AP",
        "party.kind": "CARRIER",
        loadId: { $in: loadIds },
        status: { $ne: "VOID" },
      })
        .select("loadId party.id")
        .lean();
      if (!bills.length) return rows;

      const payments = await Payment.find({
        invoice: { $in: bills.map((bill) => bill._id) },
        reversedAt: { $exists: false },
      })
        .select("invoice documentNumber")
        .lean();

      const billKey = new Map(
        bills.map((bill) => [String(bill._id), `${bill.loadId}|${bill.party?.id || ""}`]),
      );
      const refs = new Map();
      payments.forEach((payment) => {
        const key = billKey.get(String(payment.invoice));
        const ref = String(payment.documentNumber || "").trim();
        if (!key || !ref) return;
        if (!refs.has(key)) refs.set(key, new Set());
        refs.get(key).add(ref);
      });

      return rows.map((row) => {
        const found = refs.get(`${row.loadId}|${row.carrier || ""}`);
        if (!found) return row;
        const checkNumber = [...found].join(", ");
        return {
          ...row,
          checkNumber,
          chargeSummary: row.chargeSummary.replace(/Check #: [^|]*\|/, `Check #: ${checkNumber} |`),
        };
      });
    },
    // A carrier picked in the filter narrows the loads; on a split load the
    // other carrier's row would still come back, so it is removed here.
    postFilter: (row, params) => !params.carrier || String(row.carrier) === String(params.carrier),
    totals: ["total", "paid", "openBalance"],
    groupBy: "carrierName",
  },

  {
    key: "driverPayable",
    label: "Driver Payable Report",
    group: "Financial",
    description:
      "What each driver is owed for the period, charge by charge, with what has been paid and what is still open.",
    filters: ["dateRange", "driver", "settledState"],
    dateField: "accounting.payroll.calculatedAt",
    dateLabel: "Pay calculated",
    // Laid out as the settlement sheet the office already prints: the load and
    // its container to identify the job, every charge on it rather than one
    // bare figure, then where the box went and whether the driver has had it.
    columns: [
      COL.loadId,
      COL.container,
      { key: "driverName", label: "Driver" },
      { key: "total", label: "Total", type: "money" },
      // Rendered as the charge breakdown on screen; `chargeSummary` is the same
      // thing flattened for the CSV, which has no cell that can hold a list.
      { key: "chargeSummary", label: "Total Report" },
      { key: "from", label: "From" },
      { key: "to", label: "To" },
      { key: "payState", label: "Status" },
    ],
    filter: (params) => {
      const query = {
        "accounting.payroll.amount": { $gt: 0 },
        ...dateRange("accounting.payroll.calculatedAt", params),
      };
      if (params.driver) query["accounting.payroll.driver"] = params.driver;
      if (params.settledState === "unsettled") {
        query["accounting.payroll.settledAt"] = { $exists: false };
      }
      if (params.settledState === "settled") {
        query["accounting.payroll.settledAt"] = { $exists: true };
      }
      return query;
    },
    row: (load) => {
      const payroll = load.accounting?.payroll || {};
      const driverId = payroll.driver ? String(payroll.driver) : null;

      // Counted once, whichever way the pay was recorded — see driverChargesFor.
      const { charges, advances, total, paid, openBalance } = driverChargesFor(load);

      // The reference used to be appended to the note as "Paid: …" before it
      // had a field of its own. Both are read, and the suffix is kept out of the
      // reason so it does not print twice.
      const legacyRef = /Paid:\s*([^·]+)/.exec(payroll.note || "");
      const checkNumber = payroll.reference || (legacyRef ? legacyRef[1].trim() : "");
      const reason = String(payroll.note || "")
        .split("·")
        .map((part) => part.trim())
        .filter((part) => part && !/^Paid:/.test(part))
        .join(" · ");

      return {
        ...baseRow(load),
        driver: payroll.driver || null,
        driverName: payroll.driverName || "Unassigned",
        payDate: payroll.calculatedAt || null,
        payType: payroll.payType || "",
        rate: payroll.rate ?? "",
        miles: payroll.miles ?? null,
        hours: payroll.hours ?? null,
        payAmount: money(payroll.amount),
        charges,
        advances,
        checkNumber,
        reason,
        total,
        paid,
        openBalance,
        chargeSummary:
          charges.map((c) => `${c.label}: ${c.amount.toFixed(2)}`).join("; ") +
          ` | Check #: ${checkNumber || "—"} | Reason: ${reason || "—"} | Total: ${total.toFixed(2)}`,
        from: stopLines(load.pickup),
        to: stopLines(load.drop),
        settledAt: payroll.settledAt || null,
        payState: payState(paid, openBalance),
      };
    },
    // Per driver these are the three figures the sheet ends on.
    totals: ["total", "paid", "openBalance"],
    groupBy: "driverName",
  },

  {
    key: "profitability",
    label: "Revenue vs Expense",
    group: "Financial",
    description: "Margin per load — what was billed against what was incurred.",
    filters: ["dateRange", "customer"],
    dateField: "createdAt",
    columns: [
      COL.loadId,
      COL.customer,
      COL.carrier,
      { key: "revenue", label: "Revenue", type: "money" },
      { key: "expense", label: "Expense", type: "money" },
      { key: "driverPay", label: "Driver Pay", type: "money" },
      { key: "margin", label: "Margin", type: "money" },
      { key: "marginPercent", label: "Margin %", type: "percent" },
    ],
    filter: (params) => {
      const query = dateRange("createdAt", params);
      if (params.customer) query.customer = params.customer;
      return query;
    },
    row: (load) => {
      const profit = profitFor({
        receivableLines: load.accounting?.receivables?.lines || [],
        payableLines: load.accounting?.payables?.lines || [],
      });
      return {
        ...baseRow(load),
        revenue: profit.revenue.total,
        expense: profit.expense.total,
        driverPay: money(load.accounting?.payroll?.amount),
        margin: profit.margin,
        marginPercent: profit.marginPercent,
      };
    },
    totals: ["revenue", "expense", "driverPay", "margin"],
  },

  {
    key: "accessorialsByCustomer",
    label: "Accessorial Loads — Customer-Wise",
    group: "Financial",
    description:
      "Accessorial charges grouped by customer, so a customer who consistently generates detention is visible.",
    filters: ["dateRange", "customer"],
    dateField: "createdAt",
    columns: [
      COL.loadId,
      COL.customer,
      { key: "accessorialDetail", label: "Charges" },
      { key: "accessorials", label: "Accessorial Total", type: "money" },
      { key: "total", label: "Load Total", type: "money" },
    ],
    filter: (params) => {
      const query = {
        "accounting.receivables.lines.0": { $exists: true },
        ...dateRange("createdAt", params),
      };
      if (params.customer) query.customer = params.customer;
      return query;
    },
    row: (load) => {
      const lines = load.accounting?.receivables?.lines || [];
      const totals = totalsFor(lines);

      // Spelled out rather than given as one number: "Detention $300, Chassis
      // Split $125" is what makes the row actionable in a customer conversation.
      const detail = lines
        .filter((l) => !["linehaul", "advance"].includes(l.chargeType))
        .map(
          (l) =>
            `${labelFor(l.chargeType, "receivable")} $${money(l.amount).toLocaleString("en-US")}`,
        )
        .join(", ");

      return { ...baseRow(load), ...totals, accessorialDetail: detail };
    },
    // Loads with no accessorials would be empty rows on an accessorials report.
    postFilter: (row) => row.accessorials > 0,
    totals: ["accessorials", "total"],
    groupBy: "customerName",
  },

  // ══ Daily operations ══════════════════════════════════════════════════════
  {
    key: "dailyEntered",
    label: "Daily Entered Loads",
    group: "Operations",
    description: "Loads entered on a particular day.",
    filters: ["dateRange", "customer"],
    dateField: "createdAt",
    dateLabel: "Entered",
    defaultRange: "today",
    columns: [
      COL.loadId,
      COL.customer,
      COL.container,
      COL.booking,
      COL.shippingLine,
      COL.pickupCity,
      COL.dropCity,
      COL.status,
      COL.amount,
      COL.created,
    ],
    filter: (params) => {
      const query = dateRange("createdAt", params);
      if (params.customer) query.customer = params.customer;
      return query;
    },
    row: baseRow,
    totals: ["amount"],
  },

  {
    key: "dailyDelivered",
    label: "Daily Delivered Loads",
    group: "Operations",
    description: "Loads delivered on a particular day.",
    filters: ["dateRange", "customer"],
    dateField: "completedAt",
    dateLabel: "Delivered",
    defaultRange: "today",
    columns: [
      COL.loadId,
      COL.customer,
      COL.carrier,
      COL.container,
      COL.dropCity,
      { key: "deliveredAt", label: "Delivered", type: "datetime" },
      COL.amount,
    ],
    filter: (params) => {
      const query = { transportStatus: "DELIVERED" };
      const range = dateRange("completedAt", params);
      // Loads delivered before completedAt existed have no value for it; fall
      // back to updatedAt so they still appear rather than silently vanishing.
      if (Object.keys(range).length) {
        Object.assign(query, {
          $or: [range, dateRange("updatedAt", params)],
        });
      }
      if (params.customer) query.customer = params.customer;
      return query;
    },
    row: (load) => ({
      ...baseRow(load),
      deliveredAt:
        load.completedAt || enteredStatusAt(load, "DELIVERED") || load.updatedAt,
    }),
    totals: ["amount"],
  },

  {
    key: "customerWise",
    label: "Customer-Wise Loads",
    group: "Operations",
    description: "Loads grouped by customer, with their current status.",
    filters: ["dateRange", "customer", "status"],
    dateField: "createdAt",
    columns: [
      COL.customer,
      COL.loadId,
      COL.container,
      COL.status,
      COL.pickupCity,
      COL.dropCity,
      COL.lfd,
      COL.amount,
    ],
    filter: (params) => {
      const query = dateRange("createdAt", params);
      if (params.customer) query.customer = params.customer;
      if (params.status) query.transportStatus = params.status;
      return query;
    },
    row: baseRow,
    totals: ["amount"],
    groupBy: "customerName",
  },

  {
    key: "shippingLineWise",
    label: "Shipping Line-Wise Loads",
    group: "Operations",
    description: "Loads grouped by shipping line.",
    filters: ["dateRange", "shippingLine", "status"],
    dateField: "createdAt",
    columns: [
      COL.shippingLine,
      COL.loadId,
      COL.customer,
      COL.container,
      COL.status,
      COL.lfd,
      COL.amount,
    ],
    filter: (params) => {
      const query = dateRange("createdAt", params);
      if (params.shippingLine) query.shippingLine = params.shippingLine;
      if (params.status) query.transportStatus = params.status;
      return query;
    },
    row: baseRow,
    totals: ["amount"],
    groupBy: "shippingLine",
  },

  // ══ Yard ══════════════════════════════════════════════════════════════════
  {
    key: "loadedInYard",
    label: "Loaded in Yard",
    group: "Yard",
    description:
      "Loads sitting loaded in the yard, and how many days each has been there.",
    filters: ["customer"],
    columns: [
      COL.loadId,
      COL.customer,
      COL.container,
      COL.carrier,
      { key: "inYardSince", label: "In Yard Since", type: "date" },
      { key: "daysInYard", label: "Days", type: "number" },
      COL.lfd,
      { key: "lfdDaysLeft", label: "Days to LFD", type: "number" },
    ],
    filter: (params) => {
      const query = { transportStatus: "LOADED_IN_YARD" };
      if (params.customer) query.customer = params.customer;
      return query;
    },
    row: (load) => {
      const since = enteredStatusAt(load, "LOADED_IN_YARD") || load.updatedAt;
      return {
        ...baseRow(load),
        inYardSince: since,
        daysInYard: daysBetween(since),
        // Negative means the free time has already run out and the container is
        // accruing demurrage — the number the yard report exists to surface.
        lfdDaysLeft: load.lastFreeDate
          ? -daysBetween(load.lastFreeDate)
          : null,
      };
    },
    // Longest-standing first: the oldest container in the yard is the one
    // costing money.
    sortRows: (a, b) => (b.daysInYard || 0) - (a.daysInYard || 0),
    totals: ["amount"],
  },

  {
    key: "emptyInYard",
    label: "Empty in Yard",
    group: "Yard",
    description: "Empties sitting in the yard waiting to be returned.",
    filters: ["customer"],
    columns: [
      COL.loadId,
      COL.customer,
      COL.container,
      COL.shippingLine,
      { key: "inYardSince", label: "Empty Since", type: "date" },
      { key: "daysInYard", label: "Days", type: "number" },
    ],
    filter: (params) => {
      const query = { transportStatus: "EMPTY_IN_YARD" };
      if (params.customer) query.customer = params.customer;
      return query;
    },
    row: (load) => {
      const since = enteredStatusAt(load, "EMPTY_IN_YARD") || load.updatedAt;
      return { ...baseRow(load), inYardSince: since, daysInYard: daysBetween(since) };
    },
    sortRows: (a, b) => (b.daysInYard || 0) - (a.daysInYard || 0),
  },

  // ══ Exceptions — the "what is missing" reports ════════════════════════════
  {
    key: "withLfd",
    label: "Loads with LFD Date",
    group: "Exceptions",
    description:
      "Loads carrying a last free date, soonest first, with days remaining.",
    filters: ["customer", "shippingLine"],
    columns: [
      COL.loadId,
      COL.customer,
      COL.container,
      COL.shippingLine,
      COL.lfd,
      { key: "lfdDaysLeft", label: "Days Left", type: "number" },
      COL.status,
    ],
    filter: (params) => {
      const query = { lastFreeDate: { $exists: true, $ne: null } };
      if (params.customer) query.customer = params.customer;
      if (params.shippingLine) query.shippingLine = params.shippingLine;
      return query;
    },
    row: (load) => ({
      ...baseRow(load),
      lfdDaysLeft: -daysBetween(load.lastFreeDate),
    }),
    sortRows: (a, b) => (a.lfdDaysLeft ?? 0) - (b.lfdDaysLeft ?? 0),
  },

  {
    key: "withoutLfd",
    label: "Loads with No LFD",
    group: "Exceptions",
    description:
      "Loads with no last free date recorded — the ones that will accrue demurrage without anybody noticing.",
    filters: ["customer"],
    columns: [
      COL.loadId,
      COL.customer,
      COL.container,
      COL.booking,
      COL.shippingLine,
      COL.status,
      COL.created,
    ],
    filter: (params) => {
      // Three ways to be missing — absent, null, or an empty string left by a
      // form. All three are the same operational gap.
      const query = {
        $or: [
          { lastFreeDate: { $exists: false } },
          { lastFreeDate: null },
          { lastFreeDate: "" },
        ],
      };
      if (params.customer) query.customer = params.customer;
      return query;
    },
    row: baseRow,
  },

  {
    key: "noPickup",
    label: "Loads with No Pickup",
    group: "Exceptions",
    description: "Loads that have not been collected yet.",
    filters: ["customer", "shippingLine"],
    columns: [
      COL.loadId,
      COL.customer,
      COL.container,
      COL.carrier,
      COL.status,
      COL.pickupCity,
      COL.lfd,
      { key: "ageDays", label: "Age (days)", type: "number" },
    ],
    filter: (params) => {
      const query = { transportStatus: { $in: NOT_YET_PICKED_UP } };
      if (params.customer) query.customer = params.customer;
      if (params.shippingLine) query.shippingLine = params.shippingLine;
      return query;
    },
    row: (load) => ({ ...baseRow(load), ageDays: daysBetween(load.createdAt) }),
    sortRows: (a, b) => (b.ageDays || 0) - (a.ageDays || 0),
  },

  {
    key: "readyForPickup",
    label: "Ready for Pickup",
    group: "Exceptions",
    description: "Loads the carrier has confirmed and which are ready to collect.",
    filters: ["customer", "carrier"],
    columns: [
      COL.loadId,
      COL.customer,
      COL.carrier,
      COL.container,
      COL.pickupCity,
      { key: "pickupDate", label: "Appointment", type: "date" },
      COL.lfd,
    ],
    filter: (params) => {
      const query = { transportStatus: "READY_TO_PICKUP" };
      if (params.customer) query.customer = params.customer;
      if (params.carrier) query["assignedFleetOwner.fleetOwnerId"] = params.carrier;
      return query;
    },
    row: (load) => ({ ...baseRow(load), pickupDate: load.pickup?.pickupDate || null }),
  },

  {
    key: "noAppointment",
    label: "Loads with No Appointment Date",
    group: "Exceptions",
    description:
      "Loads with no pickup appointment booked — nothing can be scheduled around them until there is one.",
    filters: ["customer"],
    columns: [
      COL.loadId,
      COL.customer,
      COL.container,
      COL.pickupCity,
      COL.dropCity,
      COL.status,
      COL.lfd,
      { key: "ageDays", label: "Age (days)", type: "number" },
    ],
    filter: (params) => {
      const query = {
        $or: [
          { "pickup.pickupDate": { $exists: false } },
          { "pickup.pickupDate": null },
        ],
        // Only loads still waiting to move — a delivered load with no
        // appointment on file is history, not an exception to chase.
        transportStatus: { $in: NOT_YET_PICKED_UP },
      };
      if (params.customer) query.customer = params.customer;
      return query;
    },
    row: (load) => ({ ...baseRow(load), ageDays: daysBetween(load.createdAt) }),
    sortRows: (a, b) => (b.ageDays || 0) - (a.ageDays || 0),
  },

  {
    key: "paperworkPending",
    label: "Loads with Paperwork Pending",
    group: "Exceptions",
    description:
      "Delivered loads still missing documents — these are what hold up invoicing.",
    filters: ["customer", "carrier"],
    columns: [
      COL.loadId,
      COL.customer,
      COL.carrier,
      { key: "documentCount", label: "Docs on file", type: "number" },
      { key: "missingDocs", label: "Missing" },
      { key: "deliveredAt", label: "Delivered", type: "date" },
      { key: "daysWaiting", label: "Days Waiting", type: "number" },
    ],
    filter: (params) => {
      const query = {
        $or: [
          { transportStatus: "PAPERWORK_PENDING" },
          // A delivered load with no POD is paperwork-pending in substance even
          // if nobody moved it to that status.
          {
            transportStatus: "DELIVERED",
            "documents.documentType": { $ne: "Proof of Delivery" },
          },
        ],
      };
      if (params.customer) query.customer = params.customer;
      if (params.carrier) query["assignedFleetOwner.fleetOwnerId"] = params.carrier;
      return query;
    },
    row: (load) => {
      const held = new Set((load.documents || []).map((d) => d.documentType));
      const required = ["Proof of Delivery", "Bill Of Lading"];
      const deliveredAt =
        load.completedAt || enteredStatusAt(load, "DELIVERED") || null;

      return {
        ...baseRow(load),
        documentCount: (load.documents || []).length,
        missingDocs: required.filter((d) => !held.has(d)).join(", ") || "—",
        deliveredAt,
        daysWaiting: daysBetween(deliveredAt),
      };
    },
    sortRows: (a, b) => (b.daysWaiting || 0) - (a.daysWaiting || 0),
  },

  {
    key: "invoiceable",
    label: "Invoiceable Loads",
    group: "Exceptions",
    description:
      "Delivered loads with their paperwork in and no invoice raised yet — the money waiting to be asked for.",
    filters: ["customer"],
    columns: [
      COL.loadId,
      COL.customer,
      COL.carrier,
      { key: "deliveredAt", label: "Delivered", type: "date" },
      { key: "daysSinceDelivery", label: "Days Since", type: "number" },
      { key: "total", label: "Billable", type: "money" },
    ],
    filter: (params) => {
      // Not narrowed by invoice state here — see the receivables report above.
      const query = {
        transportStatus: { $in: ["DELIVERED", "PAPERWORK_PENDING"] },
      };
      if (params.customer) query.customer = params.customer;
      return query;
    },
    enrich: withBillingState,
    postFilter: (row) => !row.invoiced,
    row: (load) => {
      const deliveredAt =
        load.completedAt || enteredStatusAt(load, "DELIVERED") || null;
      const totals = totalsFor(load.accounting?.receivables?.lines || []);

      return {
        ...baseRow(load),
        deliveredAt,
        daysSinceDelivery: daysBetween(deliveredAt),
        // Falls back to the headline amount for a load whose ledger was never
        // built out — it is still billable, and omitting it would understate
        // what is owed.
        total: totals.total || money(load.amount),
      };
    },
    sortRows: (a, b) => (b.daysSinceDelivery || 0) - (a.daysSinceDelivery || 0),
    totals: ["total"],
  },
];

const REPORT_BY_KEY = new Map(REPORTS.map((r) => [r.key, r]));

/** The catalog, without the functions — those do not survive JSON. */
const catalog = () => ({
  reports: REPORTS.map((r) => ({
    key: r.key,
    label: r.label,
    group: r.group,
    description: r.description,
    filters: r.filters || [],
    dateField: r.dateField || null,
    dateLabel: r.dateLabel || "Date",
    defaultRange: r.defaultRange || null,
    columns: r.columns,
    groupBy: r.groupBy || null,
    totals: r.totals || [],
  })),
  groups: [...new Set(REPORTS.map((r) => r.group))],
});

module.exports = {
  driverChargesFor,
  carrierChargesFor,
  REPORTS,
  REPORT_BY_KEY,
  NOT_YET_PICKED_UP,
  catalog,
  daysBetween,
  enteredStatusAt,
  money,
};
