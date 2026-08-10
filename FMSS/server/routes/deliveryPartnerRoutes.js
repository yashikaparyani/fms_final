const express = require("express");
const router = express.Router();
const {
  getDeliveryPartners,
  createDeliveryPartner,
  updateDeliveryPartner,
  deleteDeliveryPartner,
} = require("../controllers/deliveryPartnerController");
const { protect, authorizeRoles } = require("../middleware/auth");

// Reading the list feeds the Delivery Partner dropdown in the street-turn
// confirmation box, which fleet owners and staff both use. Managing the
// master is admin-only.
router.route("/")
  .get(protect, authorizeRoles("admin", "staff", "fleetOwner"), getDeliveryPartners)
  .post(protect, authorizeRoles("admin"), createDeliveryPartner);

router.route("/:id")
  .put(protect, authorizeRoles("admin"), updateDeliveryPartner)
  .delete(protect, authorizeRoles("admin"), deleteDeliveryPartner);

module.exports = router;
