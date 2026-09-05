const mongoose = require("mongoose");
const tenantScope = require("../plugins/tenantScope");
const { METHOD_KEYS } = require("../config/paymentMethods");

// ─── Payment ──────────────────────────────────────────────────────────────────
// One movement of money, in either direction: received from a customer, or paid
// out to a carrier or a driver.
//
// ── Why payments are their own collection ────────────────────────────────────
// The obvious shortcut is a `paidAt` and a `paidAmount` on the invoice. It works
// until the first customer pays half now and half in three weeks, or pays four
// invoices with one cheque — at which point there is nowhere to put the second
// date, and nowhere to record that cheque number 100482 covered LD 0014 and
// LD 0021 both. Real freight billing is part-paid and batch-paid constantly, so
// payments are events and the invoice merely totals them.
//
// ── The document number ──────────────────────────────────────────────────────
// Every payment carries the reference that proves it happened — cheque number,
// ACH trace, wire IMAD, card authorisation. Which of those it is depends on the
// method, and config/paymentMethods.js owns that mapping including whether the
// reference is required at all. Without it a payment row cannot be matched to a
// line on a bank statement, which is the only reason to keep the row.
// ─────────────────────────────────────────────────────────────────────────────

const paymentSchema = new mongoose.Schema(
  {
    // "RCP-0001" for money in, "PMT-0001" for money out. Assigned in
    // paymentController on create.
    paymentNumber: { type: String, required: true, unique: true, index: true },

    // RECEIVED settles an AR invoice, PAID settles an AP bill. The pairing is
    // enforced in the controller — recording a receipt against a carrier bill
    // would make both the AR and the AP report wrong at once.
    direction: {
      type: String,
      enum: ["RECEIVED", "PAID"],
      required: true,
      index: true,
    },

    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      required: true,
      index: true,
    },
    // Denormalised so the payment register reads without a populate, and so the
    // row still says which bill it settled if the invoice is ever voided.
    invoiceNumber: { type: String, trim: true, index: true },

    load: { type: mongoose.Schema.Types.ObjectId, ref: "Load" },
    loadId: { type: String, trim: true, index: true },

    party: {
      kind: { type: String, enum: ["CUSTOMER", "CARRIER", "DRIVER"] },
      id: { type: mongoose.Schema.Types.ObjectId },
      name: { type: String, trim: true },
    },

    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "USD" },

    // When the money actually moved, which is not when the row was typed. A
    // cheque dated the 28th entered on the 2nd belongs in the 28th's month.
    paidOn: { type: Date, default: Date.now, index: true },

    method: { type: String, enum: METHOD_KEYS, required: true },

    // Cheque number, ACH trace, wire reference, authorisation code — whichever
    // the method calls for. See config/paymentMethods.js.
    documentNumber: { type: String, trim: true },

    // Which bank the cheque or transfer moved through. Asked for only on the
    // methods where it exists.
    bankName: { type: String, trim: true },

    note: { type: String, trim: true },

    // Reversal rather than deletion: a payment that turns out to be a bounced
    // cheque must leave a trace, because the invoice went from paid back to
    // outstanding and somebody will ask why.
    reversedAt: { type: Date },
    reversedReason: { type: String, trim: true },
    reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    recordedByName: { type: String, trim: true },
  },
  { timestamps: true },
);

// The payment register: everything that moved in a date range, newest first.
paymentSchema.index({ direction: 1, paidOn: -1 });
// One party's payment history, for the customer and carrier ledgers.
paymentSchema.index({ "party.id": 1, paidOn: -1 });

/** A reversed payment still exists but no longer counts toward anything. */
paymentSchema.methods.isLive = function () {
  return !this.reversedAt;
};

// Per-location data — scoping is enforced centrally, see plugins/tenantScope.js.
paymentSchema.plugin(tenantScope, { modelName: "Payment" });

module.exports = mongoose.model("Payment", paymentSchema);
