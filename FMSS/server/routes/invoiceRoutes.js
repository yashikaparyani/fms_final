const express = require("express");
const router = express.Router();
const {
  getTerms,
  listInvoices,
  getInvoice,
  downloadInvoicePdf,
  generateForLoad,
  getLoadInvoices,
  createManualInvoice,
  updateInvoice,
  sendInvoice,
  remindInvoice,
  voidInvoice,
  unvoidInvoice,
} = require("../controllers/invoiceController");
const { protect, authorizeRoles } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");

// ─── /api/invoices ────────────────────────────────────────────────────────────
// Back office only, for exactly the reason given in accountingRoutes.js: the AR
// and AP registers sit side by side here, and the gap between them is the
// brokerage's margin. A customer must not reach a route that also serves carrier
// bills, so there is no customer-facing version of any of this — not a filtered
// one, none at all.
//
// Reading is gated on `reports.view` and writing on `loads.edit`, matching the
// per-load ledger: whoever may change what a load is worth may raise the invoice
// for it, and seeing the register is seeing the numbers.
// ─────────────────────────────────────────────────────────────────────────────

const office = [protect, authorizeRoles("staff", "admin")];

const canRead = requirePermission("reports.view");
const canWrite = requirePermission("loads.edit");

// Static paths first, so none of them is read as an invoice id.
router.get("/terms", ...office, getTerms);

router.get("/loads/:loadId", ...office, canRead, getLoadInvoices);
router.post("/loads/:loadId/generate", ...office, canWrite, generateForLoad);

router.post("/manual", ...office, canWrite, createManualInvoice);

router.get("/", ...office, canRead, listInvoices);
router.get("/:id", ...office, canRead, getInvoice);
router.get("/:id/pdf", ...office, canRead, downloadInvoicePdf);

router.put("/:id", ...office, canWrite, updateInvoice);
router.post("/:id/send", ...office, canWrite, sendInvoice);
router.post("/:id/remind", ...office, canWrite, remindInvoice);
router.put("/:id/void", ...office, canWrite, voidInvoice);
router.put("/:id/unvoid", ...office, canWrite, unvoidInvoice);

module.exports = router;
