const express = require("express");
const router = express.Router();
const {
  getCatalog,
  getOnboarding,
  saveProfile,
  signAgreement,
  downloadAgreement,
  uploadDriverLicense,
  downloadDriverLicense,
  reviewOnboarding,
  getOnboardingQueue,
} = require("../controllers/onboardingController");
const { protect, authorizeRoles } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");
const upload = require("../middleware/upload");

// ─── /api/onboarding ──────────────────────────────────────────────────────────
// The carrier drives their own file; the office can work on any carrier's at
// their location, because a good half of these get completed over the phone.
//
// `protect` throughout: CarrierOnboarding and Driver are both tenant-scoped, so
// the active location has to be resolved or the scoping plugin throws.
// ─────────────────────────────────────────────────────────────────────────────

const carrierOrOffice = authorizeRoles("fleetOwner", "staff", "admin");
const officeOnly = authorizeRoles("staff", "admin");

// The field schema for the whole wizard. Any signed-in party that can see the
// form needs it, including a driver looking at their own carrier's file.
router.get(
  "/catalog",
  protect,
  authorizeRoles("fleetOwner", "driver", "staff", "admin"),
  getCatalog,
);

// Mounted before "/" so "queue" is never read as a carrier's own file.
router.get(
  "/queue",
  protect,
  officeOnly,
  requirePermission("fleetOwners.view"),
  getOnboardingQueue,
);

router
  .route("/")
  .get(protect, authorizeRoles("fleetOwner", "driver", "staff", "admin"), getOnboarding);

router.put("/profile", protect, carrierOrOffice, saveProfile);

router.post("/agreements/:key/sign", protect, carrierOrOffice, signAgreement);
router.get(
  "/agreements/:key/download",
  protect,
  authorizeRoles("fleetOwner", "staff", "admin"),
  downloadAgreement,
);

router.post(
  "/drivers/:driverId/license",
  protect,
  carrierOrOffice,
  upload.single("license"),
  uploadDriverLicense,
);
router.get(
  "/drivers/:driverId/license",
  protect,
  carrierOrOffice,
  downloadDriverLicense,
);

router.put(
  "/review",
  protect,
  officeOnly,
  requirePermission("fleetOwners.edit"),
  reviewOnboarding,
);

module.exports = router;
