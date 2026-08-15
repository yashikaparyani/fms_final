const mongoose = require("mongoose");

// ─── WhatsApp opt-outs ────────────────────────────────────────────────────────
// A number that has asked to stop hearing from us. Keyed by phone rather than by
// user because a recipient is not always an account — a customer's warehouse
// contact or a carrier's dispatcher has a number and nothing else.
//
// Deliberately NOT tenant-scoped. Somebody who opts out has opted out of being
// messaged by this business, not by one of its branches; scoping it per location
// would let the next branch message them again the following week, which is both
// rude and the fastest route to being reported as spam. A spam report costs
// sending quality across the whole number.
// ─────────────────────────────────────────────────────────────────────────────

const whatsAppOptOutSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, trim: true, index: true },

    // "STOP" when the recipient sent the keyword themselves, "manual" when staff
    // recorded it on their behalf after a phone call.
    source: { type: String, enum: ["keyword", "manual"], default: "keyword" },
    note: { type: String, trim: true },

    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    optedOutAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

module.exports = mongoose.model("WhatsAppOptOut", whatsAppOptOutSchema);
