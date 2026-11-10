const tenantScope = require("../plugins/tenantScope");
const mongoose = require("mongoose");

// ─── Company Model ─────────────────────────────────────────────────────────────
// A "Company" is any generic third-party location entity used as a stop on
// a load — shipper, consignee, warehouse, terminal, etc.
// Completely separate from the Customer master.
// Addresses live in the Address collection referencing this model via `company`.
// ─────────────────────────────────────────────────────────────────────────────

const companySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Company name is required"],
      trim: true,
    },

    type: {
      type: String,
      enum: ["Shipper", "Consignee", "Warehouse", "Terminal", "Other"],
      default: "Other",
    },

    contactName:  { type: String, trim: true },
    contactPhone: { type: String, trim: true },
    contactEmail: { type: String, trim: true, lowercase: true },

    notes: { type: String },

    active: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual reverse-populate so you can do Company.findById(id).populate("addresses")
companySchema.virtual("addresses", {
  ref:         "Address",
  localField:  "_id",
  foreignField: "company",
});


// Offered at the locations picked on the record (`availableAt`). See the
// "Shared models" note in plugins/tenantScope.js.
companySchema.plugin(tenantScope, { modelName: "Company", availability: true });

module.exports = mongoose.model("Company", companySchema);