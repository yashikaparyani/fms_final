const express = require("express");
const router = express.Router();
const {
  getDrivers,
  getDriverLocations,
  getMyDriverRecord,
  uploadMyLicense,
  createDriver,
  createDriversBulk,
  updateDriver,
  deactivateDriver,
  sendCredentialsToDriver,
} = require("../controllers/driverController");
const { protect, authorizeRoles } = require("../middleware/auth");
const upload = require("../middleware/upload");

// ─── /api/drivers ─────────────────────────────────────────────────────────────
// A fleet owner manages their own roster; staff and admins can manage any
// carrier's roster at their active location.
//
// `protect` (not bare `authenticate`) throughout: Driver is tenant-scoped, so
// these queries need the active location resolved or the scoping plugin throws.
//
// A `driver` may read the roster — the app shows them who else is on the team —
// but nothing here is writable by one: a driver cannot add or remove drivers.
// ─────────────────────────────────────────────────────────────────────────────

const carrierOrOffice = authorizeRoles("fleetOwner", "staff", "admin");

// ── A driver's own record ────────────────────────────────────────────────────
// Mounted before "/:id" so "me" is never read as an id. Deliberately NOT behind
// requireDriverLicense — this is the route a driver without a licence has to be
// able to reach in order to stop being a driver without a licence.
router.get("/me", protect, authorizeRoles("driver"), getMyDriverRecord);
router.post(
  "/me/license",
  protect,
  authorizeRoles("driver"),
  upload.single("license"),
  uploadMyLicense,
);

router
  .route("/")
  .get(
    protect,
    authorizeRoles("fleetOwner", "driver", "staff", "admin"),
    getDrivers,
  )
  .post(protect, carrierOrOffice, createDriver);

// Many at once. Mounted before "/:id" so "bulk" is never read as an id.
router.post("/bulk", protect, carrierOrOffice, createDriversBulk);

// Where the carrier's drivers last reported from. Same rule as the roster: a
// carrier sees their own drivers and no others.
router.get("/locations", protect, carrierOrOffice, getDriverLocations);

router
  .route("/:id")
  .put(protect, carrierOrOffice, updateDriver)
  .delete(protect, carrierOrOffice, deactivateDriver);

router.post(
  "/:id/send-credentials",
  protect,
  carrierOrOffice,
  sendCredentialsToDriver,
);

module.exports = router;
