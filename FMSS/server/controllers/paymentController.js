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
// ─── Receiving one payment against several loads ──────────────────────────────
// A customer settles six loads with one transfer. That is one movement of money
// and six invoices, so it produces six Payment rows sharing a batch id — the
// invoice is what a payment settles, and there are six of them.
//
// ── Why not one row for the lot ──────────────────────────────────────────────
// Because every figure downstream is per invoice: the balance on each, the
// aging bucket each falls into, the load each belongs to. A single row for
// $12,000 against "the customer" would leave all six invoices still reading as
// outstanding, which is the exact problem this is meant to fix.
//
// ── How the money is split ───────────────────────────────────────────────────
//   OLDEST_FIRST (default)  fill each invoice to its balance in due-date order
//                           until the money runs out. This is what actually
//                           CLEARS loads — the thing the office needs — because
//                           it leaves whole invoices settled and at most one
//                           part-paid, rather than every invoice short by a bit.
//   PROPORTIONAL            each takes its share of the total by size. Asked for
//                           where a customer has paid "something off everything"
//                           and says so.
//
// Either can be overridden outright by sending explicit per-invoice amounts,
// because the office sometimes knows what the customer intended and the
// remittance advice says so.
// ─────────────────────────────────────────────────────────────────────────────

/** Spread `amount` over invoices, filling each in turn. */
const allocateOldestFirst = (invoices, amount) => {
  let left = money(amount);

  return invoices.map((invoice) => {
    const take = money(Math.min(left, money(invoice.balance)));
    left = money(left - take);
    return { invoice, amount: take };
  });
};

/** Spread `amount` over invoices by their share of the outstanding total. */
const allocateProportionally = (invoices, amount) => {
  const outstanding = money(
    invoices.reduce((sum, invoice) => sum + money(invoice.balance), 0),
  );

  if (outstanding <= 0) return invoices.map((invoice) => ({ invoice, amount: 0 }));

  const rows = invoices.map((invoice) => ({
    invoice,
    amount: money((money(amount) * money(invoice.balance)) / outstanding),
  }));

  // Rounding to cents leaves a few cents unallocated or over-allocated. It goes
  // on the largest row, where it cannot exceed that invoice's balance and
  // cannot turn a settled invoice into a one-cent debt.
  const allocated = money(rows.reduce((sum, row) => sum + row.amount, 0));
  const drift = money(money(amount) - allocated);

  if (drift !== 0 && rows.length) {
    const biggest = rows.reduce((a, b) => (b.amount > a.amount ? b : a));
    biggest.amount = money(
      Math.min(money(biggest.amount + drift), money(biggest.invoice.balance)),
    );
  }

  return rows;
};

const receivePayment = async (req, res) => {
  try {
    const submitted = Array.isArray(req.body.invoices) ? req.body.invoices : [];

    if (!submitted.length) {
      return res.status(400).json({
        message: "Choose at least one load for this payment to settle.",
      });
    }

    // Accepts either plain ids or `{ invoice, amount }` rows, so the same
    // endpoint serves "here is a cheque, clear what it covers" and "here is
    // exactly what to put where".
    const submittedRows = submitted.map((entry) =>
      typeof entry === "string" ? { invoice: entry, amount: null } : entry,
    );

    // The same load named twice is still one load, and the duplicate is not
    // harmless. Each row is checked against that invoice's full balance
    // independently, so two $500 rows against a $500 invoice both pass and it
    // ends up $500 in credit with two receipts against it. On the no-amount
    // path the duplicate instead inflates `outstanding`, which is the ceiling
    // the whole payment is checked against, so an overpayment gets through the
    // one check meant to catch it.
    //
    // Explicit amounts are added together rather than refused: a remittance
    // that splits one invoice across two lines is a real thing, and their sum
    // is what the sender meant. The merged figure is then checked against the
    // balance like any other, so an over-application is still caught below.
    const merged = new Map();
    for (const row of submittedRows) {
      const id = trimmed(row.invoice);
      const amount = toNumberOrNull(row.amount);
      const seen = merged.get(id);
      if (!seen) {
        merged.set(id, { invoice: id, amount });
      } else if (amount !== null) {
        seen.amount = money((seen.amount ?? 0) + amount);
      }
    }

    const wanted = [...merged.values()];
    const ids = wanted.map((row) => row.invoice);
    if (ids.some((id) => !mongoose.isValidObjectId(id))) {
      return res.status(400).json({ message: "One of the chosen loads is not valid." });
    }

    const found = await Invoice.find({ _id: { $in: ids }, direction: "AR" });
    const byId = new Map(found.map((invoice) => [String(invoice._id), invoice]));

    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length) {
      return res.status(404).json({
        message: "One of the chosen invoices no longer exists. Refresh and try again.",
      });
    }

    const voided = found.filter((invoice) => invoice.status === "VOID");
    if (voided.length) {
      return res.status(400).json({
        message: `${voided.map((i) => i.invoiceNumber).join(", ")} ${voided.length === 1 ? "is" : "are"} void. Reopen or deselect before receiving against ${voided.length === 1 ? "it" : "them"}.`,
      });
    }

    const settled = found.filter((invoice) => money(invoice.balance) <= 0);
    if (settled.length) {
      return res.status(400).json({
        message: `${settled.map((i) => i.invoiceNumber).join(", ")} ${settled.length === 1 ? "has" : "have"} nothing outstanding. Deselect ${settled.length === 1 ? "it" : "them"} and try again.`,
      });
    }

    // One payment settles one customer. Two customers' money arriving as one
    // row is not a payment, it is two — and the ledger for each would be wrong.
    const parties = new Set(found.map((invoice) => String(invoice.party?.id || "")));
    if (parties.size > 1) {
      return res.status(400).json({
        message:
          "Those loads belong to different customers. Record one payment per customer.",
      });
    }

    const method = trimmed(req.body.method).toUpperCase();
    const problem = validatePaymentReference({
      method,
      documentNumber: req.body.documentNumber,
    });
    if (problem) return res.status(400).json({ message: problem });

    // Due date first: the oldest debt is the one a payment clears unless
    // somebody says otherwise.
    const ordered = ids
      .map((id) => byId.get(id))
      .sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));

    const outstanding = money(
      ordered.reduce((sum, invoice) => sum + money(invoice.balance), 0),
    );

    const explicit = wanted.some((row) => toNumberOrNull(row.amount) !== null);

    let allocations;

    if (explicit) {
      allocations = wanted.map((row) => ({
        invoice: byId.get(trimmed(row.invoice)),
        amount: money(toNumberOrNull(row.amount) ?? 0),
      }));
    } else {
      const amount = toNumberOrNull(req.body.amount);
      if (amount === null || amount <= 0) {
        return res.status(400).json({ message: "Enter the amount that was received." });
      }

      if (amount > outstanding + 0.005) {
        return res.status(400).json({
          message: `That is more than the $${outstanding.toLocaleString("en-US")} outstanding on the loads chosen. Check the amount, choose more loads, or set the amounts per load if the customer overpaid.`,
        });
      }

      allocations =
        trimmed(req.body.strategy).toUpperCase() === "PROPORTIONAL"
          ? allocateProportionally(ordered, amount)
          : allocateOldestFirst(ordered, amount);
    }

    // ── Overpayment ─────────────────────────────────────────────────────────
    // Paying more than a load owes is refused unless the caller says, in the
    // request, that it meant to. Most of the time an over-application is a typo
    // or money landing on the wrong load, and absorbing it silently leaves a
    // customer in credit that nobody knows about until they ask for it back.
    //
    // But it does genuinely happen — a customer rounds up, or pays an old
    // balance twice — and refusing outright just means the clerk enters a
    // figure that is not the figure that arrived. So the excess is recordable,
    // as an explicit act: the form asks whether they really overpaid on this
    // load, and only then sends this flag. The surplus lands on the invoice as
    // `overpaid`, which is credit held for that customer.
    const allowOverpayment = String(req.body.allowOverpayment) === "true";

    for (const row of allocations) {
      if (row.amount < 0) {
        return res.status(400).json({ message: "An amount cannot be negative." });
      }
      if (!allowOverpayment && row.amount > money(row.invoice.balance) + 0.005) {
        return res.status(400).json({
          message: `$${row.amount.toLocaleString("en-US")} is more than the $${money(row.invoice.balance).toLocaleString("en-US")} outstanding on ${row.invoice.invoiceNumber}. Confirm the overpayment if that is what arrived.`,
        });
      }
    }

    const applying = allocations.filter((row) => row.amount > 0);
    if (!applying.length) {
      return res.status(400).json({
        message: "Nothing would be applied. Enter an amount, or choose a load with a balance.",
      });
    }

    const batchId = new mongoose.Types.ObjectId().toString();
    const total = money(applying.reduce((sum, row) => sum + row.amount, 0));
    const paidOn = calendarDate(req.body.paidOn) || calendarDate(new Date());
    const recordedByName =
      [req.user?.firstName, req.user?.lastName].filter(Boolean).join(" ") || "";

    const results = [];

    for (const row of applying) {
      const invoice = row.invoice;
      const before = money(invoice.balance);

      const payment = new Payment({
        paymentNumber: await nextSequence("receipt", req.locationId),
        direction: "RECEIVED",
        invoice: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        load: invoice.load,
        loadId: invoice.loadId,
        party: {
          kind: invoice.party?.kind,
          id: invoice.party?.id,
          name: invoice.party?.name,
        },
        amount: row.amount,
        currency: invoice.currency || "USD",
        paidOn,
        method,
        documentNumber: trimmed(req.body.documentNumber),
        bankName: trimmed(req.body.bankName),
        note: trimmed(req.body.note),
        batch: { id: batchId, total, count: applying.length },
        recordedBy: req.user?._id,
        recordedByName,
      });

      await payment.save();

      // Re-added from the collection, never incremented. See the note at the
      // top of this file.
      await syncInvoicePayments(invoice);

      const load = invoice.load ? await Load.findById(invoice.load) : null;
      if (load) {
        const spec = METHOD_BY_KEY.get(method);
        await audit
          .recordFinancial({
            load,
            action: "payment.received",
            summary:
              `$${payment.amount.toLocaleString("en-US")} received from ${payment.party?.name || "\u2014"} ` +
              `against ${invoice.invoiceNumber} by ${spec?.label || method}` +
              `${payment.documentNumber ? ` (${spec?.documentLabel || "ref"} ${payment.documentNumber})` : ""}` +
              `${applying.length > 1 ? `, part of a $${total.toLocaleString("en-US")} payment covering ${applying.length} loads` : ""}` +
              `${money(invoice.overpaid || 0) > 0 ? `. $${money(invoice.overpaid).toLocaleString("en-US")} of it is over the amount billed and is held as advance` : ""}`,
            changes: [
              {
                field: `invoice.${invoice.invoiceNumber}.balance`,
                label: "Outstanding",
                from: `$${before.toLocaleString("en-US")}`,
                to: `$${money(invoice.balance).toLocaleString("en-US")}`,
              },
            ],
            user: req.user,
            req,
          })
          .catch((error) =>
            console.error(`Payment audit failed for ${load.loadId}:`, error.message),
          );
      }

      results.push({
        invoiceId: String(invoice._id),
        invoiceNumber: invoice.invoiceNumber,
        loadId: invoice.loadId || "",
        applied: payment.amount,
        balance: money(invoice.balance),
        overpaid: money(invoice.overpaid || 0),
        cleared: money(invoice.balance) <= 0,
        paymentNumber: payment.paymentNumber,
      });
    }

    const cleared = results.filter((row) => row.cleared).length;
    const stillOwing = money(
      results.reduce((sum, row) => sum + row.balance, 0),
    );
    const credit = money(results.reduce((sum, row) => sum + row.overpaid, 0));

    res.status(201).json({
      message:
        `$${total.toLocaleString("en-US")} received against ${results.length} load${results.length === 1 ? "" : "s"}. ` +
        (cleared === results.length
          ? "All settled in full."
          : `${cleared} cleared, $${stillOwing.toLocaleString("en-US")} still outstanding on the rest.`) +
        // Said out loud, because a credit nobody is told about is a credit
        // nobody applies to the customer's next load.
        (credit > 0
          ? ` $${credit.toLocaleString("en-US")} more than owed — held as advance for ${found[0]?.party?.name || "this customer"}.`
          : ""),
      batchId,
      total,
      cleared,
      credit,
      rows: results,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Settle several payables in one go
// @route   POST /api/payments/settle
// @access  Private (staff, admin)
//
// ── Why this is not receivePayment with a flag ───────────────────────────────
// Receivables and payables look symmetrical and are not. Money IN arrives as one
// lump that has to be divided across loads, which is the whole difficulty of
// receivePayment — the split, the strategies, the preview. Money OUT is decided
// per bill before it leaves: the office is not dividing a cheque, it is working
// down a list of carriers and settling each in full.
//
// So this takes no amount and no strategy. Every bill ticked is paid to its
// outstanding balance. A carrier being paid part of what they are owed is a
// deliberate act and belongs in the single-invoice form, where somebody has to
// type the figure.
const settleBills = async (req, res) => {
  try {
    const submitted = Array.isArray(req.body.invoices) ? req.body.invoices : [];
    if (!submitted.length) {
      return res.status(400).json({ message: "Choose at least one bill to settle." });
    }

    // The same bill ticked twice is one bill. Left in, it would be paid twice.
    const ids = [...new Set(submitted.map((entry) => trimmed(entry.invoice ?? entry)))];

    if (ids.some((id) => !mongoose.isValidObjectId(id))) {
      return res.status(400).json({ message: "One of the chosen bills is not valid." });
    }

    const found = await Invoice.find({ _id: { $in: ids }, direction: "AP" });
    if (found.length !== ids.length) {
      return res.status(404).json({
        message:
          "One of the chosen bills no longer exists, or is not a payable. Refresh and try again.",
      });
    }

    const voided = found.filter((invoice) => invoice.status === "VOID");
    if (voided.length) {
      return res.status(400).json({
        message: `${voided.map((i) => i.invoiceNumber).join(", ")} ${voided.length === 1 ? "is" : "are"} void. Deselect ${voided.length === 1 ? "it" : "them"} and try again.`,
      });
    }

    const settled = found.filter((invoice) => money(invoice.balance) <= 0);
    if (settled.length) {
      return res.status(400).json({
        message: `${settled.map((i) => i.invoiceNumber).join(", ")} ${settled.length === 1 ? "has" : "have"} already been paid. Deselect ${settled.length === 1 ? "it" : "them"} and try again.`,
      });
    }

    const method = trimmed(req.body.method).toUpperCase();
    const documentNumber = trimmed(req.body.documentNumber);
    const spec = METHOD_BY_KEY.get(method);

    // ── One instrument, one payee ───────────────────────────────────────────
    // A run is happy to span carriers — an afternoon's payables work is exactly
    // that. What it cannot do is give them a shared cheque number: the number
    // identifies one physical instrument, and copying it onto four payments to
    // four carriers makes the register say something that is not true, which is
    // discovered months later by whoever is reconciling the bank statement.
    //
    // Checked before the method's own rule, so somebody settling five carriers
    // by cheque is told what is actually wrong rather than being asked for a
    // number they could not correctly supply anyway.
    const payees = new Set(
      found.map((invoice) => String(invoice.party?.id || invoice.party?.name || "")),
    );
    if (payees.size > 1 && (spec?.documentRequired || documentNumber)) {
      return res.status(400).json({
        message: `Those bills are for ${payees.size} different payees, so they cannot share one ${(spec?.documentLabel || "reference").toLowerCase()}. Settle one payee at a time, or use a method that does not carry one.`,
      });
    }

    const problem = validatePaymentReference({ method, documentNumber });
    if (problem) return res.status(400).json({ message: problem });

    const batchId = new mongoose.Types.ObjectId().toString();
    const total = money(found.reduce((sum, invoice) => sum + money(invoice.balance), 0));
    const paidOn = calendarDate(req.body.paidOn) || calendarDate(new Date());
    const recordedByName =
      [req.user?.firstName, req.user?.lastName].filter(Boolean).join(" ") || "";

    // Oldest first, so the payment numbers run in the order the debts did.
    const ordered = found.sort(
      (a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0),
    );

    const results = [];

    for (const invoice of ordered) {
      const before = money(invoice.balance);

      const payment = new Payment({
        paymentNumber: await nextSequence("payment", req.locationId),
        direction: "PAID",
        invoice: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        load: invoice.load,
        loadId: invoice.loadId,
        party: {
          kind: invoice.party?.kind,
          id: invoice.party?.id,
          name: invoice.party?.name,
        },
        amount: before,
        currency: invoice.currency || "USD",
        paidOn,
        method,
        documentNumber,
        bankName: trimmed(req.body.bankName),
        note: trimmed(req.body.note),
        batch: { id: batchId, total, count: ordered.length },
        recordedBy: req.user?._id,
        recordedByName,
      });

      await payment.save();

      // Re-added from the collection, never incremented. See the note at the
      // top of this file.
      await syncInvoicePayments(invoice);

      const load = invoice.load ? await Load.findById(invoice.load) : null;
      if (load) {
        await audit
          .recordFinancial({
            load,
            action: "payment.paid",
            summary:
              `$${payment.amount.toLocaleString("en-US")} paid to ${payment.party?.name || "—"} ` +
              `against ${invoice.invoiceNumber} by ${spec?.label || method}` +
              `${documentNumber ? ` (${spec?.documentLabel || "ref"} ${documentNumber})` : ""}` +
              `${ordered.length > 1 ? `, part of a $${total.toLocaleString("en-US")} payment run covering ${ordered.length} bills` : ""}`,
            changes: [
              {
                field: `invoice.${invoice.invoiceNumber}.balance`,
                label: "Outstanding",
                from: `$${before.toLocaleString("en-US")}`,
                to: `$${money(invoice.balance).toLocaleString("en-US")}`,
              },
            ],
            user: req.user,
            req,
          })
          .catch((error) =>
            console.error(`Payment audit failed for ${load.loadId}:`, error.message),
          );
      }

      results.push({
        invoiceId: String(invoice._id),
        invoiceNumber: invoice.invoiceNumber,
        loadId: invoice.loadId || "",
        payee: invoice.party?.name || "",
        applied: payment.amount,
        balance: money(invoice.balance),
        status: invoice.status,
        paymentNumber: payment.paymentNumber,
      });
    }

    res.status(201).json({
      message: `$${total.toLocaleString("en-US")} paid across ${results.length} bill${results.length === 1 ? "" : "s"}. Marked as paid in full.`,
      batchId,
      total,
      rows: results,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

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
  receivePayment,
  settleBills,
  getMethods,
  recordPayment,
  listPayments,
  reversePayment,
  sendReceipt,
  present,
};
