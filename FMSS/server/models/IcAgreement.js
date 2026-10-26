const mongoose = require("mongoose");

// ─── IC agreement submission ──────────────────────────────────────────────────
// What a contractor typed into the standalone Empire Transportation IC agreement
// form (ic-agreement-form/, served on the server's bare IP), kept so the office
// can find, re-download or re-open an agreement later from the form's admin
// panel.
//
// Deliberately NOT tenant scoped: the form is a separate tool with no notion of
// an FMSS location, and the only people who read these back are the IC admins
// named in IC_ADMIN_EMAILS — see utils/icAdmin.js.
//
// The PDF itself is not stored. It is rebuilt in the browser from these fields
// and the template, which is what the form does for every preview anyway.
// ─────────────────────────────────────────────────────────────────────────────

const icAgreementSchema = new mongoose.Schema(
  {
    // Human-facing reference shown in the admin table, e.g. "ICA-MH3K2J9A".
    agreementId: { type: String, required: true, unique: true, index: true },

    name: { type: String, trim: true, required: true },
    street: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    zip: { type: String, trim: true },
    ein: { type: String, trim: true },
    dl: { type: String, trim: true },
    initials: { type: String, trim: true },

    signerName: { type: String, trim: true },
    signerTitle: { type: String, trim: true },
    carrierName: { type: String, trim: true },
    carrierTitle: { type: String, trim: true },
    carrierInitials: { type: String, trim: true },

    // Raw form values ("2026-10-26", "09:00"), exactly as the form reloads them.
    effDate: String,
    effTime: String,
    sameExec: Boolean,
    exeDate: String,
    exeTime: String,
    sameAck: Boolean,
    ackDate: String,
    ackTime: String,

    rateLocation: { type: String, trim: true },
    rateEffective: { type: String, trim: true },
    // Rows of cells, as the form's tables hold them: [description, VIN] and
    // [miles, loaded, empty, bobtail].
    equipment: [[String]],
    rates: [[String]],

    sigModes: {
      contractor: { type: String, enum: ["draw", "type"], default: "draw" },
      carrier: { type: String, enum: ["draw", "type"], default: "draw" },
    },
    // PNG data URLs of the drawn signatures. Kept off the list endpoint — they
    // are the bulk of each record — and returned only with a single agreement.
    sigs: {
      contractor: String,
      carrier: String,
    },

    fileName: String,

    // Evidence of who submitted it, as the other signed agreements record.
    submittedIp: String,
    userAgent: String,
  },
  { timestamps: true },
);

icAgreementSchema.index({ createdAt: -1 });

module.exports = mongoose.model("IcAgreement", icAgreementSchema);
