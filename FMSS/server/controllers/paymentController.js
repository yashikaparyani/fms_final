const mongoose = require("mongoose");
const Payment = require("../models/Payment");
const Invoice = require("../models/Invoice");
const Load = require("../models/Load");
const { syncInvoicePayments } = require("../services/invoiceService");
const mail = require("../services/accountingMailService");
const {
  catalog: methodCatalog,
  METHOD_BY_KEY,
  validatePaymentReference,
} = require("../config/paymentMethods");
const { money } = require("../config/chargeTypes");
const { nextSequence } = require("../utils/sequence");
const audit = require("../services/auditService");
// paidOn is the calendar day the money moved, not the instant the row was
// typed — see utils/dates.js.
const { calendarDate, calendarRange } = require("../utils/dates");

// ─── Payments ─────────────────────────────────────────────────────────────────
// Recording that money moved, and keeping the invoice it settled in step.
//
// ── The invariant this file exists to hold ───────────────────────────────────
// An invoice's `amountPaid` is never written here. Every path that touches money
// — recording, reversing, correcting — ends in syncInvoicePayments, which re-adds
// the live payments from scratch and saves. Incrementing would be faster and
// would drift: a double-submitted form, a reversal, a half-failed request each
// leave the running total a little further from the truth, and the error is
// invisible until somebody reconciles a statement three months later.
//
// ── Why a payment is never deleted ───────────────────────────────────────────
// A cheque bounces, a wire is recalled, a clerk keys $1,500 as $15,000. All three
// are reversals, not deletions: the invoice goes from paid back to outstanding
// and the only acceptable answer to "why" is a row that says so. Deleting the
// row leaves the balance changing for no recorded reason.
// ─────────────────────────────────────────────────────────────────────────────

const trimmed = (value) => String(value ?? "").trim();

const toNumberOrNull = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

/** Money in settles a receivable; money out settles a payable. */
const directionForInvoice = (invoice) =>
  invoice.direction === "AR" ? "RECEIVED" : "PAID";

/** A payment row with its method spelled out for the screen. */
const present = (payment) => {
  const doc = payment.toObject ? payment.toObject() : payment;
  const spec = METHOD_BY_KEY.get(doc.method);

  return {
    ...doc,
    _id: String(doc._id),
    methodLabel: spec?.label || doc.method,
    // The label the number was captured under — "Cheque Number", not "Reference".
    // Stored nowhere, derived here, so a register printed today reads the same
    // way the form that captured it did.
    documentLabel: spec?.documentLabel || "Reference",
    reversed: !!doc.reversedAt,
  };
};

// @desc    The payment methods and what each calls its document number
// @route   GET /api/payments/methods
// @access  Private (staff, admin)
const getMethods = async (_req, res) => {
  res.json({ methods: methodCatalog() });
};

// @desc    Record a payment against an invoice
// @route   POST /api/payments
// @access  Private (staff, admin)
const recordPayment = async (req, res) => {
  try {
    const invoiceId = trimmed(req.body.invoice);
    if (!mongoose.isValidObjectId(invoiceId)) {
      return res.status(400).json({ message: "Choose the invoice this payment settles." });
    }

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    if (invoice.status === "VOID") {
      return res.status(400).json({
        message: `${invoice.invoiceNumber} is void — reopen it before recording a payment against it.`,
      });
    }

    const amount = toNumberOrNull(req.body.amount);
    if (amount === null || amount <= 0) {
      return res.status(400).json({ message: "Enter the amount that was paid." });
    }

    // ── Overpayment ─────────────────────────────────────────────────────────
    // Refused rather than absorbed. A payment larger than the balance is almost
    // always a typo or a payment applied to the wrong invoice, and accepting it
    // creates a negative balance that every report then has to special-case. A
    // genuine overpayment is a credit, which is a different document.
    const outstanding = money(invoice.balance);
    if (amount > outstanding + 0.005) {
      return res.status(400).json({
        message: `That is more than the $${outstanding.toLocaleString("en-US")} outstanding on ${invoice.invoiceNumber}. Check the amount, or record it against the right invoice.`,
      });
    }

    const method = trimmed(req.body.method).toUpperCase();

    // The document-number rule lives in config/paymentMethods.js — a cheque needs
    // its number, cash does not — so the form and the API refuse the same rows.
    const problem = validatePaymentReference({
      method,
      documentNumber: req.body.documentNumber,
    });
    if (problem) return res.status(400).json({ message: problem });

    const direction = directionForInvoice(invoice);

    const payment = new Payment({
      paymentNumber: await nextSequence(
        direction === "RECEIVED" ? "receipt" : "payment",
        req.locationId,
      ),
      direction,
      invoice: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      load: invoice.load,
      loadId: invoice.loadId,
      party: {
        kind: invoice.party?.kind,
        id: invoice.party?.id,
        name: invoice.party?.name,
      },
      amount: money(amount),
      currency: invoice.currency || "USD",
      // A cheque dated the 28th and entered on the 2nd belongs to the 28th, and
      // it belongs to the 28th for everybody — anchored to the calendar day
      // rather than to the instant the form was submitted.
      paidOn: calendarDate(req.body.paidOn) || calendarDate(new Date()),
      method,
      documentNumber: trimmed(req.body.documentNumber),
      bankName: trimmed(req.body.bankName),
      note: trimmed(req.body.note),
      recordedBy: req.user?._id,
      recordedByName:
        [req.user?.firstName, req.user?.lastName].filter(Boolean).join(" ") || "",
    });

    await payment.save();

    // Re-added from the collection, never incremented. See the note at the top.
    await syncInvoicePayments(invoice);

    const load = invoice.load ? await Load.findById(invoice.load) : null;
    if (load) {
      const spec = METHOD_BY_KEY.get(method);
      await audit.recordFinancial({
        load,
        action: direction === "RECEIVED" ? "payment.received" : "payment.paid",
        summary:
          `$${payment.amount.toLocaleString("en-US")} ${direction === "RECEIVED" ? "received from" : "paid to"} ` +
          `${payment.party?.name || "—"} against ${invoice.invoiceNumber} ` +
          `by ${spec?.label || method}${payment.documentNumber ? ` (${spec?.documentLabel || "ref"} ${payment.documentNumber})` : ""}`,
        changes: [
          {
            field: `invoice.${invoice.invoiceNumber}.balance`,
            label: "Outstanding",
            from: `$${outstanding.toLocaleString("en-US")}`,
            to: `$${invoice.balance.toLocaleString("en-US")}`,
          },
        ],
        user: req.user,
        req,
      });
    }

    // A receipt is a courtesy, not part of recording the payment — so a failure
    // to send it must never fail the request. The money is recorded either way,
    // and the response says whether the email went.
    let emailStatus = null;
    if (String(req.body.sendReceipt) === "true") {
      emailStatus = await mail
        .sendReceipt({ payment, invoice, to: trimmed(req.body.receiptTo) || undefined })
        .catch((error) => ({ sent: false, message: error.message }));
    }

    res.status(201).json({
      message:
        `${payment.paymentNumber}: $${payment.amount.toLocaleString("en-US")} recorded against ${invoice.invoiceNumber}. ` +
        (invoice.balance > 0
          ? `$${invoice.balance.toLocaleString("en-US")} still outstanding.`
          : "Paid in full."),
      payment: present(payment),
      invoice: {
        _id: String(invoice._id),
        invoiceNumber: invoice.invoiceNumber,
        total: invoice.total,
        amountPaid: invoice.amountPaid,
        balance: invoice.balance,
        status: invoice.status,
      },
      emailStatus,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    The payment register
// @route   GET /api/payments
// @access  Private (staff, admin)
const listPayments = async (req, res) => {
  try {
    const filter = {};

    if (req.query.direction) filter.direction = req.query.direction;
    if (req.query.loadId) filter.loadId = req.query.loadId;
    if (req.query.method) filter.method = String(req.query.method).toUpperCase();
    if (req.query.invoice && mongoose.isValidObjectId(req.query.invoice)) {
      filter.invoice = req.query.invoice;
    }
    if (req.query.partyId && mongoose.isValidObjectId(req.query.partyId)) {
      filter["party.id"] = req.query.partyId;
    }

    // Reversed rows are excluded by default — the register is what moved, and a
    // reversed payment did not. They stay one query parameter away.
    if (String(req.query.includeReversed) !== "true") {
      filter.reversedAt = { $exists: false };
    }

    const paidRange = calendarRange(req.query.from, req.query.to);
    if (paidRange) filter.paidOn = paidRange;

    const search = trimmed(req.query.search);
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        { paymentNumber: rx },
        { invoiceNumber: rx },
        { loadId: rx },
        { documentNumber: rx },
        { "party.name": rx },
      ];
    }

    const rows = await Payment.find(filter)
      .sort({ paidOn: -1, createdAt: -1 })
      .limit(Math.min(Number(req.query.limit) || 300, 1000))
      .lean();

    const presented = rows.map(present);

    const totalFor = (direction) =>
      money(
        presented
          .filter((row) => row.direction === direction && !row.reversed)
          .reduce((acc, row) => acc + (row.amount || 0), 0),
      );

    const received = totalFor("RECEIVED");
    const paid = totalFor("PAID");

    res.json({
      totals: {
        count: presented.length,
        received,
        paid,
        // What the period actually did to the bank balance, which is the number
        // anybody looking at a payment register is really after.
        net: money(received - paid),
      },
      rows: presented,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Reverse a payment
// @route   PUT /api/payments/:id/reverse
// @access  Private (staff, admin)
const reversePayment = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    if (payment.reversedAt) {
      return res
        .status(400)
        .json({ message: `${payment.paymentNumber} has already been reversed.` });
    }

    const reason = trimmed(req.body.reason);
    if (!reason) {
      return res.status(400).json({
        message:
          "Say why this payment is being reversed — a bounced cheque and a keying error read very differently later.",
      });
    }

    payment.reversedAt = new Date();
    payment.reversedReason = reason;
    payment.reversedBy = req.user?._id;
    await payment.save();

    const invoice = await Invoice.findById(payment.invoice);
    if (invoice) await syncInvoicePayments(invoice);

    const load = payment.load ? await Load.findById(payment.load) : null;
    if (load && invoice) {
      await audit.recordFinancial({
        load,
        action: "payment.reversed",
        summary: `${payment.paymentNumber} ($${payment.amount.toLocaleString("en-US")}) reversed — ${reason}`,
        changes: [
          {
            field: `invoice.${invoice.invoiceNumber}.balance`,
            label: "Outstanding",
            from: `$${money(invoice.balance - payment.amount).toLocaleString("en-US")}`,
            to: `$${invoice.balance.toLocaleString("en-US")}`,
          },
        ],
        user: req.user,
        req,
      });
    }

    res.json({
      message: `${payment.paymentNumber} reversed. ${invoice ? `${invoice.invoiceNumber} is back to $${invoice.balance.toLocaleString("en-US")} outstanding.` : ""}`,
      payment: present(payment),
      invoice: invoice
        ? {
            _id: String(invoice._id),
            invoiceNumber: invoice.invoiceNumber,
            amountPaid: invoice.amountPaid,
            balance: invoice.balance,
            status: invoice.status,
          }
        : null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Email a receipt for a payment already recorded
// @route   POST /api/payments/:id/receipt
// @access  Private (staff, admin)
const sendReceipt = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    const invoice = await Invoice.findById(payment.invoice);
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    const status = await mail.sendReceipt({
      payment,
      invoice,
      to: trimmed(req.body.to) || undefined,
    });

    if (!status.sent) {
      return res.status(status.reason === "NO_RECIPIENT" ? 400 : 502).json({
        message: status.message || "The receipt could not be sent.",
        emailStatus: status,
      });
    }

    res.json({
      message: `Receipt for ${payment.paymentNumber} sent to ${status.to}.`,
      emailStatus: status,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getMethods,
  recordPayment,
  listPayments,
  reversePayment,
  sendReceipt,
  present,
};
