const express = require("express");
const router = express.Router();
const {
  getChassisCompanies,
  createChassisCompany,
  updateChassisCompany,
  deleteChassisCompany,
} = require("../controllers/chassisCompanyController");
const { protect, authorizeRoles } = require("../middleware/auth");

// Reading the list feeds the Chassis Company dropdown on the load forms and in
// the street-turn confirmation box, so clients, staff and fleet owners all
// need it. Managing the master is admin-only.
router.route("/")
  .get(
    protect,
    authorizeRoles("admin", "staff", "client", "fleetOwner"),
    getChassisCompanies,
  )
  .post(protect, authorizeRoles("admin"), createChassisCompany);

router.route("/:id")
  .put(protect, authorizeRoles("admin"), updateChassisCompany)
  .delete(protect, authorizeRoles("admin"), deleteChassisCompany);

module.exports = router;
