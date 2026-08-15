// controllers/shippingLineController.js
const ShippingLine = require("../models/ShippingLine");
const { createMasterController } = require("../utils/masterCrud");

// email is optional so lines added before street-turn notifications existed
// keep working; when set, the line is notified on a confirmed street turn.
const {
  list: getShippingLines,
  create: createShippingLine,
  update: updateShippingLine,
  remove: deleteShippingLine,
} = createMasterController({
  Model: ShippingLine,
  label: "Shipping line",
  textFields: ["phone", "email"],
});

module.exports = {
  getShippingLines,
  createShippingLine,
  updateShippingLine,
  deleteShippingLine,
};
