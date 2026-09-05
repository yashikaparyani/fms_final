const mongoose = require("mongoose");
const tenantScope = require("../plugins/tenantScope");
const { totalsByKind, money } = require("../config/chargeTypes");
// Invoice, due and payment dates are calendar dates, not instants — see
// utils/dates.js for why they are anchored at UTC midnight and never touched
// with local-time arithmetic.
const { calendarDate, addDays, daysBetween, todayKey } = require("../utils/dates");

// ─── Invoice ──────────────────────────────────────────────────────────────────
// The document itself: what was billed, to whom, on what date, and what is
// still owed on it.
//
// ── Why this is not just a view over Load.accounting ─────────────────────────
// The load's ledger is working data — staff edit it as the job runs, add a
// detention charge on Tuesday, correct a chassis rate on Thursday. An invoice is
// the opposite: once it has been sent to a customer it is a claim on them, and
// it must say tomorrow exactly what it said when they received it. Deriving it
// live from the ledger would mean a rate correction silently rewrites a bill
// somebody has already paid against.
//
// So an invoice is a SNAPSHOT, taken from the ledger at issue time and frozen.
// Re-issuing is an explicit act — see invoiceService.regenerate — and it is
// refused once the invoice has been sent or paid against.
//
// ── Two directions, one model ────────────────────────────────────────────────
// AR — what the customer owes us. Numbered as the load itself: "LD 0014".
// AP — what we owe a carrier or a driver. Numbered "LD 0014-AP1", one per
//      carrier leg or driver, so a split load settles carrier by carrier.
//
// They are the same document read from opposite ends, and keeping them in one
// collection is what makes "everything outstanding on this load" a single query
// rather than a join nobody remembers to write.
// ─────────────────────────────────────────────────────────────────────────────

// A billed line. Frozen at issue: `label` is stored rather than looked up from
// the catalog on read, because renaming a charge type next year must not change
// the wording on an invoice already in a customer's filing cabinet.
const invoiceLineSchema = new mongoose.Schema(
  {
    // Empty on a manual invoice line, which is free text by design.
    chargeType: { type: String, trim: true },
    label: { type: String, trim: true, required: true },
    kind: {
      type: String,
      enum: ["linehaul", "accessorial", "settlement"],
      default: "accessorial",
    },
    description: { type: String, trim: true },
    // The day the service was performed, printed in the Date column. Distinct
    // from the invoice's own issue date: a bill raised at month end for three
    // moves made on three different days has to say which was which.
    date: { type: Date },
    quantity: { type: Number },
    rate: { type: Number },
    amount: { type: Number, default: 0 },
  },
  { _id: false },
);

// Who the invoice is addressed to. Snapshotted for the same reason as the lines:
// a customer who moves office next month has not moved the address the bill was
// sent to.
const partySchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["CUSTOMER", "CARRIER", "DRIVER"],
      required: true,
    },
    // Points at User (customer), FleetOwner (carrier) or Driver.
    id: { type: mongoose.Schema.Types.ObjectId },
    name: { type: String, trim: true },
    code: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
  },
  { _id: false },
);

// Us, as the customer sees us on the page. Taken from the branch the load
// belongs to, so a two-branch business bills under two letterheads.
const issuerSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    code: { type: String, trim: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    zip: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true },
    website: { type: String, trim: true },
  },
  { _id: false },
);

// The delivery address, kept apart from `party` because it is not a party — no
// invoice is ever addressed to it and it has no email, phone or account code.
const shipToSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    address: { type: String, trim: true },
  },
  { _id: false },
);

// One line of the reference block. `label` carries its own punctuation-free
// wording ("TRAILER #") and the renderer supplies the separator, so a label
// typed with a trailing colon does not print two.
const referenceSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, required: true },
    value: { type: String, trim: true, required: true },
  },
  { _id: false },
);

const reminderSchema = new mongoose.Schema(
  {
    sentAt: { type: Date, default: Date.now },
    to: { type: String, trim: true },
    // MANUAL when somebody pressed the button, AUTO when the nightly sweep sent
    // it. Worth distinguishing: a customer asking "why are you chasing me" is
    // owed a truthful answer about who chased them.
    trigger: { type: String, enum: ["MANUAL", "AUTO"], default: "MANUAL" },
    daysOverdue: { type: Number },
    sent: { type: Boolean, default: false },
    note: { type: String, trim: true },
  },
  { _id: false },
);

// Net terms decide the due date, and the resulting date is stored rather than
// derived on read so changing the house default does not move the due date on
// bills already out.
const TERMS = {
  DUE_ON_RECEIPT: { label: "Due on receipt", days: 0 },
  NET_7: { label: "Net 7", days: 7 },
  NET_15: { label: "Net 15", days: 15 },
  NET_30: { label: "Net 30", days: 30 },
  NET_45: { label: "Net 45", days: 45 },
  NET_60: { label: "Net 60", days: 60 },
};

const invoiceSchema = new mongoose.Schema(
  {
    // "LD 0014" for a customer invoice, "LD 0014-AP1" for a carrier bill,
    // "NY-MI-0001" for one typed by hand. Assigned by invoiceService, never here
    // — the numbering rules differ per direction and belong in one place.
    invoiceNumber: { type: String, required: true, unique: true, index: true },

    direction: { type: String, enum: ["AR", "AP"], required: true, index: true },

    kind: { type: String, enum: ["LOAD", "MANUAL"], default: "LOAD" },

    load: { type: mongoose.Schema.Types.ObjectId, ref: "Load", index: true },
    loadId: { type: String, trim: true, index: true },

    // Which carrier leg this AP bill settles, on a split load. Null on an AR
    // invoice and on a single-carrier AP bill.
    legId: { type: mongoose.Schema.Types.ObjectId },

    party: partySchema,
    issuer: issuerSchema,

    // Where the freight actually went, printed beside the billing address. The
    // customer's accounts department is in one city and the warehouse is in
    // another; the clerk matching this bill to a purchase order is looking for
    // the warehouse. Snapshotted for the same reason as `party`.
    shipTo: shipToSchema,

    // "TRAILER # : TCKU6245871", "Ref # : SSFOSE26255224" — the numbers the
    // customer files this bill under. Held as label/value pairs rather than
    // named columns because which of them matters differs per customer, and a
    // load carrying a seal number that one account wants quoted must not need a
    // schema change to print it.
    references: { type: [referenceSchema], default: [] },

    lines: [invoiceLineSchema],

    currency: { type: String, default: "USD" },

    issueDate: { type: Date, default: Date.now },
    terms: {
      type: String,
      enum: Object.keys(TERMS),
      default: "NET_30",
    },
    dueDate: { type: Date },

    // ── Money ────────────────────────────────────────────────────────────────
    // All of these are derived by the pre-save hook below and never written by a
    // caller. Held rather than computed on read because an invoice is queried in
    // aggregate — an aging report reads thousands of them and cannot afford to
    // re-total each one, and a sort on "biggest balance" needs the number in the
    // index.
    subtotal: { type: Number, default: 0 },
    // Money already taken before the invoice was raised — an advance on the
    // load. Not a payment against this document, but it does reduce the balance.
    advanceApplied: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },

    // DRAFT   — raised, not yet sent. Still freely re-generated from the ledger.
    // SENT    — the other side has it. Frozen.
    // PARTIAL — some money in, some still owed.
    // PAID    — settled.
    // VOID    — cancelled. Kept, never deleted: a gap in the invoice numbers is
    //           the first thing an auditor asks about.
    status: {
      type: String,
      enum: ["DRAFT", "SENT", "PARTIAL", "PAID", "VOID"],
      default: "DRAFT",
      index: true,
    },

    sentAt: { type: Date },
    sentTo: { type: String, trim: true },
    reminders: [reminderSchema],

    // Shown on the document, above and below the line items.
    memo: { type: String, trim: true },
    notes: { type: String, trim: true },

    voidedAt: { type: Date },
    voidReason: { type: String, trim: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// The two queries every accounting screen runs: one party's open items, and
// everything overdue.
invoiceSchema.index({ direction: 1, "party.id": 1, status: 1 });
invoiceSchema.index({ direction: 1, dueDate: 1, status: 1 });

// ===================== TOTALS AND STATUS FOLLOW THE LINES =====================
// One hook rather than four callers each remembering to re-total. The arithmetic
// defers to config/chargeTypes.js — an advance is a settlement and must never be
// summed into the total, and that rule is not restated here.
//
// Totalled by the line's own `kind` rather than by looking its charge type up in
// the catalog, because an invoice line is frozen and a hand-typed one has no
// catalog entry at all. Same arithmetic either way — see totalsByKind.
invoiceSchema.pre("save", function recomputeTotals() {
  const totals = totalsByKind(this.lines || []);

  this.subtotal = totals.total;
  this.advanceApplied = totals.settled;
  this.total = totals.total;
  this.balance = money(this.total - this.advanceApplied - (this.amountPaid || 0));

  // VOID is a decision, not a consequence of the numbers, so it is never
  // overwritten here — a voided invoice with a balance is still void.
  if (this.status === "VOID") return;

  if (this.total > 0 && this.balance <= 0) {
    this.status = "PAID";
  } else if ((this.amountPaid || 0) > 0 || this.advanceApplied > 0) {
    this.status = "PARTIAL";
  } else if (this.sentAt) {
    this.status = "SENT";
  } else {
    this.status = "DRAFT";
  }
});

// ===================== DUE DATE FOLLOWS THE TERMS =====================
// Only ever filled in, never corrected: staff are allowed to override a due date
// on a particular invoice, and recomputing it from the terms on every save would
// undo that silently.
invoiceSchema.pre("save", function fillDueDate() {
  // Both dates are normalised to UTC midnight whether or not the due date was
  // supplied, so an invoice raised at 9pm and one raised at 9am are the same
  // calendar date rather than one of them quietly belonging to tomorrow.
  this.issueDate = calendarDate(this.issueDate) || calendarDate(todayKey());

  if (this.dueDate) {
    this.dueDate = calendarDate(this.dueDate);
    return;
  }

  this.dueDate = addDays(this.issueDate, TERMS[this.terms]?.days ?? 30);
});

/**
 * True once this invoice is a claim on somebody rather than a draft.
 *
 * The gate on regenerating from the ledger: a draft can be rebuilt freely, a
 * sent or part-paid invoice cannot be rewritten under the person holding it.
 */
invoiceSchema.methods.isFrozen = function () {
  return this.status !== "DRAFT" || !!this.sentAt || (this.amountPaid || 0) > 0;
};

/**
 * Days past due, or 0 if it is not.
 *
 * A paid or void invoice is never overdue however old it is — asking "is this
 * late" about money already in the bank is how a reminder gets sent to somebody
 * who paid last week.
 */
invoiceSchema.methods.daysOverdue = function () {
  if (!this.dueDate) return 0;
  if (this.status === "PAID" || this.status === "VOID") return 0;
  if (this.balance <= 0) return 0;

  // Counted between calendar days rather than by dividing a millisecond
  // difference: the latter reports one day short whenever the clocks changed
  // between the due date and today, and it makes an invoice due later the same
  // day look overdue already.
  const days = daysBetween(this.dueDate, todayKey());
  return days > 0 ? days : 0;
};

// Per-location data — scoping is enforced centrally, see plugins/tenantScope.js.
invoiceSchema.plugin(tenantScope, { modelName: "Invoice" });

const Invoice = mongoose.model("Invoice", invoiceSchema);

module.exports = Invoice;
module.exports.TERMS = TERMS;
