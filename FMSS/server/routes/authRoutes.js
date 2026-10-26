const express = require("express");
const router = express.Router();
const {
  createStaff,
  registerCustomer,
  createCustomerByStaff,
  createFleetOwnerByStaff,
  loginUser,
  getMe,
  changePassword,
  deleteMyAccount,
  forgotPassword,
  resetPassword,
} = require("../controllers/authController");
const validate = require("../middleware/validate");
const { userSchemaZod } = require("../validators/userValidator");
const { customerSchemaZod } = require("../validators/customerValidator");
const { fleetOwnerSchemaZod } = require("../validators/fleetOwnerValidator");

const { protect, authorizeRoles } = require("../middleware/auth");

// PUBLIC
router.post("/login", loginUser);

// PUBLIC — "Forgot password": email a 6-digit code, then set a new password
// with it. Used by the website and the phone app alike.
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// PUBLIC — IC Agreement Admin Panel OTP Login
// Rate limited per IP on top of the per-code attempt cap, so nobody can sit
// requesting fresh codes and guessing at them.
const rateLimit = require("express-rate-limit");
const icAdminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts. Wait a few minutes and try again." },
});
const { sendAdminOtp, verifyAdminOtp, logoutAdmin } = require("../controllers/icAdminOtpController");
router.post("/ic-admin/send-otp", icAdminLimiter, sendAdminOtp);
router.post("/ic-admin/verify-otp", icAdminLimiter, verifyAdminOtp);
router.post("/ic-admin/logout", logoutAdmin);

// PUBLIC
router.post(
  "/customer/register",
  validate(userSchemaZod.merge(customerSchemaZod)),
  registerCustomer,
);

// There is deliberately no public carrier sign-up. A carrier account is opened
// by the office (POST /api/fleet-owners) and the credentials are mailed out, so
// nobody reaches the carrier portal without having been vetted first.

// ADMIN
router.post(
  "/admin/create-staff",
  protect,
  authorizeRoles("admin"),
  validate(userSchemaZod),
  createStaff,
);

// STAFF CUSTOMER
router.post(
  "/staff/create-customer",
  protect,
  authorizeRoles("admin", "staff"),
//  validate(
//     userSchemaZod
//       .partial({ password: true })
//       .merge(customerSchemaZod)      
//   ),
  createCustomerByStaff,
);

// STAFF FLEET OWNER
router.post(
  "/staff/create-fleet-owner",
  protect,
  authorizeRoles("staff", "admin"),
  validate(fleetOwnerSchemaZod),
  createFleetOwnerByStaff,
);

router.get("/me", protect, getMe);

// Any signed-in account may change its own password — staff, admin,
// customer, carrier and driver alike. No role gate: the route only ever
// acts on the caller's own record.
router.put("/change-password", protect, changePassword);

// A customer, carrier or driver deleting their own account. POST rather than
// DELETE because it carries a body (password + confirmation), which some
// proxies strip from a DELETE. Staff and admin are refused inside.
router.post("/delete-account", protect, deleteMyAccount);

module.exports = router;
