const express = require("express");
const router = express.Router();
const { getAllAddresses, addAddress } = require("../controllers/addressController");
const { protect, authorizeRoles } = require("../middleware/auth");

router.route("/")
  .get(protect, authorizeRoles("client", "staff", "admin"), getAllAddresses)
  .post(protect, authorizeRoles("client", "staff", "admin"), addAddress);

module.exports = router;
