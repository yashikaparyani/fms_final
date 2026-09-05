const express = require("express");
const router = express.Router();
const {
  getMethods,
  recordPayment,
  listPayments,
  reversePayment,
  sendReceipt,
} = require("../controllers/paymentController");
const { protect, authorizeRoles } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");

// ─── /api/payments ────────────────────────────────────────────────────────────
// Recording money in and money out. Back office only, same reasoning as
// invoiceRoutes.js — the register holds both directions and the difference
// between them is nobody's business but ours.
//
// There is deliberately no delete route. A payment is reversed, never removed;
// see the note in controllers/paymentController.js about why the row has to
// survive a bounced check.
// ─────────────────────────────────────────────────────────────────────────────

const office = [protect, authorizeRoles("staff", "admin")];

const canRead = requirePermission("reports.view");
const canWrite = requirePermission("loads.edit");

// Before "/:id" so it is not read as a payment id.
router.get("/methods", ...office, getMethods);

router.get("/", ...office, canRead, listPayments);
router.post("/", ...office, canWrite, recordPayment);

router.put("/:id/reverse", ...office, canWrite, reversePayment);
router.post("/:id/receipt", ...office, canWrite, sendReceipt);

module.exports = router;
