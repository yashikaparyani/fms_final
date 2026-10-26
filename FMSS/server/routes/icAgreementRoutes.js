const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");

const { requireIcAdmin } = require("../middleware/icAdminAuth");
const {
  createAgreement,
  listAgreements,
  getAgreement,
  deleteAgreement,
} = require("../controllers/icAgreementController");

// ─── /api/ic-agreements ───────────────────────────────────────────────────────
// Submissions from the standalone IC agreement form. Saving is public — the
// contractor filling the form is not signed in — and rate limited like the
// other public routes that write to the database. Reading and deleting need an
// IC admin session (OTP sign-in, see controllers/icAdminOtpController.js).
//
// Mounted in index.js ahead of the global JSON parser, with a larger body limit:
// drawn signatures (PNG data URLs) and the PDF for the emailed copies outgrow
// the 100kb default.
// ─────────────────────────────────────────────────────────────────────────────

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many submissions. Wait a few minutes and try again." },
});

router.post("/", submitLimiter, createAgreement);
router.get("/", requireIcAdmin, listAgreements);
router.get("/:id", requireIcAdmin, getAgreement);
router.delete("/:id", requireIcAdmin, deleteAgreement);

module.exports = router;
