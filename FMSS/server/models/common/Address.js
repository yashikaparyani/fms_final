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

module.exports = mongoose.model("Address", addressSchema);
