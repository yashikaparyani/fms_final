const express = require("express");
const router = express.Router();
const {
  getCatalog,
  getReport,
  exportReport,
  payDriver,
} = require("../controllers/reportController");
const { protect, authorizeRoles } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");

// ─── /api/reports ─────────────────────────────────────────────────────────────
// Back office only. Several of these carry margin, driver pay and customer
// billing side by side, which is not a view to hand a customer or a carrier a
// filtered version of.
//
// `reports.view` to read, `reports.export` to download: an export leaves the
// system and gets forwarded, so it is worth being a separate grant. Paying a
// driver needs `loads.edit` on top, because it moves money and settles records.
// ─────────────────────────────────────────────────────────────────────────────

const office = [protect, authorizeRoles("staff", "admin")];

router.get("/catalog", ...office, requirePermission("reports.view"), getCatalog);

// Mounted before "/:key" so neither is read as a report key.
router.post(
  "/driver-payable/pay",
  ...office,
  requirePermission("reports.view", "loads.edit"),
  payDriver,
);

router.get("/:key/export", ...office, requirePermission("reports.export"), exportReport);

router.get("/:key", ...office, requirePermission("reports.view"), getReport);

module.exports = router;
