const express = require("express");
const router = express.Router();

const {
  submitSignup,
  listSignups,
  approveSignup,
  rejectSignup,
} = require("../controllers/signupController");
const { protect, authorizeRoles } = require("../middleware/auth");

// PUBLIC — creates a review request, never an account. See signupController.
router.post("/", submitSignup);

// OFFICE — the review queue. Approving is what mints the account and mails the
// password, so it is gated to the same roles that can create one by hand.
router.get("/", protect, authorizeRoles("staff", "admin"), listSignups);
router.post("/:id/approve", protect, authorizeRoles("staff", "admin"), approveSignup);
router.post("/:id/reject", protect, authorizeRoles("staff", "admin"), rejectSignup);

module.exports = router;
