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
  setLoadDrivers,
  confirmAssignedLoadByFleetOwner,
  getOpenForBid,
  rateCompletedLoad,
  awardBid,
  sendBidAcceptanceMail,
  rescheduleBidding,
  rebidLoad,
  discardBid,
  reviseBid,
  respondToNegotiation,
  unassignLoad,
  emailCustomer,
} = require("../controllers/loadController");
const {
  getLoadAudit,
  addNote,
  resolveFollowUp,
} = require("../controllers/auditController");
const upload = require("../middleware/upload");
const { protect, authorizeRoles } = require("../middleware/auth");
const { requireDriverLicense } = require("../middleware/driverCompliance");

router
  .route("/")
  .get(protect, getLoads)
  .post(protect, authorizeRoles("client", "staff", "admin"), createLoad);
router
  .route("/getOpenForBid")
  .get(protect, getLoads)
  .post(protect, authorizeRoles("client", "staff", "admin"), getOpenForBid);

// Staff-composed message to the customer about one load (tracking page).
router.post(
  "/:loadId/email-customer",
  protect,
  authorizeRoles("staff", "admin"),
  emailCustomer,
);

// A driver may accept the run they are about to make — the carrier's office is
// not always the party sitting in front of the load when it is confirmed. The
// controller resolves them to their own carrier, so the ownership check on the
// load is the same one a fleet owner faces.
router.put(
  "/assignedLoad/:loadId/confirm",
  protect,
  authorizeRoles("fleetOwner", "driver"),
  // Confirming moves the load to READY_TO_PICKUP, so it is a status change and
  // gated the same way.
  requireDriverLicense,
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
  // A driver cannot report a pickup or a delivery until their licence is on
  // file — see middleware/driverCompliance.js. No-op for every other role.
  requireDriverLicense,
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
// Carrier accepts or declines a negotiated amount. Accepting awards the load.
router.post(
  "/:loadId/negotiation/respond",
  protect,
  authorizeRoles("fleetOwner"),
  respondToNegotiation,
);

// ─────────────────────────────────────────────

router.delete("/:loadId/documents/:docId", protect, deleteDocument);
// The carrier says who drives it; the office can do it for them over the phone.
router.put(
  "/:loadId/drivers",
  protect,
  authorizeRoles("fleetOwner", "staff", "admin"),
  setLoadDrivers,
);

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

// ─── Audit & notes ────────────────────────────────────────────────────────────
// Mounted under the load rather than under /api/audit, because the trail belongs
// to the load and a client reading their own load's history should not have to
// know a separate module exists.
//
// Reading is open to everyone who can see the load — the controller narrows a
// client or carrier to the entries deliberately marked SHARED. Writing is
// office-only: the trail is the record of what the office did.
router.get(
  "/:loadId/audit",
  protect,
  authorizeRoles("staff", "admin", "client", "fleetOwner", "driver"),
  getLoadAudit,
);

router.post(
  "/:loadId/audit/notes",
  protect,
  authorizeRoles("staff", "admin"),
  addNote,
);

router.put(
  "/:loadId/audit/notes/:entryId/resolve",
  protect,
  authorizeRoles("staff", "admin"),
  resolveFollowUp,
);

module.exports = router;
