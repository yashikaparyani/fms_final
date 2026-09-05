// ─── Payment methods ──────────────────────────────────────────────────────────
// How money actually moved, and the reference that proves it did.
//
// Every payment carries a document number, and the whole point of this file is
// that "document number" means something different for each method: a cheque has
// a cheque number, a wire has a Fed reference, a card has an authorisation code.
// Labelling the field generically produces a column full of numbers nobody can
// match against a bank statement, which is exactly the reconciliation problem
// the field exists to solve.
//
// So each method names its own label, its own placeholder, and whether the
// reference is genuinely required. Cash is the only one where it is not — there
// is no number to quote — and it asks for a receipt number instead, optionally.
// ─────────────────────────────────────────────────────────────────────────────

const PAYMENT_METHODS = [
  {
    key: "CHECK",
    label: "Cheque",
    // What to call the document number when this method is chosen.
    documentLabel: "Cheque Number",
    documentPlaceholder: "e.g. 100482",
    documentRequired: true,
    // A cheque is written by a bank; knowing which one is half of tracing it.
    asksBank: true,
    help: "Paper cheque. Record the number printed on the cheque itself.",
  },
  {
    key: "ACH",
    label: "ACH / EFT",
    documentLabel: "Trace Number",
    documentPlaceholder: "e.g. 021000021234567",
    documentRequired: true,
    asksBank: true,
    help: "Bank-to-bank transfer. The trace number is on the ACH advice.",
  },
  {
    key: "WIRE",
    label: "Wire Transfer",
    documentLabel: "Wire Reference / IMAD",
    documentPlaceholder: "e.g. 20240612MMQFMP0K001234",
    documentRequired: true,
    asksBank: true,
    help: "Same-day wire. Quote the reference the sending bank issued.",
  },
  {
    key: "CARD",
    label: "Credit / Debit Card",
    documentLabel: "Authorisation Code",
    documentPlaceholder: "e.g. AUTH-8842190",
    documentRequired: true,
    asksBank: false,
    help: "Card payment. The authorisation or approval code from the processor.",
  },
  {
    key: "CASH",
    label: "Cash",
    documentLabel: "Receipt Number",
    documentPlaceholder: "e.g. R-0042",
    // The only method with nothing issued by a third party to quote. Asking for
    // one anyway would only get a made-up number, which is worse than a blank.
    documentRequired: false,
    asksBank: false,
    help: "Cash in hand. Enter your own receipt number if you issued one.",
  },
  {
    key: "OTHER",
    label: "Other",
    documentLabel: "Reference Number",
    documentPlaceholder: "Any reference that identifies this payment",
    documentRequired: true,
    asksBank: false,
    help: "Anything not listed. Say what it was in the note.",
  },
];

const METHOD_BY_KEY = new Map(PAYMENT_METHODS.map((m) => [m.key, m]));

const METHOD_KEYS = PAYMENT_METHODS.map((m) => m.key);

/** The method's own name for its reference field — "Cheque Number", not "Reference". */
const documentLabelFor = (key) =>
  METHOD_BY_KEY.get(key)?.documentLabel || "Reference Number";

const isValidMethod = (key) => METHOD_BY_KEY.has(String(key || "").toUpperCase());

/**
 * Why a payment cannot be saved, or null if it can.
 *
 * The document number rule lives here rather than in the controller so the
 * form, the API and any import path all refuse the same rows.
 */
const validatePaymentReference = ({ method, documentNumber }) => {
  const spec = METHOD_BY_KEY.get(String(method || "").toUpperCase());
  if (!spec) return "Choose how the payment was made.";

  if (spec.documentRequired && !String(documentNumber || "").trim()) {
    return `${spec.documentLabel} is required for a ${spec.label.toLowerCase()} payment.`;
  }

  return null;
};

const catalog = () => PAYMENT_METHODS.map((m) => ({ ...m }));

module.exports = {
  PAYMENT_METHODS,
  METHOD_BY_KEY,
  METHOD_KEYS,
  documentLabelFor,
  isValidMethod,
  validatePaymentReference,
  catalog,
};
