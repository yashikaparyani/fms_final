const express = require("express");
const router = express.Router();
const {
  getEmailConfig,
  updateEmailConfig,
  getEmailTemplates,
  previewEmailTemplate,
  sendTestEmail,
} = require("../controllers/configController");
const { protect, authorizeRoles } = require("../middleware/auth");

const guard = [protect, authorizeRoles("admin", "staff")];

router.route("/email").get(guard, getEmailConfig).put(guard, updateEmailConfig);
router.get("/email/templates", guard, getEmailTemplates);
router.get("/email/preview/:templateKey", guard, previewEmailTemplate);
router.post("/email/test", guard, sendTestEmail);

module.exports = router;
