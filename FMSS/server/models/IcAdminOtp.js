const mongoose = require("mongoose");

// A pending one-time login code for the IC agreement admin panel. Stored in the
// database rather than in process memory so that a deploy (which restarts the
// server) does not void codes already sitting in someone's inbox, and so that
// scripts/icAdminOtp.js can issue one from the shell. Only the hash is kept.
const icAdminOtpSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    sentAt: { type: Date, default: Date.now },
    // MongoDB removes the document once this passes.
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true },
);

module.exports = mongoose.model("IcAdminOtp", icAdminOtpSchema);
