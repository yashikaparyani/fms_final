const express = require("express");
const router = express.Router();
const {
  getConfig,
  updateConfig,
  getTemplates,
  getRecipients,
  previewTemplate,
  sendMessages,
  getMessages,
  flushQueue,
  setOptOut,
} = require("../controllers/whatsappController");
const { protect, authorizeRoles } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");

// ─── /api/whatsapp ────────────────────────────────────────────────────────────
// Settings are admin-only — they hold the access token for the business's
// WhatsApp number. Sending is open to staff with the settings permission,
// because a dispatcher chasing a delayed load should not need an admin.
// ─────────────────────────────────────────────────────────────────────────────

const office = authorizeRoles("staff", "admin");

router
  .route("/config")
  .get(protect, authorizeRoles("admin"), getConfig)
  .put(protect, authorizeRoles("admin"), updateConfig);

router.get("/templates", protect, office, getTemplates);
router.get("/recipients", protect, office, requirePermission("settings.view"), getRecipients);

router.post("/preview", protect, office, previewTemplate);
router.post("/send", protect, office, requirePermission("settings.manage"), sendMessages);

router.get("/messages", protect, office, getMessages);
router.post("/flush", protect, authorizeRoles("admin"), flushQueue);
router.post("/opt-out", protect, office, requirePermission("settings.manage"), setOptOut);

module.exports = router;
