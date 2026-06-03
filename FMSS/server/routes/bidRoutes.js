const express = require("express");
const router = express.Router(); // no mergeParams needed here
const {
  placeOrUpdateBid,
  getBidsForFleetOwner,
  acceptBid,
  getMyBid,
  getBidsForLoad,
  getWonBidsByFleetOwner,
  getMyAllBidsWithStatus,
} = require("../controllers/bidController");
const { protect, authorizeRoles } = require("../middleware/auth");

router
  .route("/:loadId/bids")
  // 🔒 Clients must NOT see bid lists/amounts — only staff/admin/fleetOwner
  .get(protect, authorizeRoles("staff", "admin", "fleetOwner"), getBidsForFleetOwner)

  .post(protect, authorizeRoles("fleetOwner"), placeOrUpdateBid);

router
  .route("/:loadId/loadBids")
  // 🔒 Clients must NOT see bid lists/amounts — only staff/admin/fleetOwner
  .get(protect, authorizeRoles("staff", "admin", "fleetOwner"), getBidsForLoad);

router.get(
  "/wonBids",
  protect,
  authorizeRoles("fleetOwner"),
  getWonBidsByFleetOwner
);


router.get("/myBids", protect, authorizeRoles("fleetOwner"), getMyAllBidsWithStatus);

router.get("/:loadId/bids/my", protect, authorizeRoles("fleetOwner"), getMyBid);

// PUT /api/bidRoutes/:loadId/bids/:bidId/accept
router.put(
  "/:loadId/bids/:bidId/accept",
  protect,
  authorizeRoles("client", "staff", "admin"),
  acceptBid,
);

module.exports = router;
