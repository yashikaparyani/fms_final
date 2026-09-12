const express = require("express");
const router = express.Router();
const {
  getMethods,
  recordPayment,
  receivePayment,
  settleBills,
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
// One payment, several loads. See receivePayment for why it writes a row per
// invoice rather than a single row against the customer.
router.post("/receive", ...office, canWrite, receivePayment);
// The other direction, in bulk: a payment run that settles several bills in
// full. Takes no amount — see settleBills for why money out is not a split.
router.post("/settle", ...office, canWrite, settleBills);

router.put("/:id/reverse", ...office, canWrite, reversePayment);
router.post("/:id/receipt", ...office, canWrite, sendReceipt);

module.exports = router;
