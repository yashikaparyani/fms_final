// controllers/chassisCompanyController.js
const ChassisCompany = require("../models/ChassisCompany");
const { createMasterController } = require("../utils/masterCrud");

// email is optional here: a chassis company is selectable on a load whether or
// not anyone needs to be notified about it.
const {
  list: getChassisCompanies,
  create: createChassisCompany,
  update: updateChassisCompany,
  remove: deleteChassisCompany,
} = createMasterController({
  Model: ChassisCompany,
  label: "Chassis company",
  textFields: ["code", "email", "phone"],
});

module.exports = {
  getChassisCompanies,
  createChassisCompany,
  updateChassisCompany,
  deleteChassisCompany,
};
