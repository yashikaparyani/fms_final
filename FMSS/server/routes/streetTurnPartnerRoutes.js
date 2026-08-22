const express = require("express");
const router = express.Router();
const {
  getStreetTurnPartners,
  createStreetTurnPartner,
  updateStreetTurnPartner,
  deleteStreetTurnPartner,
} = require("../controllers/streetTurnPartnerController");
const { protect, authorizeRoles } = require("../middleware/auth");

// Reading the list feeds the Street Turn Partner dropdown in the street-turn
// confirmation box, which fleet owners, drivers and staff all use. Managing the
// master is admin-only.
router.route("/")
  .get(
    protect,
    authorizeRoles("admin", "staff", "fleetOwner", "driver"),
    getStreetTurnPartners,
  )
  .post(protect, authorizeRoles("admin"), createStreetTurnPartner);

router.route("/:id")
  .put(protect, authorizeRoles("admin"), updateStreetTurnPartner)
  .delete(protect, authorizeRoles("admin"), deleteStreetTurnPartner);

module.exports = router;
