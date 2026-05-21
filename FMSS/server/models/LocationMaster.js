// models/LocationMaster.js
const mongoose = require("mongoose");

/**
 * LocationMaster stores one document per (state, city) pair.
 * This allows querying:
 *   - All distinct states
 *   - All cities for a given state
 *   - Default zip for a given (state, city)
 */
const locationMasterSchema = new mongoose.Schema(
  {
    stateAbbr: { type: String, required: true, trim: true, uppercase: true, index: true },
    stateName: { type: String, required: true, trim: true },
    city:      { type: String, required: true, trim: true },
    zip:       { type: String, required: true, trim: true },
  },
  { timestamps: false }
);

// Compound unique index: one entry per state+city combination
locationMasterSchema.index({ stateAbbr: 1, city: 1 }, { unique: true });

module.exports = mongoose.model("LocationMaster", locationMasterSchema);
