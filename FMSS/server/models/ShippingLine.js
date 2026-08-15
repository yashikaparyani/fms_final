const tenantScope = require("../plugins/tenantScope");
// models/ShippingLine.js
const mongoose = require("mongoose");

/**
 * ShippingLine is a master list of ocean carriers.
 * Loads reference a shipping line by its `name` string (Load.shippingLine),
 * so renaming or deleting an entry here never mutates historical loads.
 */
const shippingLineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    phone: { type: String, trim: true, default: "" },
    // Notified when a street turn is confirmed on a load carrying this line.
    // Optional, so lines added before street-turn notifications keep working.
    email: { type: String, trim: true, lowercase: true, default: "" },
    // Inactive lines stay in the master but drop out of the load-form dropdown
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);


// Per-location data — scoping is enforced centrally, see plugins/tenantScope.js.
shippingLineSchema.plugin(tenantScope, { modelName: "ShippingLine" });

module.exports = mongoose.model("ShippingLine", shippingLineSchema);
