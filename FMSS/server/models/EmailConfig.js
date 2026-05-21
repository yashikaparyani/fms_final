const mongoose = require("mongoose");

const emailConfigSchema = new mongoose.Schema(
  {
    host: {
      type: String,
      default: "smtp.gmail.com",
    },
    port: {
      type: Number,
      default: 587,
    },
    email: {
      type: String,
      default: "",
    },
    password: {
      type: String,
      default: "",
    },
    isEmailEnabled: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// We generally only want ONE config document.
// This static method retrieves the global config, or creates a blank one if it doesn't exist.
emailConfigSchema.statics.getGlobalConfig = async function () {
  let config = await this.findOne();
  if (!config) {
    config = await this.create({});
  }
  return config;
};

const EmailConfig = mongoose.model("EmailConfig", emailConfigSchema);

module.exports = EmailConfig;
