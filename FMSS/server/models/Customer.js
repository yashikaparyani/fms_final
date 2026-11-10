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


// Offered at the locations picked on the record (`availableAt`). See the
// "Shared models" note in plugins/tenantScope.js.
customerSchema.plugin(tenantScope, { modelName: "Customer", availability: true });

module.exports = mongoose.model("Customer", customerSchema);
