const express = require("express");
const router = express.Router();
const {
  getUserAudit,
  getOpenFollowUps,
} = require("../controllers/auditController");
const { protect, authorizeRoles } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");

// ─── /api/audit ───────────────────────────────────────────────────────────────
// The cross-load views. A single load's timeline lives under
// /api/loads/:loadId/audit instead, because that is where the thing it describes
// lives and a client or carrier reaching it should not have to know this route
// exists.
// ─────────────────────────────────────────────────────────────────────────────

// Open follow-ups across every load — the dispatcher's "what do I still owe
// somebody" list.
router.get(
  "/follow-ups",
  protect,
  authorizeRoles("staff", "admin"),
  getOpenFollowUps,
);

// Everything one person did. Admin-only and gated on the staff permission: this
// is an accountability review of a colleague, not an operational screen.
router.get(
  "/by-user/:userId",
  protect,
  authorizeRoles("admin"),
  requirePermission("staff.view"),
  getUserAudit,
);

module.exports = router;
