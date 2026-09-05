const { sendEmail } = require("../utils/mailer");
const templates = require("./accountingEmailTemplates");
const { renderInvoicePdf, titleFor } = require("./invoiceDocumentService");
const { METHOD_BY_KEY } = require("../config/paymentMethods");

// ─── Sending money mail ───────────────────────────────────────────────────────
// One place that knows how to put an invoice in front of somebody: pick the
// address, render the PDF, choose the template, send it, and report back what
// actually happened.
//
// ── Why every function returns a status instead of throwing ──────────────────
// Email is the least reliable thing in this system and the most peripheral to
// it. An invoice that was raised correctly but could not be mailed — SMTP down,
// customer has no accounts address on file — must still be a raised invoice. If
// these threw, the caller's choices would be to lose the invoice or to swallow
// the error, and swallowing it is how "I never received it" becomes unanswerable
// six weeks later.
//
// So a failure comes back as { sent: false, reason }, the caller records it, and
// the screen says "invoice raised, email not sent: no billing address on file" —
// which is a thing somebody can fix.
// ─────────────────────────────────────────────────────────────────────────────

const toStatus = (result) => ({
  requested: !!result?.requested,
  attempted: !!result?.attempted,
  sent: !!result?.sent,
  skipped: !!result?.skipped,
  reason: result?.reason || null,
  message: result?.message || "",
});

const NO_ADDRESS = {
  requested: false,
  attempted: false,
  sent: false,
  skipped: true,
  reason: "NO_RECIPIENT",
  message: "",
};

/**
 * Where this invoice should go, and why there is nowhere if there isn't.
 *
 * An explicit override wins — staff routinely need to send a copy to a second
 * address a customer names on the phone — then the party's own address as it was
 * snapshotted onto the invoice.
 */
const recipientFor = (invoice, override) => {
  const to = String(override || invoice?.party?.email || "").trim();

  if (to) return { to, problem: null };

  const who =
    invoice?.party?.kind === "CUSTOMER"
      ? "customer"
      : invoice?.party?.kind === "DRIVER"
        ? "driver"
        : "carrier";

  return {
    to: "",
    problem: `No email address on file for this ${who}. Add one to their record, or type an address to send to.`,
  };
};

/** The PDF, named the way a filing system wants it. */
const attachmentFor = async (invoice) => {
  const buffer = await renderInvoicePdf(invoice);

  return {
    filename: `${String(invoice.invoiceNumber).replace(/[^\w.-]+/g, "_")}.pdf`,
    content: buffer,
    contentType: "application/pdf",
  };
};

/**
 * Send an invoice or settlement, PDF attached.
 *
 * Does NOT mark the invoice as sent — that is the caller's to do, and only if
 * this reports success. Doing it here would mean an invoice that failed to send
 * still shows as sent, and a frozen document nobody has.
 */
const sendInvoice = async ({ invoice, load, to, cc, message }) => {
  const { to: address, problem } = recipientFor(invoice, to);
  if (!address) return { ...NO_ADDRESS, message: problem };

  // A covering note from whoever pressed send goes to the template as data, not
  // spliced into its rendered HTML — the template escapes it and decides where
  // it sits. It is deliberately not the invoice's `memo`: the memo is part of
  // the document and prints on the PDF, this is only what was said in the mail.
  const template = templates.invoiceIssued({ invoice, load, message });

  const result = await sendEmail({
    to: address,
    cc: cc || undefined,
    subject: template.subject,
    text: template.text,
    html: template.html,
    attachments: [await attachmentFor(invoice)],
  });

  return { ...toStatus(result), to: address };
};

/**
 * Chase an unpaid invoice.
 *
 * The PDF goes again with every reminder. It costs nothing and removes the most
 * common stalling answer — "we can't find the invoice" — from the conversation.
 */
const sendReminder = async ({ invoice, daysOverdue, to }) => {
  const { to: address, problem } = recipientFor(invoice, to);
  if (!address) return { ...NO_ADDRESS, message: problem };

  const template = templates.paymentReminder({ invoice, daysOverdue });

  const result = await sendEmail({
    to: address,
    subject: template.subject,
    text: template.text,
    html: template.html,
    attachments: [await attachmentFor(invoice)],
  });

  return { ...toStatus(result), to: address };
};

/**
 * Confirm a payment landed.
 *
 * No PDF: the receipt is the email. Attaching the invoice again alongside a
 * "thank you, this is paid" reads as another demand.
 */
const sendReceipt = async ({ payment, invoice, to }) => {
  const { to: address, problem } = recipientFor(invoice, to);
  if (!address) return { ...NO_ADDRESS, message: problem };

  const spec = METHOD_BY_KEY.get(payment.method);

  const template = templates.paymentReceipt({
    payment,
    invoice,
    methodLabel: spec?.label || payment.method,
    documentLabel: spec?.documentLabel || "Reference",
  });

  const result = await sendEmail({
    to: address,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });

  return { ...toStatus(result), to: address };
};

/** Everything a party still owes, as one letter. */
const sendStatement = async ({ customerName, rows, totals, aging, issuer, to }) => {
  const address = String(to || "").trim();
  if (!address) {
    return {
      ...NO_ADDRESS,
      message: "No billing email on file for this customer.",
    };
  }

  const template = templates.customerStatement({
    customerName,
    rows,
    totals,
    aging,
    issuer,
    asOf: new Date(),
  });

  const result = await sendEmail({
    to: address,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });

  return { ...toStatus(result), to: address };
};

module.exports = {
  recipientFor,
  attachmentFor,
  sendInvoice,
  sendReminder,
  sendReceipt,
  sendStatement,
  titleFor,
};
