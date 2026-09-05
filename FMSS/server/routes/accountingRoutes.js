const express = require("express");
const router = express.Router();
const {
  getCatalog,
  getLoadAccounting,
  saveReceivables,
  savePayables,
  savePayroll,
  previewPayroll,
  settlePayroll,
  getSummary,
  getPayrollRun,
} = require("../controllers/accountingController");
const {
  loadWiseReport,
  customerWiseReport,
  customerLedger,
  emailCustomerStatement,
  agingReport,
  payeeReport,
} = require("../controllers/accountingReportsController");
const { protect, authorizeRoles } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");

// ─── /api/accounting ──────────────────────────────────────────────────────────
// Back-office only. A customer must not see what the carrier was paid, and a
// carrier must not see what the customer was billed — the margin between those
// two numbers is the brokerage's business and nobody else's. That is why there
// is no carrier-facing or client-facing route in this file at all, rather than a
// filtered version of one.
//
// Gated on `reports` permissions on top of the role: an ops dispatcher who can
// move loads should not automatically see the margin on them.
// ─────────────────────────────────────────────────────────────────────────────

const office = [protect, authorizeRoles("staff", "admin")];

router.get("/catalog", ...office, getCatalog);

// Mounted before "/loads/:loadId" so neither is read as a load id.
router.get("/summary", ...office, requirePermission("reports.view"), getSummary);
router.get("/payroll", ...office, requirePermission("reports.view"), getPayrollRun);

// ── Reports ───────────────────────────────────────────────────────────────────
// Mounted under /reports and before "/loads/:loadId" for the same reason as the
// two above: everything up to the first path segment has to be unambiguous
// before a wildcard is allowed to claim it.
//
// These read the invoice and payment collections rather than the load ledger, so
// they answer "what has actually been billed and collected" — see the note at
// the top of controllers/accountingReportsController.js about why that is
// reported separately from what a load is worth.
router.get(
  "/reports/loads",
  ...office,
  requirePermission("reports.view"),
  loadWiseReport,
);
router.get(
  "/reports/customers",
  ...office,
  requirePermission("reports.view"),
  customerWiseReport,
);
router.get(
  "/reports/customers/:customerId",
  ...office,
  requirePermission("reports.view"),
  customerLedger,
);
router.post(
  "/reports/customers/:customerId/statement",
  ...office,
  requirePermission("reports.view"),
  emailCustomerStatement,
);
router.get("/reports/aging", ...office, requirePermission("reports.view"), agingReport);
router.get("/reports/payees", ...office, requirePermission("reports.view"), payeeReport);

router.get(
  "/loads/:loadId",
  ...office,
  requirePermission("loads.view"),
  getLoadAccounting,
);

router.put(
  "/loads/:loadId/receivables",
  ...office,
  requirePermission("loads.edit"),
  saveReceivables,
);

router.put(
  "/loads/:loadId/payables",
  ...office,
  requirePermission("loads.edit"),
  savePayables,
);

router.post(
  "/loads/:loadId/payroll/preview",
  ...office,
  requirePermission("loads.view"),
  previewPayroll,
);

router.put(
  "/loads/:loadId/payroll",
  ...office,
  requirePermission("loads.edit"),
  savePayroll,
);

router.put(
  "/loads/:loadId/payroll/settle",
  ...office,
  requirePermission("loads.edit"),
  settlePayroll,
);

module.exports = router;
