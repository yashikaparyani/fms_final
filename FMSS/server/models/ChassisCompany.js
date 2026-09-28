const tenantScope = require("../plugins/tenantScope");
// models/ChassisCompany.js
const mongoose = require("mongoose");

/**
 * ChassisCompany is a master list of chassis providers. It feeds the
 * Chassis Company dropdown on the load form and the street-turn confirmation
 * box. Loads reference a company by its `name` string (Load.chassisCompany),
 * so renaming or deleting an entry here never mutates historical loads —
 * the same convention as ShippingLine.
 *
 * `email` is optional: a chassis company is selectable on a load whether or
 * not anyone needs to be notified about it.
 */
const chassisCompanySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    // Internal short code, e.g. "TRAC"
    code: { type: String, trim: true, uppercase: true, default: "" },
    email: { type: String, trim: true, lowercase: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    // Inactive companies stay in the master but drop out of the dropdown
    isActive: { type: Boolean, default: true },

    // Chassis rent, per day. The latest rate entered — which may not be in
    // force yet if it was given a future effective date. What a load is
    // actually charged is read from `rateHistory`, day by day; see
    // utils/chassisRent.js.
    dailyRent: { type: Number, min: 0 },

    // Every rate this company has charged, with the day it took effect. A
    // rate change never rewrites what an earlier day cost: a load picked up
    // before the change is charged the old rate for the days before it.
    rateHistory: [
      {
        dailyRent: { type: Number, min: 0, required: true },
        // A calendar date, stored at UTC midnight — see utils/dates.js.
        effectiveDate: { type: Date, required: true },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        changedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);


// Per-location data — scoping is enforced centrally, see plugins/tenantScope.js.
chassisCompanySchema.plugin(tenantScope, { modelName: "ChassisCompany" });

module.exports = mongoose.model("ChassisCompany", chassisCompanySchema);
