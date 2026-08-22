// controllers/streetTurnPartnerController.js
const StreetTurnPartner = require("../models/StreetTurnPartner");
const { createMasterController } = require("../utils/masterCrud");

// email is required: the partner is emailed when a street turn is confirmed and
// has to sign it back, so an entry without an address could neither be notified
// nor complete the handover.
const {
  list: getStreetTurnPartners,
  create: createStreetTurnPartner,
  update: updateStreetTurnPartner,
  remove: deleteStreetTurnPartner,
} = createMasterController({
  Model: StreetTurnPartner,
  label: "Street turn partner",
  textFields: ["code", "scac", "email", "phone"],
  requiredFields: ["email"],
});

module.exports = {
  getStreetTurnPartners,
  createStreetTurnPartner,
  updateStreetTurnPartner,
  deleteStreetTurnPartner,
};
