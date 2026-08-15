const tenantScope = require("../plugins/tenantScope");
const mongoose = require("mongoose");
const { nextSequence } = require("../utils/sequence");
//const addressSchema = require("./common/Address");

const contactPersonSchema = new mongoose.Schema({
  name: String,
  phone: String,
  email: String,
  isPrimary: Boolean,
});

const fleetOwnerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // Human-readable identity, "FO-0001", assigned once on first save and never
    // reused — the same shape as loadId. Deliberately NOT called `fleetOwnerId`:
    // that name is already taken across the Load model for the Mongo ObjectId
    // (`assignedFleetOwner.fleetOwnerId`, `winningBid.fleetOwnerId`), and having
    // one name mean two different things is how the wrong value gets stored.
    // `sparse` so fleet owners created before this field existed — who hold null
    // until the backfill runs — do not collide on the unique index.
    fleetOwnerCode: { type: String, unique: true, sparse: true, index: true },

    carrierName: String,
    phone: String,

    mcLicense: String,
    dotLicense: String,
    taxId: String,

    // 🔥 MULTIPLE ADDRESSES
        addresses: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Address",
          },
        ],

    contactPersons: [contactPersonSchema],

    // ✅ RATINGS
    ratings: [
      {
        load: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Load",
        },
        loadId: String,
        score: { type: Number, min: 1, max: 5 },
        remark: String,
        ratedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        ratedAt: { type: Date, default: Date.now },
      },
    ],

    ratingCount: { type: Number, default: 0 },
    ratingAverage: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },

    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// ===================== AUTO FLEET OWNER CODE =====================
// Same counter mechanism as loadId. Runs on Model.create too, so every creation
// path — staff form, self-registration, seed — gets a code without repeating it.
fleetOwnerSchema.pre("save", async function () {
  if (this.fleetOwnerCode) return; // already set

  this.fleetOwnerCode = await nextSequence("fleetOwner", this.locationId);
});


// Per-location data — scoping is enforced centrally, see plugins/tenantScope.js.
fleetOwnerSchema.plugin(tenantScope, { modelName: "FleetOwner" });

module.exports = mongoose.model("FleetOwner", fleetOwnerSchema);
