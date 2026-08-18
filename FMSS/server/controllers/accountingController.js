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

  return {
    chargeType,
    amount: money(toNumberOrNull(raw.amount) ?? 0),
    quantity: toNumberOrNull(raw.quantity) ?? undefined,
    rate: toNumberOrNull(raw.rate) ?? undefined,
    note: trimmed(raw.note),
    // Payables only: a receivable is owed by the customer, so naming a carrier
    // on one would be meaningless.
    fleetOwnerId:
      side === "payable" && raw.fleetOwnerId ? raw.fleetOwnerId : undefined,
    addedBy: userId,
    addedAt: raw.addedAt ? new Date(raw.addedAt) : new Date(),
  };
};

/**
 * Validate a set of lines before they are stored.
 *
 * Two rules the catalog cannot express on its own: exactly one linehaul per
 * side (two "Gross Amount" rows is an editing mistake that silently doubles the
 * revenue), and a note on the lines where the amount means nothing without one.
 */
const validateLines = (lines, side) => {
  const problems = [];

  const linehauls = lines.filter(
    (l) => CHARGE_BY_KEY.get(l.chargeType)?.kind === "linehaul",
  );
  if (linehauls.length > 1) {
    problems.push(
      `Only one ${labelFor("linehaul", side)} line is allowed — combine them or move the extra onto an accessorial.`,
    );
  }

  lines.forEach((line) => {
    const spec = CHARGE_BY_KEY.get(line.chargeType);

    if (spec?.requiresNote && !line.note) {
      problems.push(`${labelFor(line.chargeType, side)}: say what the charge is for.`);
    }

    if (!spec?.repeatable) {
      const duplicates = lines.filter((l) => l.chargeType === line.chargeType);
      if (duplicates.length > 1 && duplicates[0] === line) {
        problems.push(
          `${labelFor(line.chargeType, side)} appears more than once — add the amounts together.`,
        );
      }
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
    quantity: line.quantity ?? null,
    rate: line.rate ?? null,
    note: line.note || "",
    fleetOwnerId: line.fleetOwnerId ? String(line.fleetOwnerId) : null,
    addedAt: line.addedAt,
  }));

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

  const lines = load.accounting?.payables?.lines || [];

  return legs.map((leg) => {
    const own = lines.filter(
      (line) => String(line.fleetOwnerId || "") === String(leg.fleetOwnerId),
    );

    return {
      legId: String(leg._id),
      fleetOwnerId: String(leg.fleetOwnerId),
      fleetOwnerName: leg.fleetOwnerName || "",
      fleetOwnerCode: leg.fleetOwnerCode || "",
      agreed: leg.carrierRate ?? null,
      booked: totalsFor(own).total,
      lineCount: own.length,
    };
  });
};

/** One load's books, in the shape every accounting screen reads. */
const presentAccounting = (load) => {
  const receivableLines = load.accounting?.receivables?.lines || [];
  const payableLines = load.accounting?.payables?.lines || [];

  return {
    loadId: load.loadId,
    _id: load._id,
    customerName: load.customerName || "",
    carrierName: load.assignedFleetOwner?.fleetOwnerName || "",
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
    },

    payables: {
      lines: presentLines(payableLines, "payable"),
      totals: totalsFor(payableLines),
      invoiceNumber: load.accounting?.payables?.invoiceNumber || "",
      invoicedAt: load.accounting?.payables?.invoicedAt || null,
      dueDate: load.accounting?.payables?.dueDate || null,
      paidAt: load.accounting?.payables?.paidAt || null,
      notes: load.accounting?.payables?.notes || "",
    },

    // One row per carrier leg, so a split load can be settled carrier by
    // carrier rather than as a single lump.
    carrierPayables: carrierPayables(load),

    payroll: load.accounting?.payroll || null,

    profit: profitFor({ receivableLines, payableLines }),
  };
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
      // in. Dropping it keeps the saved ledger equal to what they meant.
      .filter((line) => line && (line.amount !== 0 || line.note));

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

    const revenueTotal = totalsFor(load.accounting?.receivables?.lines || []).total;

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

    const revenueTotal = totalsFor(load.accounting?.receivables?.lines || []).total;

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

    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) {
        // Inclusive of the end date — a user asking for "to 31 March" means the
        // whole of the 31st, not up to midnight at its start.
        const to = new Date(req.query.to);
        to.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = to;
      }
    }

    if (req.query.transportStatus) {
      filter.transportStatus = req.query.transportStatus;
    }

    const loads = await Load.find(filter)
      .select(
        "loadId customerName amount transportStatus createdAt accounting assignedFleetOwner",
      )
      .sort({ createdAt: -1 })
      .lean();

    const rows = loads.map((load) => {
      const receivableLines = load.accounting?.receivables?.lines || [];
      const payableLines = load.accounting?.payables?.lines || [];
      const profit = profitFor({ receivableLines, payableLines });

      return {
        loadId: load.loadId,
        customerName: load.customerName || "",
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
        invoiced: !!load.accounting?.receivables?.invoicedAt,
        paid: !!load.accounting?.receivables?.paidAt,
      };
    });

    const sum = (key) => money(rows.reduce((acc, row) => acc + (row[key] || 0), 0));

    const revenue = sum("revenue");
    const expense = sum("expense");
    const margin = money(revenue - expense);

    // Loads with nothing billed are excluded from the average rather than
    // counted as 0% — a load nobody has invoiced yet is not a zero-margin load,
    // and averaging it in drags the figure toward a number that means nothing.
    const billed = rows.filter((row) => row.revenue > 0);

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
        averageMarginPercent: billed.length
          ? money(
              billed.reduce((acc, row) => acc + row.marginPercent, 0) / billed.length,
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

    if (req.query.from || req.query.to) {
      filter["accounting.payroll.calculatedAt"] = {};
      if (req.query.from) {
        filter["accounting.payroll.calculatedAt"].$gte = new Date(req.query.from);
      }
      if (req.query.to) {
        const to = new Date(req.query.to);
        to.setHours(23, 59, 59, 999);
        filter["accounting.payroll.calculatedAt"].$lte = to;
      }
    }

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
        customerName: load.customerName || "",
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
