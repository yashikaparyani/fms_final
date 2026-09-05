const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");
const Payment = require("../models/Payment");
const Load = require("../models/Load");
const User = require("../models/User");
const Customer = require("../models/Customer");
const invoices = require("../services/invoiceService");
const mail = require("../services/accountingMailService");
const { renderInvoicePdf } = require("../services/invoiceDocumentService");
const { money } = require("../config/chargeTypes");
const { TERMS } = require("../models/Invoice");
const audit = require("../services/auditService");
// Issue and due dates are calendar dates; "days overdue" is counted in whole
// days rather than by dividing milliseconds. See utils/dates.js.
const {
  calendarDate,
  calendarRange,
  daysBetween,
  todayKey,
} = require("../utils/dates");

// ─── Invoices ─────────────────────────────────────────────────────────────────
// Raising, sending, chasing and voiding the documents. The arithmetic is not
// here — the Invoice model totals itself on save and services/invoiceService.js
// owns how a load becomes a document.
//
// ── What this file does guard ────────────────────────────────────────────────
// Two rules, both about the fact that an invoice is somebody else's copy of a
// number:
//
//   1. A sent or part-paid invoice cannot be edited or regenerated. Correcting
//      it means voiding it and raising another, which leaves both on the record.
//   2. Voiding is refused while payments stand against it. Money has to be
//      unwound before the claim it settled can be withdrawn, or the payment
//      register and the invoice register stop reconciling.
//
// Both are enforced here rather than in the UI, because the UI is not the only
// caller and a rule that lives in a button is not a rule.
// ─────────────────────────────────────────────────────────────────────────────

const trimmed = (value) => String(value ?? "").trim();

const toNumberOrNull = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const TERM_OPTIONS = Object.entries(TERMS).map(([key, spec]) => ({
  key,
  label: spec.label,
  days: spec.days,
}));

/** One invoice in the shape every screen reads, with its age worked out. */
const present = (invoice, extra = {}) => {
  const doc = invoice.toObject ? invoice.toObject() : invoice;

  // daysOverdue is a method on hydrated docs and absent on lean ones, so it is
  // recomputed here rather than assumed — a lean read for a list must give the
  // same answer as a hydrated read for a detail page.
  const live = doc.status !== "PAID" && doc.status !== "VOID" && (doc.balance || 0) > 0;
  const elapsed = doc.dueDate ? daysBetween(doc.dueDate, todayKey()) : 0;
  const daysOverdue = live && elapsed > 0 ? elapsed : 0;

  return {
    ...doc,
    _id: String(doc._id),
    daysOverdue,
    overdue: daysOverdue > 0,
    // Whether the screen should offer Edit and Regenerate, so the button and the
    // server agree about it instead of the user finding out on submit.
    frozen: doc.status !== "DRAFT" || !!doc.sentAt || (doc.amountPaid || 0) > 0,
    termsLabel: TERMS[doc.terms]?.label || doc.terms || "",
    ...extra,
  };
};

// @desc    Net terms the UI offers
// @route   GET /api/invoices/terms
// @access  Private (staff, admin)
const getTerms = async (_req, res) => {
  res.json({ terms: TERM_OPTIONS });
};

// @desc    The invoice register, filtered
// @route   GET /api/invoices
// @access  Private (staff, admin)
//
// One endpoint for both directions rather than two: the AR and AP registers are
// the same table with a different filter, and the customer ledger, the aging
// report and the "what does this load owe" panel are all this query with
// different arguments.
const listInvoices = async (req, res) => {
  try {
    const filter = {};

    if (req.query.direction) filter.direction = req.query.direction;
    if (req.query.kind) filter.kind = req.query.kind;
    if (req.query.loadId) filter.loadId = req.query.loadId;
    if (req.query.partyId && mongoose.isValidObjectId(req.query.partyId)) {
      filter["party.id"] = req.query.partyId;
    }
    if (req.query.partyKind) filter["party.kind"] = req.query.partyKind;

    if (req.query.status) {
      filter.status = { $in: String(req.query.status).split(",") };
    }

    // "Open" is what the office actually means by outstanding: raised, not
    // settled, not withdrawn. Spelling it as three statuses at every call site
    // is how one of them gets left out and the total quietly shrinks.
    if (String(req.query.open) === "true") {
      filter.status = { $in: ["DRAFT", "SENT", "PARTIAL"] };
      filter.balance = { $gt: 0 };
    }

    if (String(req.query.overdue) === "true") {
      filter.status = { $in: ["DRAFT", "SENT", "PARTIAL"] };
      filter.balance = { $gt: 0 };
      filter.dueDate = { $lt: new Date() };
    }

    const issued = calendarRange(req.query.from, req.query.to);
    if (issued) filter.issueDate = issued;

    const search = trimmed(req.query.search);
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        { invoiceNumber: rx },
        { loadId: rx },
        { "party.name": rx },
        { "party.code": rx },
      ];
    }

    const limit = Math.min(Number(req.query.limit) || 200, 500);

    const rows = await Invoice.find(filter)
      .sort({ issueDate: -1, invoiceNumber: -1 })
      .limit(limit)
      .lean();

    const presented = rows.map((row) => present(row));

    const sum = (key) =>
      money(presented.reduce((acc, row) => acc + (row[key] || 0), 0));

    res.json({
      totals: {
        count: presented.length,
        invoiced: sum("total"),
        paid: sum("amountPaid"),
        outstanding: sum("balance"),
        overdue: money(
          presented
            .filter((row) => row.overdue)
            .reduce((acc, row) => acc + (row.balance || 0), 0),
        ),
        overdueCount: presented.filter((row) => row.overdue).length,
      },
      rows: presented,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    One invoice with the payments recorded against it
// @route   GET /api/invoices/:id
// @access  Private (staff, admin)
const getInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    // Reversed payments are returned too, marked. A bounced check is part of the
    // story of why this invoice went back to outstanding, and hiding it makes
    // the balance look like an error.
    const payments = await Payment.find({ invoice: invoice._id })
      .sort({ paidOn: -1 })
      .lean();

    res.json(present(invoice, { payments }));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    The invoice as a PDF
// @route   GET /api/invoices/:id/pdf
// @access  Private (staff, admin)
const downloadInvoicePdf = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).lean();
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    const buffer = await renderInvoicePdf(invoice);
    const fileName = `${String(invoice.invoiceNumber).replace(/[^\w.-]+/g, "_")}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    // `inline` rather than `attachment`: staff overwhelmingly want to look at it
    // before deciding to send it, and a forced download to check one number is a
    // trip through the Downloads folder every time.
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Raise the customer invoice and carrier bills for a load
// @route   POST /api/invoices/loads/:loadId/generate
// @access  Private (staff, admin)
//
// Idempotent by design: pressing it twice refreshes the drafts rather than
// producing a second set. That matters because the natural workflow is to
// generate, notice a missing detention charge, fix the ledger and press it
// again — and a system that answered that with "LD 0014-AP3" would leave the
// office deciding by hand which bills are real.
const generateForLoad = async (req, res) => {
  try {
    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) return res.status(404).json({ message: "Load not found" });

    const sides = Array.isArray(req.body.sides) ? req.body.sides : undefined;

    const result = await invoices.generateForLoad({
      load,
      user: req.user,
      terms: trimmed(req.body.terms) || undefined,
      issueDate: req.body.issueDate || undefined,
      memo: req.body.memo,
      sides,
    });

    const raised = [
      result.customerInvoice?.invoice,
      ...result.carrierBills.map((b) => b.invoice),
      result.driverBill?.invoice,
    ].filter(Boolean);

    if (!raised.length) {
      return res.status(400).json({
        message:
          result.problems[0] ||
          "Nothing to raise — add receivable or payable charges to this load first.",
        problems: result.problems,
      });
    }

    const createdCount = [
      result.customerInvoice,
      ...result.carrierBills,
      result.driverBill,
    ].filter((r) => r?.created).length;

    await audit.recordFinancial({
      load,
      action: "invoice.generated",
      summary:
        createdCount > 0
          ? `${createdCount} invoice${createdCount === 1 ? "" : "s"} raised: ${raised.map((i) => i.invoiceNumber).join(", ")}`
          : `Invoices refreshed from the ledger: ${raised.map((i) => i.invoiceNumber).join(", ")}`,
      changes: raised.map((invoice) => ({
        field: `invoice.${invoice.invoiceNumber}`,
        label: invoice.direction === "AR" ? "Customer Invoice" : "Carrier Bill",
        from: "",
        to: `$${(invoice.total || 0).toLocaleString("en-US")}`,
      })),
      user: req.user,
      req,
    });

    res.json({
      message: createdCount
        ? `${createdCount} invoice${createdCount === 1 ? "" : "s"} raised for ${load.loadId}.`
        : `Invoices for ${load.loadId} refreshed from the ledger.`,
      problems: result.problems,
      customerInvoice: result.customerInvoice?.invoice
        ? present(result.customerInvoice.invoice)
        : null,
      carrierBills: result.carrierBills.map((b) => present(b.invoice)),
      driverBill: result.driverBill?.invoice ? present(result.driverBill.invoice) : null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Everything raised and owed on one load
// @route   GET /api/invoices/loads/:loadId
// @access  Private (staff, admin)
const getLoadInvoices = async (req, res) => {
  try {
    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) return res.status(404).json({ message: "Load not found" });

    const position = await invoices.positionForLoad(load);

    const ids = position.invoices.map((i) => i._id);
    const payments = await Payment.find({ invoice: { $in: ids } })
      .sort({ paidOn: -1 })
      .lean();

    res.json({
      loadId: load.loadId,
      customerName: load.customerName || "",
      receivable: position.receivable,
      payable: position.payable,
      margin: position.margin,
      invoices: position.invoices.map((row) => present(row)),
      payments,
      // What a bill would be raised against, before anybody raises one. The
      // split-carrier panel reads this to show each carrier their own figure.
      payableGroups: invoices.payableGroups(load).map((group) => ({
        legId: group.legId ? String(group.legId) : null,
        fleetOwnerId: String(group.fleetOwnerId || ""),
        name: group.name,
        agreed: group.agreed,
        lineCount: group.lines.length,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Clean a submitted invoice line.
 *
 * `kind` is what the totals turn on, so it is validated rather than trusted: a
 * line arriving as kind "settlement" when the user meant a charge would be
 * silently deducted from the invoice instead of added to it.
 */
const normalizeLine = (raw) => {
  const label = trimmed(raw?.label);
  if (!label) return null;

  const kind = ["linehaul", "accessorial", "settlement"].includes(raw?.kind)
    ? raw.kind
    : "accessorial";

  const quantity = toNumberOrNull(raw.quantity);
  const rate = toNumberOrNull(raw.rate);
  const explicit = toNumberOrNull(raw.amount);

  // Quantity × rate when both are given and no amount was typed — the way an
  // invoice line is normally entered ("3 days @ $35"), and doing the sum for
  // the user is one fewer place for an arithmetic slip to enter the books.
  const amount =
    explicit !== null
      ? explicit
      : quantity !== null && rate !== null
        ? quantity * rate
        : 0;

  return {
    chargeType: trimmed(raw.chargeType) || undefined,
    label,
    kind,
    description: trimmed(raw.description),
    quantity: quantity ?? undefined,
    rate: rate ?? undefined,
    amount: money(amount),
  };
};

const validateLines = (lines) => {
  if (!lines.length) return "Add at least one line to the invoice.";

  const linehauls = lines.filter((l) => l.kind === "linehaul");
  if (linehauls.length > 1) {
    return "Only one base charge line is allowed — combine them or move the extra onto an accessorial.";
  }

  if (lines.some((l) => l.amount < 0)) {
    return "Amounts cannot be negative. Record money already taken as a settlement line instead.";
  }

  return null;
};

// @desc    Create an invoice by hand
// @route   POST /api/invoices/manual
// @access  Private (staff, admin)
//
// For the billing that has no load behind it — a re-bill, a storage charge
// agreed after the fact, an administration fee. Numbered from its own series
// ("NY-MI-0001") rather than borrowing a load number, so it is obvious on the
// register that this one was typed rather than derived.
const createManualInvoice = async (req, res) => {
  try {
    const direction = req.body.direction === "AP" ? "AP" : "AR";

    const lines = (Array.isArray(req.body.lines) ? req.body.lines : [])
      .map(normalizeLine)
      .filter(Boolean);

    const problem = validateLines(lines);
    if (problem) return res.status(400).json({ message: problem });

    // The party may be picked from the directory or typed in full — a one-off
    // bill to somebody who is not a customer yet still has to be raisable.
    const party = {
      kind: trimmed(req.body.party?.kind) || (direction === "AR" ? "CUSTOMER" : "CARRIER"),
      name: trimmed(req.body.party?.name),
      email: trimmed(req.body.party?.email),
      phone: trimmed(req.body.party?.phone),
      address: trimmed(req.body.party?.address),
      code: trimmed(req.body.party?.code),
    };

    if (req.body.party?.id && mongoose.isValidObjectId(req.body.party.id)) {
      party.id = req.body.party.id;

      // Fill the blanks from the directory record rather than making staff
      // retype an address the system already holds.
      if (party.kind === "CUSTOMER") {
        const user = await User.findById(party.id).lean();
        const customer = await Customer.findOne({ user: party.id }).lean();
        party.name =
          party.name ||
          customer?.customerName ||
          [user?.firstName, user?.lastName].filter(Boolean).join(" ");
        party.email =
          party.email ||
          customer?.emails?.accChargesEmail ||
          customer?.contact?.email ||
          user?.email ||
          "";
      }
    }

    if (!party.name) {
      return res.status(400).json({ message: "Say who this invoice is addressed to." });
    }

    const linkedLoad = trimmed(req.body.loadId)
      ? await Load.findOne({ loadId: trimmed(req.body.loadId) })
      : null;

    const invoice = new Invoice({
      invoiceNumber: await invoices.nextManualNumber(
        linkedLoad?.locationId || req.locationId,
      ),
      direction,
      kind: "MANUAL",
      load: linkedLoad?._id,
      loadId: linkedLoad?.loadId,
      party,
      issuer: linkedLoad
        ? await invoices.issuerFor(linkedLoad)
        : await invoices.issuerFor({ locationId: req.locationId }),
      lines,
      terms: trimmed(req.body.terms) || "NET_30",
      issueDate: calendarDate(req.body.issueDate) || calendarDate(new Date()),
      dueDate: calendarDate(req.body.dueDate) || undefined,
      memo: trimmed(req.body.memo),
      notes: trimmed(req.body.notes),
      createdBy: req.user?._id,
    });

    await invoice.save();

    res.status(201).json({
      message: `Invoice ${invoice.invoiceNumber} created.`,
      invoice: present(invoice),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Edit a draft invoice
// @route   PUT /api/invoices/:id
// @access  Private (staff, admin)
const updateInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    if (invoice.isFrozen()) {
      return res.status(400).json({
        message: `${invoice.invoiceNumber} has already been ${invoice.sentAt ? "sent" : "paid against"} and cannot be edited. Void it and raise a new one instead.`,
      });
    }

    if (Array.isArray(req.body.lines)) {
      const lines = req.body.lines.map(normalizeLine).filter(Boolean);
      const problem = validateLines(lines);
      if (problem) return res.status(400).json({ message: problem });
      invoice.lines = lines;
    }

    if (req.body.party) {
      invoice.party = { ...invoice.party.toObject(), ...req.body.party };
    }

    if (req.body.terms) {
      invoice.terms = req.body.terms;
      // Let the hook re-derive the due date from the new terms, unless the
      // caller also named a date explicitly below.
      invoice.dueDate = undefined;
    }
    if (req.body.issueDate) invoice.issueDate = calendarDate(req.body.issueDate);
    if (req.body.dueDate) invoice.dueDate = calendarDate(req.body.dueDate);
    if (req.body.memo !== undefined) invoice.memo = trimmed(req.body.memo);
    if (req.body.notes !== undefined) invoice.notes = trimmed(req.body.notes);

    invoice.updatedBy = req.user?._id;
    await invoice.save();

    res.json({ message: `${invoice.invoiceNumber} updated.`, invoice: present(invoice) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Email the invoice and mark it sent
// @route   POST /api/invoices/:id/send
// @access  Private (staff, admin)
//
// Sending is what freezes an invoice, so the order matters: mail first, mark
// second, and only if the mail actually went. Marking first would leave a
// frozen, uneditable invoice that nobody has ever received.
const sendInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    if (invoice.status === "VOID") {
      return res.status(400).json({ message: `${invoice.invoiceNumber} is void.` });
    }

    const load = invoice.load ? await Load.findById(invoice.load).lean() : null;

    const status = await mail.sendInvoice({
      invoice,
      load,
      to: trimmed(req.body.to) || undefined,
      cc: trimmed(req.body.cc) || undefined,
      message: trimmed(req.body.message) || undefined,
    });

    if (!status.sent) {
      return res.status(status.reason === "NO_RECIPIENT" ? 400 : 502).json({
        message:
          status.message ||
          "The invoice could not be emailed. It has not been marked as sent.",
        emailStatus: status,
        invoice: present(invoice),
      });
    }

    invoice.sentAt = new Date();
    invoice.sentTo = status.to;
    invoice.updatedBy = req.user?._id;
    await invoice.save();

    if (load) {
      await audit.recordCommunication({
        load,
        summary: `${invoice.direction === "AR" ? "Invoice" : "Settlement"} ${invoice.invoiceNumber} emailed to ${status.to}`,
        body: `Amount due $${(invoice.balance || 0).toLocaleString("en-US")}, due ${invoice.dueDate?.toDateString?.() || ""}`,
        user: req.user,
        req,
      });
    }

    res.json({
      message: `${invoice.invoiceNumber} sent to ${status.to}.`,
      emailStatus: status,
      invoice: present(invoice),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Chase an unpaid invoice
// @route   POST /api/invoices/:id/remind
// @access  Private (staff, admin)
const remindInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    if (invoice.status === "PAID" || invoice.status === "VOID") {
      return res.status(400).json({
        message: `${invoice.invoiceNumber} is ${invoice.status.toLowerCase()} — there is nothing to chase.`,
      });
    }

    const daysOverdue = invoice.daysOverdue();

    const status = await mail.sendReminder({
      invoice,
      daysOverdue,
      to: trimmed(req.body.to) || undefined,
    });

    // Recorded whether or not it went. "We chased them four times" is only
    // trustworthy if the failures are in the list too — otherwise a customer
    // with a bouncing address looks like one who was never contacted.
    invoice.reminders.push({
      sentAt: new Date(),
      to: status.to || invoice.party?.email || "",
      trigger: "MANUAL",
      daysOverdue,
      sent: status.sent,
      note: status.sent ? "" : status.message,
    });
    await invoice.save();

    if (!status.sent) {
      return res.status(status.reason === "NO_RECIPIENT" ? 400 : 502).json({
        message: status.message || "The reminder could not be sent.",
        emailStatus: status,
        invoice: present(invoice),
      });
    }

    res.json({
      message: `Reminder for ${invoice.invoiceNumber} sent to ${status.to}.`,
      emailStatus: status,
      invoice: present(invoice),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Void an invoice
// @route   PUT /api/invoices/:id/void
// @access  Private (staff, admin)
//
// Never a delete. The number stays in the series and the document stays
// readable, because somebody outside this system is holding a copy of it and a
// missing invoice number is the first thing an auditor asks about.
const voidInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    if (invoice.status === "VOID") {
      return res.status(400).json({ message: `${invoice.invoiceNumber} is already void.` });
    }

    const live = await Payment.countDocuments({
      invoice: invoice._id,
      reversedAt: { $exists: false },
    });

    if (live > 0) {
      return res.status(400).json({
        message: `${invoice.invoiceNumber} has ${live} payment${live === 1 ? "" : "s"} recorded against it. Reverse ${live === 1 ? "it" : "them"} before voiding the invoice.`,
      });
    }

    const reason = trimmed(req.body.reason);
    if (!reason) {
      return res.status(400).json({ message: "Say why this invoice is being voided." });
    }

    invoice.status = "VOID";
    invoice.voidedAt = new Date();
    invoice.voidReason = reason;
    invoice.updatedBy = req.user?._id;
    await invoice.save();

    const load = invoice.load ? await Load.findById(invoice.load) : null;
    if (load) {
      await audit.recordFinancial({
        load,
        action: "invoice.voided",
        summary: `${invoice.invoiceNumber} voided — ${reason}`,
        changes: [
          {
            field: `invoice.${invoice.invoiceNumber}.status`,
            label: "Invoice Status",
            from: "Open",
            to: "Void",
          },
        ],
        user: req.user,
        req,
      });
    }

    res.json({ message: `${invoice.invoiceNumber} voided.`, invoice: present(invoice) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Reopen a voided invoice
// @route   PUT /api/invoices/:id/unvoid
// @access  Private (staff, admin)
const unvoidInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    if (invoice.status !== "VOID") {
      return res.status(400).json({ message: `${invoice.invoiceNumber} is not void.` });
    }

    // Cleared so the save hook re-derives the status from the money, rather than
    // guessing which of DRAFT/SENT/PARTIAL it was before.
    invoice.status = "DRAFT";
    invoice.voidedAt = undefined;
    invoice.voidReason = undefined;
    invoice.updatedBy = req.user?._id;
    await invoice.save();

    res.json({ message: `${invoice.invoiceNumber} reopened.`, invoice: present(invoice) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getTerms,
  listInvoices,
  getInvoice,
  downloadInvoicePdf,
  generateForLoad,
  getLoadInvoices,
  createManualInvoice,
  updateInvoice,
  sendInvoice,
  remindInvoice,
  voidInvoice,
  unvoidInvoice,
  present,
};
