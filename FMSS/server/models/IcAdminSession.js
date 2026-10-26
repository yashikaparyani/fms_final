const mongoose = require("mongoose");

// A signed-in IC admin panel session. The browser holds the random token; only
// its SHA-256 is stored, so a database dump does not hand out live sessions.
const icAdminSessionSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    // MongoDB removes the document once this passes.
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true },
);

module.exports = mongoose.model("IcAdminSession", icAdminSessionSchema);
