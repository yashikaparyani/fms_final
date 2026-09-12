const Load = require("../models/Load");
const Driver = require("../models/Driver");
const FleetOwner = require("../models/FleetOwner");
const User = require("../models/User");
const {
  REPORT_BY_KEY,
  catalog,
  money,
} = require("../config/reportDefinitions");
const {
  sendDriverPaymentStatement,
  sendDriverAccountStatement,
  sendCarrierAccountStatement,
} = require("../services/emailService");
const audit = require("../services/auditService");

// ─── Report generation ────────────────────────────────────────────────────────
// One runner for every report in config/reportDefinitions.js. The reports differ
// only in which loads they select, which columns they show and how they total,
// so filtering, sorting, grouping, totals and CSV export are implemented here
// once and behave identically across all of them.
//
// Nothing is cached. Every run queries the live Load collection and totals
// through the same config/chargeTypes.js the accounting screens use — a report
// that disagrees with the load it describes is worse than no report.
//
// Load is tenant-scoped, so every report is already narrowed to the caller's
// active location without asking.
// ─────────────────────────────────────────────────────────────────────────────

const trimmed = (value) => String(value ?? "").trim();

/** Filter values off the query string, normalised. */
const paramsFrom = (query) => ({
  from: trimmed(query.from) || null,
  to: trimmed(query.to) || null,
  // The dates on a report are calendar days in the reader's timezone. The
  // client sends its IANA zone the same way the dashboards do; UTC is the
  // fallback rather than server-local, so an unconfigured client is at least
  // predictable.
  timeZone: trimmed(query.tz) || "UTC",
  customer: trimmed(query.customer) || null,
  carrier: trimmed(query.carrier) || null,
  driver: trimmed(query.driver) || null,
  shippingLine: trimmed(query.shippingLine) || null,
  status: trimmed(query.status) || null,
  invoiceState: trimmed(query.invoiceState) || null,
  settledState: trimmed(query.settledState) || null,
});

/**
 * Run one report.
 *
 * Returns the rows, the totals, and — when the report declares a `groupBy` — the
 * same rows collected under their group with per-group subtotals. Grouping is
 * done here rather than in Mongo because the row shapes are computed in
 * JavaScript (margins, days in yard) and a pipeline would need a second
 * implementation of arithmetic that must not differ.
 */
const runReport = async (key, params) => {
  const report = REPORT_BY_KEY.get(key);
  if (!report) {
    throw Object.assign(new Error(`Unknown report "${key}".`), { status: 404 });
  }

  const filter = report.filter ? report.filter(params) : {};

  const loads = await Load.find(filter)
    .select(
      "loadId customerName customer refNo bookingNo containerNo shippingLine " +
        "transportStatus status amount lastFreeDate createdAt updatedAt completedAt " +
        "pickup drop assignedFleetOwner assignments accounting documents transportStatusHistory",
    )
    .sort({ createdAt: -1 })
    .lean();

  // A report may return several rows for one load — the payable report gives
  // each carrier on a split load their own.
  let rows = loads.flatMap((load) => {
    const out = report.row(load);
    return Array.isArray(out) ? out : [out];
  });

  // Reports that need something the Load collection does not hold — whether an
  // invoice has been raised, which lives in the register. Given the rows and the
  // loads they came from, it returns the rows with the extra fields on them, and
  // the filter below then has something to select on.
  if (report.enrich) rows = await report.enrich(rows, loads, params);

  // Reports whose selection cannot be expressed as a query — "has at least one
  // accessorial" needs the totals computed first, and the invoice-state filters
  // need `enrich` above to have run.
  if (report.postFilter) rows = rows.filter((row) => report.postFilter(row, params));

  if (report.sortRows) rows = rows.sort(report.sortRows);

  const sum = (field) => money(rows.reduce((acc, row) => acc + (Number(row[field]) || 0), 0));

  const totals = (report.totals || []).reduce(
    (acc, field) => ({ ...acc, [field]: sum(field) }),
    { count: rows.length },
  );

  let groups = null;
  if (report.groupBy) {
    const byKey = new Map();

    rows.forEach((row) => {
      const groupKey = row[report.groupBy] || "—";
      if (!byKey.has(groupKey)) byKey.set(groupKey, []);
      byKey.get(groupKey).push(row);
    });

    groups = [...byKey.entries()]
      .map(([name, groupRows]) => ({
        name,
        count: groupRows.length,
        rows: groupRows,
        totals: (report.totals || []).reduce(
          (acc, field) => ({
            ...acc,
            [field]: money(
              groupRows.reduce((sub, row) => sub + (Number(row[field]) || 0), 0),
            ),
          }),
          {},
        ),
      }))
      // Biggest group first — on a customer-wise report that is the customer
      // the reader most likely opened it for.
      .sort((a, b) => b.count - a.count);
  }

  return {
    key: report.key,
    label: report.label,
    description: report.description,
    columns: report.columns,
    groupBy: report.groupBy || null,
    params,
    generatedAt: new Date(),
    rows,
    groups,
    totals,
  };
};

// @desc    Every report the system can produce
// @route   GET /api/reports/catalog
// @access  Private (staff, admin)
const getCatalog = async (req, res) => {
  try {
    res.json(catalog());
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Run a report
// @route   GET /api/reports/:key
// @access  Private (staff, admin)
const getReport = async (req, res) => {
  try {
    const result = await runReport(req.params.key, paramsFrom(req.query));
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// ── CSV export ───────────────────────────────────────────────────────────────

const formatCell = (value, type) => {
  if (value === null || value === undefined || value === "") return "";

  if (type === "date") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-US");
  }

  if (type === "datetime") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-US");
  }

  // Money and percentages are written as bare numbers, not "$1,200.00":
  // a currency symbol and thousands separators turn the column into text the
  // moment it lands in Excel, and a total nobody can SUM() is not a report.
  if (type === "money" || type === "percent" || type === "number") {
    return String(Number(value) || 0);
  }

  return String(value);
};

/**
 * Escape one CSV field.
 *
 * The leading-character guard is deliberate. Excel treats a cell beginning
 * =, +, - or @ as a formula, so an innocuous value can execute on open — a
 * customer named "=cmd|..." is the textbook case. Prefixing a tab neutralises
 * it while still displaying the original text.
 */
const csvEscape = (value) => {
  const text = String(value ?? "");
  const guarded = /^[=+\-@]/.test(text) ? `\t${text}` : text;

  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
};

const toCsv = (report) => {
  const lines = [];

  lines.push(report.columns.map((c) => csvEscape(c.label)).join(","));

  report.rows.forEach((row) => {
    lines.push(
      report.columns
        .map((c) => csvEscape(formatCell(row[c.key], c.type)))
        .join(","),
    );
  });

  // A totals row, when the report has any — it is the first thing anybody
  // scrolls to, and making them re-sum in the spreadsheet defeats the export.
  const totalFields = Object.keys(report.totals).filter((k) => k !== "count");
  if (totalFields.length) {
    lines.push("");
    lines.push(
      report.columns
        .map((c, index) => {
          if (index === 0) return csvEscape(`TOTAL (${report.totals.count} rows)`);
          return report.totals[c.key] !== undefined
            ? csvEscape(String(report.totals[c.key]))
            : "";
        })
        .join(","),
    );
  }

  return lines.join("\r\n");
};

// @desc    Download a report as CSV
// @route   GET /api/reports/:key/export
// @access  Private (staff, admin)
const exportReport = async (req, res) => {
  try {
    const result = await runReport(req.params.key, paramsFrom(req.query));

    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `${result.key}-${stamp}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    // A BOM, so Excel opens the file as UTF-8 rather than mangling any
    // non-ASCII customer name into mojibake.
    res.send(`﻿${toCsv(result)}`);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// ── Driver payment ───────────────────────────────────────────────────────────

// @desc    Mark a driver's loads paid and email them the statement
// @route   POST /api/reports/driver-payable/pay
// @access  Private (staff, admin)
//
// The payment and the notification are one action deliberately: a driver who has
// been paid without being told still calls the office to ask, which is the whole
// problem this is meant to solve.
const payDriver = async (req, res) => {
  try {
    const driverId = trimmed(req.body.driver);
    const loadIds = Array.isArray(req.body.loadIds) ? req.body.loadIds : [];

    if (!driverId) {
      return res.status(400).json({ message: "Name the driver being paid." });
    }

    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({ message: "Driver not found at this location." });
    }

    const filter = {
      "accounting.payroll.driver": driver._id,
      "accounting.payroll.amount": { $gt: 0 },
      "accounting.payroll.settledAt": { $exists: false },
    };

    // A named set of loads when the office is paying part of what is owed;
    // everything outstanding when they are not.
    if (loadIds.length) filter.loadId = { $in: loadIds };

    const loads = await Load.find(filter);

    if (!loads.length) {
      return res
        .status(400)
        .json({ message: `${driver.name} has nothing outstanding to pay.` });
    }

    const paidAt = req.body.paidAt ? new Date(req.body.paidAt) : new Date();
    const reference = trimmed(req.body.reference);

    const statement = [];
    let total = 0;

    for (const load of loads) {
      load.accounting.payroll.settledAt = paidAt;
      if (reference) {
        load.accounting.payroll.reference = reference;
        load.accounting.payroll.note = [load.accounting.payroll.note, `Paid: ${reference}`]
          .filter(Boolean)
          .join(" · ");
      }
      load.markModified("accounting.payroll");
      await load.save();

      const amount = money(load.accounting.payroll.amount);
      total = money(total + amount);

      statement.push({
        loadId: load.loadId,
        customerName: load.customerName || "",
        payType: load.accounting.payroll.payType,
        rate: load.accounting.payroll.rate,
        miles: load.accounting.payroll.miles || null,
        hours: load.accounting.payroll.hours || null,
        amount,
      });

      // Each load's own trail records that it was settled, so the question
      // "when was this paid and by whom" is answerable from the load.
      await audit.recordFinancial({
        load,
        action: "accounting.payroll_settled",
        summary: `Driver pay of $${amount.toLocaleString("en-US")} paid to ${driver.name}${
          reference ? ` (${reference})` : ""
        }`,
        user: req.user,
        req,
      });
    }

    // The driver's email address lives on their sub-account when they have a
    // login, and on the driver record when they do not.
    const to = driver.email;

    const emailStatus = to
      ? await sendDriverPaymentStatement({
          to,
          driverName: driver.name,
          statement,
          total,
          paidAt,
          reference,
        })
      : {
          requested: false,
          sent: false,
          skipped: true,
          reason: "NO_EMAIL",
          message: `${driver.name} has no email address on file.`,
        };

    res.json({
      message: emailStatus.sent
        ? `$${total.toLocaleString("en-US")} paid to ${driver.name} — statement emailed.`
        : `$${total.toLocaleString("en-US")} paid to ${driver.name}. ${
            emailStatus.message || "The statement could not be emailed."
          }`,
      driver: { _id: driver._id, name: driver.name, email: to || "" },
      total,
      loadCount: statement.length,
      statement,
      emailStatus,
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Email a driver their statement of account, without paying anything
// @route   POST /api/reports/driver-payable/statement
// @access  Private (staff, admin)
//
// The same figures the report shows for this driver and these filters — built
// by running the report rather than by a second query, so the email cannot say
// something different from the screen the office was looking at when they
// pressed send.
const sendDriverStatement = async (req, res) => {
  try {
    const driverId = trimmed(req.body.driver);
    if (!driverId) {
      return res.status(400).json({ message: "Name the driver to send the statement to." });
    }

    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({ message: "Driver not found at this location." });
    }

    const params = paramsFrom({ ...req.body, driver: driverId });
    const result = await runReport("driverPayable", params);

    // A subset, when the office is sending the loads on one sheet only.
    const loadIds = Array.isArray(req.body.loadIds) ? req.body.loadIds.map(String) : [];
    const rows = loadIds.length
      ? result.rows.filter((row) => loadIds.includes(row.loadId))
      : result.rows;

    if (!rows.length) {
      return res
        .status(400)
        .json({ message: `${driver.name} has nothing on this statement to send.` });
    }

    const sum = (field) => money(rows.reduce((acc, row) => acc + (Number(row[field]) || 0), 0));
    const totals = { total: sum("total"), paid: sum("paid"), openBalance: sum("openBalance") };

    if (!driver.email) {
      return res.status(400).json({
        message: `${driver.name} has no email address on file, so the statement cannot be sent.`,
      });
    }

    const emailStatus = await sendDriverAccountStatement({
      to: driver.email,
      driverName: driver.name,
      rows,
      totals,
      period: { from: params.from || "", to: params.to || "" },
    });

    if (!emailStatus?.sent) {
      return res.status(502).json({
        message: emailStatus?.message || "The statement could not be emailed.",
        emailStatus,
      });
    }

    res.json({
      message: `Statement sent to ${driver.name} (${driver.email}) — ${rows.length} load${
        rows.length === 1 ? "" : "s"
      }, $${totals.openBalance.toLocaleString("en-US")} open.`,
      totals,
      emailStatus,
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Email a carrier their statement of account, without paying anything
// @route   POST /api/reports/payables/statement
// @access  Private (staff, admin)
//
// The carrier twin of sendDriverStatement: the Payable Report's own rows for
// this carrier and these filters, emailed, so the statement matches the screen.
const sendCarrierStatement = async (req, res) => {
  try {
    const carrierId = trimmed(req.body.carrier);
    if (!carrierId) {
      return res.status(400).json({ message: "Name the carrier to send the statement to." });
    }

    const carrier = await FleetOwner.findById(carrierId).lean();
    if (!carrier) {
      return res.status(404).json({ message: "Carrier not found at this location." });
    }

    const params = paramsFrom({ ...req.body, carrier: carrierId });
    const result = await runReport("payables", params);

    const loadIds = Array.isArray(req.body.loadIds) ? req.body.loadIds.map(String) : [];
    const rows = loadIds.length
      ? result.rows.filter((row) => loadIds.includes(row.loadId))
      : result.rows;

    const name = carrier.carrierName || "Carrier";

    if (!rows.length) {
      return res.status(400).json({ message: `${name} has nothing on this statement to send.` });
    }

    // Where a carrier's paperwork goes: the primary contact if they named one,
    // otherwise the login the carrier signs in with.
    const primary =
      (carrier.contactPersons || []).find((c) => c.isPrimary && c.email) ||
      (carrier.contactPersons || []).find((c) => c.email);
    const user = carrier.userId ? await User.findById(carrier.userId).select("email").lean() : null;
    const to = trimmed(req.body.to) || primary?.email || user?.email || "";

    if (!to) {
      return res.status(400).json({
        message: `${name} has no email address on file, so the statement cannot be sent.`,
      });
    }

    const sum = (field) => money(rows.reduce((acc, row) => acc + (Number(row[field]) || 0), 0));
    const totals = { total: sum("total"), paid: sum("paid"), openBalance: sum("openBalance") };

    const emailStatus = await sendCarrierAccountStatement({
      to,
      carrierName: name,
      rows,
      totals,
      period: { from: params.from || "", to: params.to || "" },
    });

    if (!emailStatus?.sent) {
      return res.status(502).json({
        message: emailStatus?.message || "The statement could not be emailed.",
        emailStatus,
      });
    }

    res.json({
      message: `Statement sent to ${name} (${to}) — ${rows.length} load${
        rows.length === 1 ? "" : "s"
      }, $${totals.openBalance.toLocaleString("en-US")} open.`,
      totals,
      emailStatus,
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

module.exports = {
  sendCarrierStatement,
  sendDriverStatement,
  getCatalog,
  getReport,
  exportReport,
  payDriver,
  runReport,
  toCsv,
  csvEscape,
};
