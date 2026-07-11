const express = require("express");
const router = express.Router();
const {
  getShippingLines,
  createShippingLine,
  updateShippingLine,
  deleteShippingLine,
} = require("../controllers/shippingLineController");
const { protect, authorizeRoles } = require("../middleware/auth");

// Reading the list feeds the Shipping Line dropdown on the load forms, which
// staff and clients also use. Managing the master is admin-only.
router.route("/")
  .get(protect, authorizeRoles("admin", "staff", "client"), getShippingLines)
  .post(protect, authorizeRoles("admin"), createShippingLine);

router.route("/:id")
  .put(protect, authorizeRoles("admin"), updateShippingLine)
  .delete(protect, authorizeRoles("admin"), deleteShippingLine);

module.exports = router;
