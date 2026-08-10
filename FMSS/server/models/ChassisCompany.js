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
  },
  { timestamps: true }
);

module.exports = mongoose.model("ChassisCompany", chassisCompanySchema);
