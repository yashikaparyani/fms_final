const express = require("express");
const router = express.Router();
const {
  getShippingLines,
  createShippingLine,
  updateShippingLine,
  deleteShippingLine,
} = require("../controllers/shippingLineController");
const { protect, authorizeRoles } = require("../middleware/auth");

// Reading the list feeds the Shipping Line dropdown on the load forms and in
// the street-turn confirmation box, so staff, clients and fleet owners all
// need it. Managing the master is admin-only.
router.route("/")
  .get(
    protect,
    authorizeRoles("admin", "staff", "client", "fleetOwner"),
    getShippingLines,
  )
  .post(protect, authorizeRoles("admin"), createShippingLine);

router.route("/:id")
  .put(protect, authorizeRoles("admin"), updateShippingLine)
  .delete(protect, authorizeRoles("admin"), deleteShippingLine);

module.exports = router;
