const tenantScope = require("../plugins/tenantScope");
// models/StreetTurnPartner.js
const mongoose = require("mongoose");

/**
 * StreetTurnPartner is a master list of partner companies a load can be handed
 * over to on a street turn. Loads reference a partner by its `name` string
 * (Load.streetTurn.deliveryPartner), so renaming or deleting an entry here
 * never mutates historical loads — the same convention as ShippingLine.
 *
 * `email` is the address notified when a street turn is confirmed, so it is
 * required: a partner with no address could never be told about the handover,
 * and since the partner now has to sign the confirmation back, an entry with no
 * address could never complete one either.
 *
 * Named "Delivery Partner" until the rename; the collection is pinned to the
 * original `deliverypartners` below so that rename moved no data.
 */
const streetTurnPartnerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    // Internal short code, e.g. "ACME"
    code: { type: String, trim: true, uppercase: true, default: "" },
    // Standard Carrier Alpha Code. Printed on the transfer agreement as the
    // transferee's identifier, which is how the terminal and the shipping line
    // recognise them — a partner without one can still be emailed, so it is not
    // required, but the agreement reads incomplete without it.
    scac: { type: String, trim: true, uppercase: true, default: "" },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, trim: true, default: "" },
    // Inactive partners stay in the master but drop out of the dropdown
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);


// Per-location data — scoping is enforced centrally, see plugins/tenantScope.js.
streetTurnPartnerSchema.plugin(tenantScope, { modelName: "StreetTurnPartner" });

// Third argument pins the collection. The model was called DeliveryPartner, and
// Mongoose would otherwise derive `streetturnpartners` from the new name and
// silently start reading an empty collection. Renaming the concept must not
// mean migrating the data.
module.exports = mongoose.model(
  "StreetTurnPartner",
  streetTurnPartnerSchema,
  "deliverypartners",
);
