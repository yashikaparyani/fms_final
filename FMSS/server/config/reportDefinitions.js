const { totalsFor, profitFor, labelFor } = require("./chargeTypes");
const { resolveTimeZone, utcFromLocal } = require("../utils/timezone");

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
    columns: [
      COL.loadId,
      COL.customer,
      { key: "invoiceNumber", label: "Invoice #" },
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
      if (params.invoiceState === "unpaid") {
        query["accounting.receivables.paidAt"] = { $exists: false };
      }
      if (params.invoiceState === "uninvoiced") {
        query["accounting.receivables.invoicedAt"] = { $exists: false };
      }
      return query;
    },
    row: (load) => {
      const totals = totalsFor(load.accounting?.receivables?.lines || []);
      return {
        ...baseRow(load),
        invoiceNumber: load.accounting?.receivables?.invoiceNumber || "",
        invoicedAt: load.accounting?.receivables?.invoicedAt || null,
        paidAt: load.accounting?.receivables?.paidAt || null,
        ...totals,
      };
    },
    totals: ["linehaul", "accessorials", "total", "settled", "balance"],
  },

  {
    key: "payables",
    label: "Payable Report",
    group: "Financial",
    description:
      "Every payable line incurred in the period — what carriers and vendors are owed.",
    filters: ["dateRange", "carrier"],
    dateField: "createdAt",
    dateLabel: "Load entered",
    columns: [
      COL.loadId,
      COL.customer,
      COL.carrier,
      { key: "linehaul", label: "Charge", type: "money" },
      { key: "accessorials", label: "Accessorials", type: "money" },
      { key: "total", label: "Total", type: "money" },
      { key: "settled", label: "Advance Paid", type: "money" },
      { key: "balance", label: "Balance Payable", type: "money" },
    ],
    filter: (params) => {
      const query = {
        "accounting.payables.lines.0": { $exists: true },
        ...dateRange("createdAt", params),
      };
      if (params.carrier) {
        query["assignedFleetOwner.fleetOwnerId"] = params.carrier;
      }
      return query;
    },
    row: (load) => ({
      ...baseRow(load),
      ...totalsFor(load.accounting?.payables?.lines || []),
    }),
    totals: ["linehaul", "accessorials", "total", "settled", "balance"],
  },

  {
    key: "driverPayable",
    label: "Driver Payable Report",
    group: "Financial",
    description:
      "What each driver is owed for the period. Marking a driver paid emails them their statement.",
    filters: ["dateRange", "driver", "settledState"],
    dateField: "accounting.payroll.calculatedAt",
    dateLabel: "Pay calculated",
    columns: [
      COL.loadId,
      COL.customer,
      { key: "driverName", label: "Driver" },
      { key: "payType", label: "Basis" },
      { key: "rate", label: "Rate" },
      { key: "payAmount", label: "Pay", type: "money" },
      { key: "settledAt", label: "Paid", type: "date" },
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
    row: (load) => ({
      ...baseRow(load),
      driver: load.accounting?.payroll?.driver || null,
      driverName: load.accounting?.payroll?.driverName || "Unassigned",
      payType: load.accounting?.payroll?.payType || "",
      rate: load.accounting?.payroll?.rate ?? "",
      miles: load.accounting?.payroll?.miles ?? null,
      hours: load.accounting?.payroll?.hours ?? null,
      payAmount: money(load.accounting?.payroll?.amount),
      settledAt: load.accounting?.payroll?.settledAt || null,
    }),
    totals: ["payAmount"],
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
      const query = {
        transportStatus: { $in: ["DELIVERED", "PAPERWORK_PENDING"] },
        "accounting.receivables.invoicedAt": { $exists: false },
      };
      if (params.customer) query.customer = params.customer;
      return query;
    },
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
  REPORTS,
  REPORT_BY_KEY,
  NOT_YET_PICKED_UP,
  catalog,
  daysBetween,
  enteredStatusAt,
  money,
};
