const mongoose = require("mongoose");
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

module.exports = mongoose.model("FleetOwner", fleetOwnerSchema);
