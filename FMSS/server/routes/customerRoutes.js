const express = require("express");
const router = express.Router();
const {
  getCustomers,
  getCustomerById,
  // createCustomer,
  // updateCustomer,
  // deleteCustomer,
    editCustomerByStaff,
  deleteCustomerByStaff,
  sendCredentialsToCustomer
} = require("../controllers/customerController");
const { protect, authorizeRoles } = require("../middleware/auth");

router.route("/")
  .get(protect, authorizeRoles("staff", "admin"), getCustomers)
  //.post(protect, authorizeRoles("staff", "admin"), createCustomer);

router.route("/:id")
  .get(protect, authorizeRoles("staff", "admin"), getCustomerById)
  //.put(protect, authorizeRoles("staff", "admin"), updateCustomer)
  //.delete(protect, authorizeRoles("staff", "admin"), deleteCustomer);
  .put(protect, authorizeRoles("staff", "admin"), editCustomerByStaff)
  .delete(protect, authorizeRoles("staff", "admin"), deleteCustomerByStaff);

router.post("/:id/send-credentials", protect, authorizeRoles("staff", "admin"), sendCredentialsToCustomer);

module.exports = router;
