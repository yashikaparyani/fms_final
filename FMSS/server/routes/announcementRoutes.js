const express = require("express");
const router = express.Router();

const {
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  getMarquee,
} = require("../controllers/announcementController");
const { protect, authorizeRoles } = require("../middleware/auth");

// ─── /api/announcements ───────────────────────────────────────────────────────
// Writing is office-only; reading the marquee is for everybody, because the
// whole point of a marquee is that every portal sees it.
// ─────────────────────────────────────────────────────────────────────────────

// Mounted before "/" so "marquee" is never read as an announcement id.
router.get("/marquee", protect, getMarquee);

const officeOnly = authorizeRoles("staff", "admin");

router
  .route("/")
  .get(protect, officeOnly, listAnnouncements)
  .post(protect, officeOnly, createAnnouncement);

router
  .route("/:id")
  .put(protect, officeOnly, updateAnnouncement)
  .delete(protect, officeOnly, deleteAnnouncement);

module.exports = router;
