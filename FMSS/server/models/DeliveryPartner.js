// models/DeliveryPartner.js
const mongoose = require("mongoose");

/**
 * DeliveryPartner is a master list of partner companies a load can be handed
 * over to on a street turn. Loads reference a partner by its `name` string
 * (Load.streetTurn.deliveryPartner), so renaming or deleting an entry here
 * never mutates historical loads — the same convention as ShippingLine.
 *
 * `email` is the address notified when a street turn is confirmed, so it is
 * required: a partner with no address could never be told about the handover.
 */
const deliveryPartnerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    // Internal short code, e.g. "ACME"
    code: { type: String, trim: true, uppercase: true, default: "" },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, trim: true, default: "" },
    // Inactive partners stay in the master but drop out of the dropdown
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DeliveryPartner", deliveryPartnerSchema);
