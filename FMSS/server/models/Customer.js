const tenantScope = require("../plugins/tenantScope");
const mongoose = require("mongoose");
//const addressSchema = require("./common/Address");
const contactSchema = require("./common/Contact");

const customerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    customerName: String,

    // 🔥 MULTIPLE ADDRESSES
    addresses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Address",
      },
    ],

    contact: contactSchema,

    emails: {
      podEmail: String,
      accChargesEmail: String,
      deliveryEmail: String,
    },

    preferences: {
      sendStatusEmails: Boolean,
      sendInvoiceEmails: Boolean,
      creditLimitExceeded: Boolean,
    },

    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);


// Per-location data — scoping is enforced centrally, see plugins/tenantScope.js.
customerSchema.plugin(tenantScope, { modelName: "Customer" });

module.exports = mongoose.model("Customer", customerSchema);
