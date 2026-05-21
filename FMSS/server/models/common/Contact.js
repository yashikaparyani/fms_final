// models/common/Contact.js
const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema(
  {
    phone: String,
    fax: String,
    email: String,
    website: String,
  },
  { _id: false }
);

module.exports = contactSchema;