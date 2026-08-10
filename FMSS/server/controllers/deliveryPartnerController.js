// controllers/deliveryPartnerController.js
const DeliveryPartner = require("../models/DeliveryPartner");
const { createMasterController } = require("../utils/masterCrud");

// email is required: the partner is emailed when a street turn is confirmed,
// so an entry without an address could never be notified.
const {
  list: getDeliveryPartners,
  create: createDeliveryPartner,
  update: updateDeliveryPartner,
  remove: deleteDeliveryPartner,
} = createMasterController({
  Model: DeliveryPartner,
  label: "Delivery partner",
  textFields: ["code", "email", "phone"],
  requiredFields: ["email"],
});

module.exports = {
  getDeliveryPartners,
  createDeliveryPartner,
  updateDeliveryPartner,
  deleteDeliveryPartner,
};
