const mongoose = require("mongoose");
const Load = require("../models/Load");
const Driver = require("../models/Driver");
const {
  catalog,
  isValidCharge,
  totalsFor,
  profitFor,
  labelFor,
  money,
  CHARGE_BY_KEY,
} = require("../config/chargeTypes");
const audit = require("../services/auditService");
// A load carries its value in `amount` and its carrier rates on the legs long
// before anybody itemises a ledger. See services/ledgerFallback.js for why the
// obvious line is derived rather than migrated in.
const ledger = require("../services/ledgerFallback");
// Whether a load has been billed is answered by the invoice register, not by the
// date field on the load. See services/billingState.js for why those two ever
// disagreed.
const billingState = require("../services/billingState");
// Loads booked before the fix carry the literal "N/A N/A" as their customer —
// the placeholder that used to be written into both name fields. `realName`
// treats it as absent, so the column reads empty rather than wrong.
const { realName } = require("../utils/displayName");
const { routeOf, placeOf } = require("../utils/loadRoute");
// createdAt and calculatedAt are instants, so their windows are bounded by the
// business day rather than the UTC day — see utils/dates.js.
const { instantRange } = require("../utils/dates");

// ─── Accounting ───────────────────────────────────────────────────────────────
// Receivables (what the customer is billed) and payables (what the carrier and
// vendors are paid), line by line, per load — plus the payroll figure that falls
// out of them and the summaries built on top.
//
// All the arithmetic lives in config/chargeTypes.js, deliberately: totals are
// computed in exactly one place, so the load screen, the summary report and the
// payroll run cannot disagree about what a load earned. Nothing here adds up
// numbers by hand.
//
// Load is tenant-scoped, so every query is already narrowed to the active
// location.
// ─────────────────────────────────────────────────────────────────────────────

// Where a load sits once dispatch has marked it invoiceable: off the transit
// board, waiting for accounting. Mirrors ACCOUNTING_TRANSPORT_STATUSES in
// controllers/loadController.js — the two describe the same handover.
const AWAITING_INVOICE_STATUSES = ["INVOICED"];

const trimmed = (value) => String(value ?? "").trim();

const toNumberOrNull = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Clean one submitted line.
 *
 * Returns null for anything that is not a real charge on this side, so a
 * malformed row is dropped rather than stored as a line that totals to NaN and
 * poisons every figure downstream.
 */
const normalizeLine = (raw, side, userId) => {
  const chargeType = trimmed(raw?.chargeType);
  if (!isValidCharge(chargeType, side)) return null;

  // A percentage is only meaningful on a charge the catalog says may be one.
  // Anything else claiming to be a percentage is treated as the cash figure it
  // actually is, rather than silently recomputed against a base it has no
  // relationship to.
  const spec = CHARGE_BY_KEY.get(chargeType);
  const basis =
    spec?.percentOf && String(raw.basis || "").toUpperCase() === "PERCENT"
      ? "PERCENT"
      : "AMOUNT";

  return {
    chargeType,
    basis,
    // On a PERCENT line this is a placeholder — applyPercentageLines overwrites
    // it from the rate below once the whole side is known.
    amount: money(toNumberOrNull(raw.amount) ?? 0),
    quantity: toNumberOrNull(raw.quantity) ?? undefined,
    rate: toNumberOrNull(raw.rate) ?? undefined,
    note: trimmed(raw.note),
    // Payables only: a receivable is owed by the customer, so naming a carrier
    // on one would be meaningless.
    fleetOwnerId:
      side === "payable" && raw.fleetOwnerId ? raw.fleetOwnerId : undefined,

    // Same rule for the driver. `paidAt` is deliberately NOT taken from the
    // submission — see saveLedger, which carries the stored value forward.
    driverId: side === "payable" && raw.driverId ? raw.driverId : undefined,
    driverName: side === "payable" ? trimmed(raw.driverName) || undefined : undefined,

    addedBy: userId,
    addedAt: raw.addedAt ? new Date(raw.addedAt) : new Date(),
  };
};

/**
 * Turn every percentage line on a side into the cash figure it comes to.
 *
 * Run over the whole side at once because a percentage is of the side's
 * linehaul, which is only known once every line is in hand — and recomputed on
 * every save rather than trusted from the browser, so correcting a linehaul
 * from $1,000 to $1,200 moves the fuel surcharge with it instead of leaving it
 * quoting a figure that no longer follows from anything on screen.
 *
 * The percentage is deliberately NOT of the total: fuel of 18% of a total that
 * already includes the fuel is a circular definition, and whichever order the
 * lines happened to be in would decide the answer.
 */
const applyPercentageLines = (lines) => {
  const base = lines
    .filter((line) => CHARGE_BY_KEY.get(line.chargeType)?.kind === "linehaul")
    .reduce((sum, line) => sum + Number(line.amount || 0), 0);

  for (const line of lines) {
    if (line.basis !== "PERCENT") continue;
    line.amount = money((base * (Number(line.rate) || 0)) / 100);
  }

  return lines;
};

/**
 * Who a line is owed to, as a grouping key.
 *
 * Only ever meaningful on payables. The whole receivable side is one bill to
 * one customer, so every line falls into a single bucket, which is the same
 * thing as not grouping at all.
 *
 * The driver wins over the carrier where a line names one. Two drivers on the
 * same leg are two people, each owed their own pay and each capable of running
 * up their own detention — bucketing them together refused the second driver's
 * line as a duplicate of the first's, which is a real charge being called an
 * editing mistake. Matches payeeKeyOf in the payables editor, so what the
 * screen groups under a name is what is validated under it.
 */
const payeeKey = (line) =>
  line.driverId
    ? `driver:${String(line.driverId)}`
    : `carrier:${String(line.fleetOwnerId || "")}`;

/**
 * Validate a set of lines before they are stored.
 *
 * Two rules the catalog cannot express on its own: one linehaul per payee (two
 * "Gross Amount" rows on one bill is an editing mistake that silently doubles
 * the revenue), and a note on the lines where the amount means nothing without
 * one.
 *
 * ── Per payee, not per side ─────────────────────────────────────────────────
 * The uniqueness rules are scoped to the carrier the line names, because a load
 * split between two carriers genuinely has two base charges — one per leg, each
 * becoming its own bill — and they are not a mistake to be combined. Enforcing
 * them across the whole side refuses the entire payable ledger of any split
 * load, which then falls back to the agreed leg rate and quietly loses every
 * accessorial anybody costed.
 *
 * On a receivable side and on a single-carrier payable side nothing names a
 * carrier, so every line lands in one bucket and the rule behaves exactly as it
 * did before.
 */
const validateLines = (lines, side) => {
  const problems = [];

  const byPayee = new Map();
  lines.forEach((line) => {
    const key = payeeKey(line);
    if (!byPayee.has(key)) byPayee.set(key, []);
    byPayee.get(key).push(line);
  });

  byPayee.forEach((own) => {
    const linehauls = own.filter(
      (l) => CHARGE_BY_KEY.get(l.chargeType)?.kind === "linehaul",
    );
    if (linehauls.length > 1) {
      problems.push(
        `Only one ${labelFor("linehaul", side)} line is allowed for the same carrier or driver — combine them or move the extra onto an accessorial.`,
      );
    }

    own.forEach((line) => {
      const spec = CHARGE_BY_KEY.get(line.chargeType);

      if (!spec?.repeatable) {
        const duplicates = own.filter((l) => l.chargeType === line.chargeType);
        if (duplicates.length > 1 && duplicates[0] === line) {
          problems.push(
            `${labelFor(line.chargeType, side)} appears more than once — add the amounts together.`,
          );
        }
      }
    });
  });

  lines.forEach((line) => {
    const spec = CHARGE_BY_KEY.get(line.chargeType);

    if (spec?.requiresNote && !line.note) {
      problems.push(`${labelFor(line.chargeType, side)}: say what the charge is for.`);
    }

    if (line.amount < 0) {
      // A negative charge is somebody trying to express a credit. It works
      // arithmetically and then quietly breaks every report that assumes
      // revenue is positive, so it is refused with the alternative named.
      problems.push(
        `${labelFor(line.chargeType, side)}: amounts cannot be negative. Record a credit as a reduced ${labelFor("linehaul", side)} or note it against the advance.`,
      );
    }
  });

  return problems;
};

/** Lines in the shape the UI wants, with their labels resolved. */
const presentLines = (lines = [], side) =>
  lines.map((line) => ({
    chargeType: line.chargeType,
    label: labelFor(line.chargeType, side),
    kind: CHARGE_BY_KEY.get(line.chargeType)?.kind || "accessorial",
    amount: line.amount,
    basis: line.basis || "AMOUNT",
    quantity: line.quantity ?? null,
    rate: line.rate ?? null,
    note: line.note || "",
    fleetOwnerId: line.fleetOwnerId ? String(line.fleetOwnerId) : null,
    driverId: line.driverId ? String(line.driverId) : null,
    driverName: line.driverName || "",
    paidAt: line.paidAt || null,
    addedAt: line.addedAt,
  }));

/**
 * The stretch one leg of the load covers, as two ends.
 *
 * A payee on a split load is paid for their part of the move, not for the load,
 * and "Newark, NJ → Harrisburg, PA" is how the office recognises whose part it
 * was — two carriers on one load are otherwise two identical rows of money.
 *
 * Falls back to the load's own route where a leg has no ends of its own: a
 * handover is often agreed on the phone and never typed in, and the load's
 * route is the honest answer to "where did this go" when nothing narrower was
 * recorded. City and state only, exactly as everywhere else — see loadRoute.js.
 */
const legRoute = (from, to, load) => {
  const whole = routeOf(load);
  return {
    from: placeOf(from) || whole.from,
    to: placeOf(to) || whole.to,
  };
};

/**
 * What each carrier on a split load is owed.
 *
 * Built from the legs rather than from the ledger, so a carrier who has been
 * assigned but not yet costed shows as $0 owed instead of being missing — the
 * gap is the thing the office needs to see. `carrierRate` on the leg is the
 * agreed figure; the ledger lines are what has actually been booked against it.
 */
const carrierPayables = (load) => {
  const legs = load.assignments || [];
  if (!legs.length) return [];

  const lines = ledger.payableLinesFor(load);

  return legs.map((leg) => {
    const own = lines.filter(
      (line) => String(line.fleetOwnerId || "") === String(leg.fleetOwnerId),
    );

    return {
      legId: String(leg._id),
      fleetOwnerId: String(leg.fleetOwnerId),
      fleetOwnerName: leg.fleetOwnerName || "",
      fleetOwnerCode: leg.fleetOwnerCode || "",
      // Which stretch they ran, so the money reads as payment for a move
      // rather than as a name with a number beside it.
      ...legRoute(leg.origin, leg.destination, load),
      agreed: leg.carrierRate ?? null,
      booked: totalsFor(own).total,
      lineCount: own.length,
    };
  });
};

/**
 * What each driver on this load is owed, and whether they have had it.
 *
 * Built from the load's own driver assignments rather than from the ledger, for
 * the same reason carrierPayables is built from the legs: a driver who ran the
 * load and has not been costed yet shows as $0 owed instead of being absent,
 * and the gap is the thing the office needs to see.
 *
 * Drivers who only appear on the ledger are added on the end. That happens when
 * somebody is taken off the load after being costed, and money already booked
 * against a name must not disappear from the screen that pays it — it is
 * exactly the row somebody needs to look at and correct.
 *
 * A driver counts as paid when every line owed to them is. Half-paid is
 * reported as unpaid, because "paid" on a settlement screen has to mean the
 * whole figure went out.
 */
const driverPayables = (load) => {
  const lines = ledger
    .payableLinesFor(load)
    .filter((line) => line.driverId);

  const rows = new Map();

  for (const assignment of load.driverAssignments || []) {
    if (!assignment.driver) continue;
    rows.set(String(assignment.driver), {
      driverId: String(assignment.driver),
      driverName: assignment.driverName || "",
      driverCode: assignment.driverCode || "",
      fleetOwnerId: assignment.fleetOwnerId ? String(assignment.fleetOwnerId) : null,
      // The driver's own leg — where they took the box from and where they put
      // it down. Two drivers on one load ran two different stretches for two
      // different amounts, and the stretch is what tells them apart.
      ...legRoute(assignment.pickup, assignment.drop, load),
      amount: 0,
      lineCount: 0,
      paidLineCount: 0,
      paidAt: null,
      onLoad: true,
    });
  }

  for (const line of lines) {
    const key = String(line.driverId);

    if (!rows.has(key)) {
      rows.set(key, {
        driverId: key,
        driverName: line.driverName || "",
        driverCode: "",
        fleetOwnerId: null,
        // Off the load, so there is no leg of their own left to read.
        from: "",
        to: "",
        amount: 0,
        lineCount: 0,
        paidLineCount: 0,
        paidAt: null,
        // Costed, but no longer one of the load's drivers.
        onLoad: false,
      });
    }

    const row = rows.get(key);
    row.amount = money(row.amount + Number(line.amount || 0));
    row.lineCount += 1;
    if (!row.driverName && line.driverName) row.driverName = line.driverName;

    if (line.paidAt) {
      row.paidLineCount += 1;
      // The last payment against them is when they were settled.
      if (!row.paidAt || new Date(line.paidAt) > new Date(row.paidAt)) {
        row.paidAt = line.paidAt;
      }
    }
  }

  return [...rows.values()].map((row) => ({
    ...row,
    paid: row.lineCount > 0 && row.paidLineCount === row.lineCount,
    // Nothing booked against them yet. Distinct from unpaid: there is no figure
    // to pay, so the screen offers costing rather than a Pay button.
    uncosted: row.lineCount === 0,
  }));
};

/** One load's books, in the shape every accounting screen reads. */
const presentAccounting = (load) => {
  // Stored lines if anybody has itemised the load, otherwise the base amount and
  // the carrier rates it already carries — see services/ledgerFallback.js.
  const receivableLines = ledger.receivableLinesFor(load);
  const payableLines = ledger.payableLinesFor(load);

  return {
    loadId: load.loadId,
    _id: load._id,
    customerName: realName(load.customerName),
    carrierName: load.assignedFleetOwner?.fleetOwnerName || "",
    // The carrier itself, so a load with no legs to list can still have its
    // payables grouped under the one carrier they are owed to. `carrierPayables`
    // below is per leg and is empty on a load that was never split.
    carrierId: load.assignedFleetOwner?.fleetOwnerId
      ? String(load.assignedFleetOwner.fleetOwnerId)
      : null,
    // Where the job went. The heading on this screen used to read
    // "customer → carrier", which looks like a route and is not one — the arrow
    // between two company names invited it to be read as a move from one to the
    // other. See utils/loadRoute.js.
    route: routeOf(load),
    transportStatus: load.transportStatus,
    amount: load.amount,

    receivables: {
      lines: presentLines(receivableLines, "receivable"),
      totals: totalsFor(receivableLines),
      invoiceNumber: load.accounting?.receivables?.invoiceNumber || "",
      invoicedAt: load.accounting?.receivables?.invoicedAt || null,
      dueDate: load.accounting?.receivables?.dueDate || null,
      paidAt: load.accounting?.receivables?.paidAt || null,
      notes: load.accounting?.receivables?.notes || "",
      // True when these figures come from the load rather than from a ledger
      // somebody saved. The screen labels them; nothing else behaves differently.
      derived: ledger.isDerived(load, "receivable"),
    },

    payables: {
      lines: presentLines(payableLines, "payable"),
      totals: totalsFor(payableLines),
      invoiceNumber: load.accounting?.payables?.invoiceNumber || "",
      invoicedAt: load.accounting?.payables?.invoicedAt || null,
      dueDate: load.accounting?.payables?.dueDate || null,
      paidAt: load.accounting?.payables?.paidAt || null,
      notes: load.accounting?.payables?.notes || "",
      derived: ledger.isDerived(load, "payable"),
    },

    // One row per carrier leg, so a split load can be settled carrier by
    // carrier rather than as a single lump.
    carrierPayables: carrierPayables(load),

    // The same, per driver — see driverPayables.
    driverPayables: driverPayables(load),

    payroll: load.accounting?.payroll || null,

    profit: profitFor({ receivableLines, payableLines }),
  };
};

// @desc    Mark one driver's pay on a load as paid, or put it back
// @route   PUT /api/accounting/loads/:loadId/payables/drivers/:driverId/pay
// @access  Private (staff, admin)
//
// Per driver rather than per line: the office pays a person, not a fuel row, and
// two drivers on the same load are settled on their own days. Every payable line
// owed to that driver moves together, so a driver is never half-paid — see
// driverPayables, which reports anything short of all of them as unpaid.
//
// A toggle rather than a one-way stamp. Marking the wrong driver paid on a
// Friday afternoon is an ordinary mistake, and the alternative to undoing it
// here is editing the database.
const payDriver = async (req, res) => {
  try {
    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) return res.status(404).json({ message: "Load not found" });

    const driverId = String(req.params.driverId || "");
    const stored = load.accounting?.payables?.lines || [];

    const owed = stored.filter(
      (line) => String(line.driverId || "") === driverId,
    );

    if (!owed.length) {
      return res.status(400).json({
        message:
          "There is nothing on this load's payables for that driver yet. Add their charge and save it first.",
        code: "DRIVER_NOT_COSTED",
      });
    }

    // What the caller is asking for. Sent explicitly rather than inferred, so
    // two people on the screen at once cannot toggle each other's change back.
    const paid =
      req.body.paid === undefined
        ? !owed.every((line) => line.paidAt)
        : Boolean(req.body.paid);

    const now = new Date();
    for (const line of owed) {
      line.paidAt = paid ? now : undefined;
      line.paidBy = paid ? req.user._id : undefined;
    }

    load.markModified("accounting.payables");
    await load.save();

    const amount = money(
      owed.reduce((sum, line) => sum + Number(line.amount || 0), 0),
    );
    const driverName = owed.find((line) => line.driverName)?.driverName || "the driver";

    // Money leaving the business is the thing that gets disputed, so it goes on
    // the trail with the figure and the name rather than as "payables changed".
    await audit
      .recordFinancial({
        load,
        action: paid ? "accounting.driver_paid" : "accounting.driver_unpaid",
        summary: paid
          ? `Driver pay of $${amount.toLocaleString("en-US")} marked paid to ${driverName}`
          : `Driver pay of $${amount.toLocaleString("en-US")} to ${driverName} put back to unpaid`,
        user: req.user,
        req,
      })
      .catch((error) =>
        console.error(`Driver pay audit failed for ${load.loadId}:`, error.message),
      );

    res.json({
      message: paid
        ? `Marked $${amount.toLocaleString("en-US")} paid to ${driverName}.`
        : `${driverName}'s pay is outstanding again.`,
      accounting: presentAccounting(load),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Set what one driver is paid on a load
// @route   PUT /api/accounting/loads/:loadId/payables/drivers/:driverId/amount
// @access  Private (staff, admin)
//
// The Driver Payments table on the load's own page, so the office can put a
// figure against a driver and pay them without opening the ledger editor —
// including on a box parked in the yard for weeks, whose driver is owed long
// before anybody bills the customer. Nothing about the load's status changes.
//
// Writes the driver's Driver Pay line on the payables, the same line the
// ledger editor would, so the two screens can never show different figures.
// Any other charges booked to the driver (fuel, a lumper) are left alone. On a
// load nobody has itemised, the derived carrier lines are written out first, or
// storing this one line would silently drop the carrier's rate.
//
// Refused once the driver is paid: changing a figure that money already moved
// against is how the ledger and the bank stop agreeing. Mark it unpaid first.
const setDriverPay = async (req, res) => {
  try {
    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) return res.status(404).json({ message: "Load not found" });

    const driverId = String(req.params.driverId || "");
    const amount = toNumberOrNull(req.body.amount);

    if (amount === null || amount < 0) {
      return res.status(400).json({ message: "Enter the driver's amount — a number, $0 or more." });
    }

    const assignment = (load.driverAssignments || []).find(
      (a) => String(a.driver || "") === driverId,
    );
    const stored = load.accounting?.payables?.lines || [];
    const theirs = stored.filter((line) => String(line.driverId || "") === driverId);

    if (!assignment && !theirs.length) {
      return res.status(400).json({ message: "That driver is not on this load." });
    }

    if (theirs.some((line) => line.paidAt)) {
      return res.status(400).json({
        message: "This driver is already paid. Mark them unpaid first to change the amount.",
        code: "DRIVER_ALREADY_PAID",
      });
    }

    // Stored lines as they are, or the derived ones made real.
    const base = stored.length
      ? stored.map((line) => (line.toObject ? line.toObject() : { ...line }))
      : ledger.payableLinesFor(load).map(({ derived, ...line }) => ({
          ...line,
          addedBy: req.user._id,
          addedAt: new Date(),
        }));

    const driverName = assignment?.driverName || theirs.find((l) => l.driverName)?.driverName || "";
    const isTheirPayLine = (line) =>
      String(line.driverId || "") === driverId && line.chargeType === "driverPay";

    const previous = money(
      base.filter(isTheirPayLine).reduce((sum, line) => sum + Number(line.amount || 0), 0),
    );

    // One Driver Pay line for them, carrying the new figure. $0 removes it.
    const lines = base.filter((line) => !isTheirPayLine(line));
    if (amount > 0) {
      lines.push(
        normalizeLine(
          { chargeType: "driverPay", amount, driverId, driverName, note: trimmed(req.body.note) },
          "payable",
          req.user._id,
        ),
      );
    }

    const problems = validateLines(lines, "payable");
    if (problems.length) {
      return res.status(400).json({ message: problems[0], problems });
    }

    load.accounting = load.accounting || {};
    load.accounting.payables = {
      ...(load.accounting.payables?.toObject?.() || load.accounting.payables || {}),
      lines,
      updatedBy: req.user._id,
    };
    load.markModified("accounting.payables");
    await load.save();

    const name = driverName || "the driver";
    if (previous !== money(amount)) {
      await audit
        .recordFinancial({
          load,
          action: "accounting.driver_pay_set",
          summary: `Driver pay for ${name} changed from $${previous.toLocaleString("en-US")} to $${money(amount).toLocaleString("en-US")}`,
          changes: [
            {
              field: "accounting.payables.driverPay",
              label: `Driver Pay — ${name}`,
              from: `$${previous.toLocaleString("en-US")}`,
              to: `$${money(amount).toLocaleString("en-US")}`,
            },
          ],
          user: req.user,
          req,
        })
        .catch((error) =>
          console.error(`Driver pay audit failed for ${load.loadId}:`, error.message),
        );
    }

    res.json({
      message: amount > 0
        ? `${name}'s pay set to $${money(amount).toLocaleString("en-US")}.`
        : `${name}'s pay removed.`,
      accounting: presentAccounting(load),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    The charge catalog both ledgers are built from
// @route   GET /api/accounting/catalog
// @access  Private (staff, admin)
const getCatalog = async (req, res) => {
  try {
    res.json(catalog());
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    One load's receivables, payables, payroll and margin
// @route   GET /api/accounting/loads/:loadId
// @access  Private (staff, admin)
const getLoadAccounting = async (req, res) => {
  try {
    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) return res.status(404).json({ message: "Load not found" });

    res.json(presentAccounting(load));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Replace one side's lines wholesale.
 *
 * A whole-ledger replace rather than per-line edits: the screen is a form the
 * user edits as a unit and saves once, and patching individual lines would need
 * stable line ids for something nobody ever links to.
 */
const saveLedger = (side) => async (req, res) => {
  try {
    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) return res.status(404).json({ message: "Load not found" });

    const submitted = Array.isArray(req.body.lines) ? req.body.lines : [];

    const lines = submitted
      .map((raw) => normalizeLine(raw, side, req.user._id))
      // A zero-amount line with no note is an empty row the user never filled
      // in — but a percentage line is judged on its rate, not on the amount,
      // which has not been worked out yet at this point.
      .filter(
        (line) =>
          line &&
          (line.basis === "PERCENT" ? Number(line.rate) > 0 : line.amount !== 0 || line.note),
      );

    applyPercentageLines(lines);

    // ── Paying somebody is not an edit to the ledger ────────────────────────
    // The screen submits the whole side every time, so a save would otherwise
    // wipe `paidAt` off every line — an admin correcting a fuel figure would
    // silently un-pay a driver who was settled last week. Payment state is
    // therefore never read from the submission: it is carried forward from what
    // is stored, keyed by driver, and only the pay endpoint changes it.
    if (side === "payable") {
      const paidByDriver = new Map();

      for (const stored of load.accounting?.payables?.lines || []) {
        if (stored.driverId && stored.paidAt) {
          paidByDriver.set(String(stored.driverId), {
            paidAt: stored.paidAt,
            paidBy: stored.paidBy,
          });
        }
      }

      for (const line of lines) {
        const settled = line.driverId && paidByDriver.get(String(line.driverId));
        if (settled) {
          line.paidAt = settled.paidAt;
          line.paidBy = settled.paidBy;
        }
      }
    }

    const problems = validateLines(lines, side);
    if (problems.length) {
      return res.status(400).json({ message: problems[0], problems });
    }

    load.accounting = load.accounting || {};
    const key = side === "receivable" ? "receivables" : "payables";

    // Captured before the replace, for the audit entry below.
    const before = totalsFor(load.accounting[key]?.lines || []);

    load.accounting[key] = {
      ...(load.accounting[key]?.toObject?.() || load.accounting[key] || {}),
      lines,
      currency: trimmed(req.body.currency) || "USD",
      invoiceNumber: trimmed(req.body.invoiceNumber),
      invoicedAt: req.body.invoicedAt || undefined,
      dueDate: req.body.dueDate || undefined,
      paidAt: req.body.paidAt || undefined,
      notes: trimmed(req.body.notes),
      updatedBy: req.user._id,
    };

    load.markModified(`accounting.${key}`);

    // `amount` is re-derived from the receivables by the model's own hook, so
    // the headline figure on every other screen follows the invoice.
    await load.save();

    // Money is what gets disputed, so the trail records the movement rather
    // than just "the ledger was saved" — the before and after totals are the
    // two numbers anybody asking about it wants.
    const after = totalsFor(lines);
    if (before.total !== after.total || before.settled !== after.settled) {
      await audit.recordFinancial({
        load,
        action: `accounting.${key}_saved`,
        summary:
          before.total === after.total
            ? `${side === "receivable" ? "Receivables" : "Payables"} advance changed from $${before.settled.toLocaleString("en-US")} to $${after.settled.toLocaleString("en-US")}`
            : `${side === "receivable" ? "Receivables" : "Payables"} total changed from $${before.total.toLocaleString("en-US")} to $${after.total.toLocaleString("en-US")}`,
        changes: [
          {
            field: `accounting.${key}.total`,
            label: side === "receivable" ? "Billed Total" : "Payable Total",
            from: `$${before.total.toLocaleString("en-US")}`,
            to: `$${after.total.toLocaleString("en-US")}`,
          },
        ],
        user: req.user,
        req,
      });
    }

    res.json({
      message: `${side === "receivable" ? "Receivables" : "Payables"} saved.`,
      accounting: presentAccounting(load),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * What a driver is owed for a load, from their own pay setting.
 *
 * Exported because the load screen wants to preview the figure before anybody
 * commits to it, and previewing with different arithmetic from the save is how
 * the preview and the payment end up disagreeing.
 */
const calculatePayroll = ({ payType, rate, revenueTotal, miles, hours }) => {
  const value = Number(rate) || 0;

  switch (payType) {
    case "PERCENTAGE":
      // Of revenue, not of margin: a percentage driver is paid on what the load
      // billed, and paying on margin would make their wage depend on costs they
      // do not control.
      return money((revenueTotal * value) / 100);
    case "FLAT":
      return money(value);
    case "PER_MILE":
      return money(value * (Number(miles) || 0));
    case "HOURLY":
      return money(value * (Number(hours) || 0));
    default:
      return 0;
  }
};

// @desc    Work out and store the driver's pay for a load
// @route   PUT /api/accounting/loads/:loadId/payroll
// @access  Private (staff, admin)
const savePayroll = async (req, res) => {
  try {
    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) return res.status(404).json({ message: "Load not found" });

    const driverId = trimmed(req.body.driver);

    let driver = null;
    if (driverId) {
      if (!mongoose.isValidObjectId(driverId)) {
        return res.status(400).json({ message: "Not a valid driver id." });
      }
      driver = await Driver.findById(driverId);
      if (!driver) {
        return res.status(404).json({ message: "Driver not found at this location." });
      }
    }

    // The request wins over the driver's default, so a one-off arrangement on a
    // particular load can be recorded without editing the driver's standing rate.
    const payType = trimmed(req.body.payType) || driver?.payType || "";
    const rate =
      toNumberOrNull(req.body.rate) ?? (driver ? driver.payRate : null) ?? 0;

    if (!payType) {
      return res.status(400).json({
        message:
          "Choose how this driver is paid, or set a pay type on their driver record.",
      });
    }

    const miles = toNumberOrNull(req.body.miles) ?? 0;
    const hours = toNumberOrNull(req.body.hours) ?? 0;

    if (payType === "PER_MILE" && !miles) {
      return res
        .status(400)
        .json({ message: "Enter the miles for a per-mile driver." });
    }
    if (payType === "HOURLY" && !hours) {
      return res.status(400).json({ message: "Enter the hours for an hourly driver." });
    }

    const revenueTotal = totalsFor(ledger.receivableLinesFor(load)).total;

    const amount = calculatePayroll({ payType, rate, revenueTotal, miles, hours });

    const previousPay = load.accounting?.payroll?.amount;

    load.accounting = load.accounting || {};
    load.accounting.payroll = {
      driver: driver?._id,
      driverName: driver?.name || trimmed(req.body.driverName),
      payType,
      rate,
      miles: miles || undefined,
      hours: hours || undefined,
      amount,
      calculatedAt: new Date(),
      calculatedBy: req.user._id,
      note: trimmed(req.body.note),
      settledAt: req.body.settledAt || undefined,
    };

    load.markModified("accounting.payroll");
    await load.save();

    await audit.recordFinancial({
      load,
      action: "accounting.payroll_set",
      summary: `Driver pay set to $${amount.toLocaleString("en-US")}${
        load.accounting.payroll.driverName
          ? ` for ${load.accounting.payroll.driverName}`
          : ""
      }`,
      changes: [
        {
          field: "accounting.payroll.amount",
          label: "Driver Pay",
          from: `$${(previousPay || 0).toLocaleString("en-US")}`,
          to: `$${amount.toLocaleString("en-US")}`,
        },
      ],
      user: req.user,
      req,
    });

    res.json({
      message: `Driver pay for ${load.loadId} set to $${amount.toLocaleString("en-US")}.`,
      accounting: presentAccounting(load),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Preview a payroll figure without storing it
// @route   POST /api/accounting/loads/:loadId/payroll/preview
// @access  Private (staff, admin)
const previewPayroll = async (req, res) => {
  try {
    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) return res.status(404).json({ message: "Load not found" });

    const revenueTotal = totalsFor(ledger.receivableLinesFor(load)).total;

    let driver = null;
    if (trimmed(req.body.driver) && mongoose.isValidObjectId(req.body.driver)) {
      driver = await Driver.findById(req.body.driver);
    }

    const payType = trimmed(req.body.payType) || driver?.payType || "";
    const rate = toNumberOrNull(req.body.rate) ?? driver?.payRate ?? 0;

    res.json({
      payType,
      rate,
      revenueTotal,
      amount: calculatePayroll({
        payType,
        rate,
        revenueTotal,
        miles: toNumberOrNull(req.body.miles) ?? 0,
        hours: toNumberOrNull(req.body.hours) ?? 0,
      }),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Revenue, expense and margin across loads
// @route   GET /api/accounting/summary
// @access  Private (staff, admin)
//
// Computed in the application rather than as an aggregation pipeline: the
// arithmetic lives in config/chargeTypes.js, and reimplementing "an advance is
// not revenue" in Mongo's expression language would be a second copy of the one
// rule that must never differ between two places.
const getSummary = async (req, res) => {
  try {
    const filter = {};

    // Inclusive of the end date — a user asking for "to 31 March" means the
    // whole of the 31st, not up to midnight at its start.
    const created = instantRange(req.query.from, req.query.to);
    if (created) filter.createdAt = created;

    if (req.query.transportStatus) {
      filter.transportStatus = req.query.transportStatus;
    }

    // The awaiting-invoice queue: loads dispatch has handed over, minus the ones
    // already billed. Asked for by name rather than by the caller passing a
    // transport status and filtering the answer itself, because "has this been
    // billed" is a question about the invoice register and the client has no
    // business knowing that.
    const awaitingInvoice = String(req.query.awaitingInvoice) === "true";
    if (awaitingInvoice) filter.transportStatus = { $in: AWAITING_INVOICE_STATUSES };

    const loads = await Load.find(filter)
      .select(
        // vendorRate, winningBid and assignments are read by ledgerFallback to
        // derive the payable side of a load nobody has itemised. Omitting them
        // does not error — the fields are just absent on the lean document, and
        // every such load reports $0 expense and a 100% margin.
        "loadId customerName amount vendorRate winningBid assignments transportStatus createdAt accounting assignedFleetOwner",
      )
      .sort({ createdAt: -1 })
      .lean();

    // One query for the page, not one per row.
    const billing = await billingState.arStateFor(loads.map((load) => load.loadId));

    let rows = loads.map((load) => {
      const receivableLines = ledger.receivableLinesFor(load);
      const payableLines = ledger.payableLinesFor(load);
      const profit = profitFor({ receivableLines, payableLines });
      const billed = billingState.stateOf(load, billing);

      return {
        loadId: load.loadId,
        customerName: realName(load.customerName),
        carrierName: load.assignedFleetOwner?.fleetOwnerName || "",
        transportStatus: load.transportStatus,
        createdAt: load.createdAt,
        revenue: profit.revenue.total,
        outstanding: profit.revenue.balance,
        expense: profit.expense.total,
        payable: profit.expense.balance,
        driverPay: load.accounting?.payroll?.amount || 0,
        margin: profit.margin,
        marginPercent: profit.marginPercent,
        invoiced: billed.invoiced,
        paid: billed.paid,
        // So the row can link straight to the document rather than making the
        // user search the register for a number they can already see.
        invoiceNumber: billed.invoiceNumber,
        invoicedAt: billed.invoicedAt,
      };
    });

    // Filtered here rather than in the query: the answer lives in another
    // collection, and the totals below have to describe the rows that survive.
    if (awaitingInvoice) rows = rows.filter((row) => !row.invoiced);

    const sum = (key) => money(rows.reduce((acc, row) => acc + (row[key] || 0), 0));

    const revenue = sum("revenue");
    const expense = sum("expense");
    const margin = money(revenue - expense);

    // Loads with no revenue on them are excluded from the average rather than
    // counted as 0% — a load nobody has priced yet is not a zero-margin load,
    // and averaging it in drags the figure toward a number that means nothing.
    const earning = rows.filter((row) => row.revenue > 0);

    // Distinct from `earning`, and it was not always: this figure is captioned
    // "n of m billed" on the summary screen, so it has to count loads that have
    // actually been invoiced rather than loads that have a price on them. Those
    // two sets differ by exactly the backlog the caption exists to show.
    const billed = rows.filter((row) => row.invoiced);

    res.json({
      totals: {
        loads: rows.length,
        billedLoads: billed.length,
        revenue,
        expense,
        margin,
        marginPercent: revenue > 0 ? money((margin / revenue) * 100) : 0,
        outstandingReceivable: sum("outstanding"),
        outstandingPayable: sum("payable"),
        driverPay: sum("driverPay"),
        averageMarginPercent: earning.length
          ? money(
              earning.reduce((acc, row) => acc + row.marginPercent, 0) / earning.length,
            )
          : 0,
      },
      rows,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    What each driver earned over a period
// @route   GET /api/accounting/payroll
// @access  Private (staff, admin)
const getPayrollRun = async (req, res) => {
  try {
    const filter = { "accounting.payroll.amount": { $gt: 0 } };

    const calculated = instantRange(req.query.from, req.query.to);
    if (calculated) filter["accounting.payroll.calculatedAt"] = calculated;

    if (String(req.query.unsettledOnly) === "true") {
      filter["accounting.payroll.settledAt"] = { $exists: false };
    }

    const loads = await Load.find(filter)
      .select("loadId customerName createdAt accounting")
      .sort({ "accounting.payroll.calculatedAt": -1 })
      .lean();

    // Grouped by driver, because a payroll run is paid per person, not per load.
    const byDriver = new Map();

    loads.forEach((load) => {
      const payroll = load.accounting.payroll;
      const key = String(payroll.driver || payroll.driverName || "unassigned");

      if (!byDriver.has(key)) {
        byDriver.set(key, {
          driver: payroll.driver || null,
          driverName: payroll.driverName || "Unassigned",
          loads: [],
          total: 0,
          settled: 0,
          unsettled: 0,
        });
      }

      const row = byDriver.get(key);
      const amount = payroll.amount || 0;

      row.loads.push({
        loadId: load.loadId,
        customerName: realName(load.customerName),
        payType: payroll.payType,
        rate: payroll.rate,
        miles: payroll.miles || null,
        hours: payroll.hours || null,
        amount,
        calculatedAt: payroll.calculatedAt,
        settledAt: payroll.settledAt || null,
      });

      row.total = money(row.total + amount);
      if (payroll.settledAt) row.settled = money(row.settled + amount);
      else row.unsettled = money(row.unsettled + amount);
    });

    const drivers = [...byDriver.values()].sort((a, b) => b.total - a.total);

    res.json({
      totals: {
        drivers: drivers.length,
        loads: loads.length,
        total: money(drivers.reduce((acc, d) => acc + d.total, 0)),
        settled: money(drivers.reduce((acc, d) => acc + d.settled, 0)),
        unsettled: money(drivers.reduce((acc, d) => acc + d.unsettled, 0)),
      },
      drivers,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mark a load's driver pay as settled
// @route   PUT /api/accounting/loads/:loadId/payroll/settle
// @access  Private (staff, admin)
const settlePayroll = async (req, res) => {
  try {
    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) return res.status(404).json({ message: "Load not found" });

    if (!load.accounting?.payroll?.amount) {
      return res
        .status(400)
        .json({ message: "There is no driver pay on this load to settle." });
    }

    load.accounting.payroll.settledAt =
      req.body.settledAt === null ? undefined : new Date(req.body.settledAt || Date.now());
    load.markModified("accounting.payroll");
    await load.save();

    res.json({
      message: load.accounting.payroll.settledAt
        ? `Driver pay for ${load.loadId} marked settled.`
        : `Driver pay for ${load.loadId} reopened.`,
      accounting: presentAccounting(load),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  payDriver,
  setDriverPay,
  getCatalog,
  getLoadAccounting,
  saveReceivables: saveLedger("receivable"),
  savePayables: saveLedger("payable"),
  savePayroll,
  previewPayroll,
  settlePayroll,
  getSummary,
  getPayrollRun,
  calculatePayroll,
  presentAccounting,
};
