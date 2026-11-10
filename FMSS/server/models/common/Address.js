const tenantScope = require("../../plugins/tenantScope");
// models/Address.js
const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema(
  {
    street: String,
    suite: String,
    city: String,
    state: String,
    zip: String,
    directions: String,
    lat: Number,
    lng: Number,

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
    },
  },
  { timestamps: true },
);


// Shared by every location — one list for the whole business. See the
// "Shared models" note in plugins/tenantScope.js.
addressSchema.plugin(tenantScope, { modelName: "Address", shared: true });

module.exports = mongoose.model("Address", addressSchema);
