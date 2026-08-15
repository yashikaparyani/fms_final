const express = require("express");
const router = express.Router();
const {
  createStaff,
  registerCustomer,
  createCustomerByStaff,
  createFleetOwnerByStaff,
  loginUser,
  getMe,
} = require("../controllers/authController");
const validate = require("../middleware/validate");
const { userSchemaZod } = require("../validators/userValidator");
const { customerSchemaZod } = require("../validators/customerValidator");
const { fleetOwnerSchemaZod } = require("../validators/fleetOwnerValidator");

const { protect, authorizeRoles } = require("../middleware/auth");

// PUBLIC
router.post("/login", loginUser);

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

module.exports = router;
