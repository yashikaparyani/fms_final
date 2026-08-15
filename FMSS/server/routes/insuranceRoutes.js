const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const {
  inviteInsuranceAgent,
  remindInsuranceAgent,
  getPublicInsuranceForm,
  submitPublicInsurance,
  uploadPublicCertificate,
  downloadCertificate,
  getExpiringInsurance,
} = require("../controllers/insuranceController");
const { protect, authorizeRoles } = require("../middleware/auth");
const upload = require("../middleware/upload");

// ─── /api/insurance ───────────────────────────────────────────────────────────
// Two audiences. The carrier and the office are signed in and go through
// `protect`. The insurance agency is not signed in at all — they hold a one-off
// link, and the /public routes below are the only unauthenticated surface here.
// ─────────────────────────────────────────────────────────────────────────────

const carrierOrOffice = authorizeRoles("fleetOwner", "staff", "admin");

// ── Public: the agency's form ────────────────────────────────────────────────
// Rate limited because these routes are reachable without a session, and a token
// is a 64-character hex string: brute forcing one is not feasible, but there is
// no reason to let anybody sit there trying, and an unthrottled public POST that
// writes to the database is an obvious thing to lean on.
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Wait a few minutes and try again." },
});

router.get("/public/:token", publicLimiter, getPublicInsuranceForm);
router.post("/public/:token", publicLimiter, submitPublicInsurance);
router.post(
  "/public/:token/certificate",
  publicLimiter,
  upload.single("certificate"),
  uploadPublicCertificate,
);

// ── Signed in: asking, chasing, reading back ─────────────────────────────────
router.post("/invite", protect, carrierOrOffice, inviteInsuranceAgent);
router.post("/remind", protect, carrierOrOffice, remindInsuranceAgent);

router.get(
  "/expiring",
  protect,
  authorizeRoles("staff", "admin"),
  getExpiringInsurance,
);

router.get("/certificate/:coverage", protect, carrierOrOffice, downloadCertificate);

module.exports = router;
