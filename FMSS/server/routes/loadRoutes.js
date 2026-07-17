const express = require("express");
const router = express.Router();
const {
  getLoads,
  getLoadById,
  createLoad,
  updateLoad,
  updateLoadStatus,
  updateBiddingStatus,
  scheduleBidding,
  updateTransportStatus,
  uploadDocument,
  deleteDocument,
  assignFleetOwner,
  confirmAssignedLoadByFleetOwner,
  getOpenForBid,
  rateCompletedLoad,
  awardBid,
  sendBidAcceptanceMail,
  rescheduleBidding,
  rebidLoad,
  discardBid,
  reviseBid,
  unassignLoad,
} = require("../controllers/loadController");
const upload = require("../middleware/upload");
const { protect, authorizeRoles } = require("../middleware/auth");

router
  .route("/")
  .get(protect, getLoads)
  .post(protect, authorizeRoles("client", "staff", "admin"), createLoad);
router
  .route("/getOpenForBid")
  .get(protect, getLoads)
  .post(protect, authorizeRoles("client", "staff", "admin"), getOpenForBid);

router.put(
  "/assignedLoad/:loadId/confirm",
  protect,
  authorizeRoles("fleetOwner"),
  confirmAssignedLoadByFleetOwner,
);

router
  .route("/:loadId")
  .get(protect, getLoadById)
  .put(protect, authorizeRoles("client", "staff", "admin"), updateLoad);

router.put(
  "/:loadId/status",
  protect,
  authorizeRoles("staff", "admin"),
  updateLoadStatus,
);
router.put(
  "/:loadId/transport-status",
  protect,
  upload.array("proofImages", 5),
  authorizeRoles("staff", "admin", "fleetOwner", "driver"),
  updateTransportStatus,
);
router.put(
  "/:loadId/bidding",
  protect,
  authorizeRoles("staff", "admin"),
  updateBiddingStatus,
);
router.post(
  "/:loadId/schedule",
  protect,
  authorizeRoles("staff", "admin"),
  scheduleBidding,
);
router.post(
  "/:loadId/documents",
  protect,
  upload.single("file"),
  uploadDocument,
);
router.post(
  "/:loadId/rating",
  protect,
  authorizeRoles("client", "staff", "admin"),
  rateCompletedLoad,
);

// ✅ REQ 14 & 16: New Bid Management Endpoints
router.post(
  "/:loadId/award-bid",
  protect,
  authorizeRoles("staff", "admin"),
  awardBid,
);
router.post(
  "/:loadId/send-acceptance-mail",
  protect,
  authorizeRoles("staff", "admin"),
  sendBidAcceptanceMail,
);
router.post(
  "/:loadId/reschedule-bidding",
  protect,
  authorizeRoles("staff", "admin"),
  rescheduleBidding,
);
router.post(
  "/:loadId/rebid",
  protect,
  authorizeRoles("staff", "admin"),
  rebidLoad,
);
router.post(
  "/:loadId/discard-bid",
  protect,
  authorizeRoles("staff", "admin"),
  discardBid,
);
router.post(
  "/:loadId/revise-bid",
  protect,
  authorizeRoles("fleetOwner", "staff", "admin"),
  reviseBid,
);

// ─────────────────────────────────────────────

router.delete("/:loadId/documents/:docId", protect, deleteDocument);
router.put(
  "/:loadId/assign-fleet-owner",
  protect,
  authorizeRoles("staff", "admin"),
  assignFleetOwner,
);

router.put(
  "/:loadId/unassign",
  protect,
  authorizeRoles("staff", "admin"),
  unassignLoad,
);

module.exports = router;
