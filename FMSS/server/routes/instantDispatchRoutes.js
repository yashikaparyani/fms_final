const express = require("express");
const router = express.Router();
const {
  getMyOffers,
  acceptOffer,
  declineOffer,
  requestForLoad,
  getSettings,
  updateSettings,
} = require("../controllers/instantDispatchController");
const { protect, authorizeRoles } = require("../middleware/auth");

// ─── /api/instant-dispatch ────────────────────────────────────────────────────
// Three audiences, and the split between them is the whole security model here:
//
//   · Carriers see and answer only what they were offered. The controller
//     resolves them to their own carrier from the account, so a fleetOwner
//     cannot accept on somebody else's behalf, and a driver sub-account acts for
//     the carrier they belong to.
//   · Customers and the office can push an existing load out to nearby carriers.
//   · Only an admin changes the commission rate — it is what the business earns
//     per load, not an operational setting.
// ─────────────────────────────────────────────────────────────────────────────

const carrierSide = authorizeRoles("fleetOwner", "driver");

router.get("/offers", protect, carrierSide, getMyOffers);
router.post("/:loadId/accept", protect, carrierSide, acceptOffer);
router.post("/:loadId/decline", protect, carrierSide, declineOffer);

router.post(
  "/:loadId/request",
  protect,
  authorizeRoles("client", "staff", "admin"),
  requestForLoad,
);

router.get("/settings", protect, authorizeRoles("staff", "admin"), getSettings);
router.put("/settings", protect, authorizeRoles("admin"), updateSettings);

module.exports = router;
