const express = require("express");
const router = express.Router();
const {
  getCompanies,
  getCompanyById,
  createCompany,
  updateCompany,
  deleteCompany,
  getCompanyAddresses,
  addCompanyAddress,
} = require("../controllers/companyController");
const { protect, authorizeRoles } = require("../middleware/auth");

// ─── Company CRUD ─────────────────────────────────────────────────────────────
router
  .route("/")
  .get(protect, authorizeRoles("client", "staff", "admin"), getCompanies)
  .post(protect, authorizeRoles("staff", "admin","client"), createCompany);

router
  .route("/:id")
  .get(protect, authorizeRoles("client", "staff", "admin"), getCompanyById)
  .put(protect, authorizeRoles("staff", "admin"), updateCompany)
  .delete(protect, authorizeRoles("admin"), deleteCompany);

// ─── Company → Addresses sub-resource ────────────────────────────────────────
router
  .route("/:id/addresses")
  .get(protect, authorizeRoles("client", "staff", "admin"), getCompanyAddresses)
  .post(protect, authorizeRoles("client", "staff", "admin"), addCompanyAddress);

module.exports = router;