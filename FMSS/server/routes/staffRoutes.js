const express = require("express");
const router = express.Router();
const {
  getPermissionCatalog,
  getStaff,
  getStaffById,
  createStaff,
  createStaffBulk,
  updateStaff,
  setStaffAccess,
  setStaffAccessBulk,
  deleteStaff,
  sendCredentialsToStaff,
} = require("../controllers/staffController");
const { protect, authenticate, authorizeRoles } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");

// ─── /api/staff ───────────────────────────────────────────────────────────────
// Admin-only throughout. `authenticate` rather than `protect` on every route:
// these handlers touch only User and Branch, neither of which is tenant-scoped,
// and an admin managing staff is doing cross-location work by definition —
// resolving a single active location for them would mean nothing here.
//
// The permission gates alongside the role check are what let a future
// "HR can add staff but not change permissions" staff account exist without
// re-plumbing the routes. Admins bypass them.
// ─────────────────────────────────────────────────────────────────────────────

const adminOnly = [authenticate, authorizeRoles("admin")];

router.get(
  "/permission-catalog",
  ...adminOnly,
  requirePermission("permissions.view"),
  getPermissionCatalog,
);

router
  .route("/")
  .get(...adminOnly, requirePermission("staff.view"), getStaff)
  .post(...adminOnly, requirePermission("staff.create"), createStaff);

// Many at once. Mounted before "/:id" so "bulk" is never read as an id.
router.post(
  "/bulk",
  ...adminOnly,
  requirePermission("staff.create"),
  createStaffBulk,
);

// The whole who-sees-what grid in one save.
router.put(
  "/access",
  ...adminOnly,
  requirePermission("permissions.manage"),
  setStaffAccessBulk,
);

router
  .route("/:id")
  .get(...adminOnly, requirePermission("staff.view"), getStaffById)
  .put(...adminOnly, requirePermission("staff.edit"), updateStaff)
  .delete(...adminOnly, requirePermission("staff.delete"), deleteStaff);

router.put(
  "/:id/access",
  ...adminOnly,
  requirePermission("permissions.manage"),
  setStaffAccess,
);

router.post(
  "/:id/send-credentials",
  ...adminOnly,
  requirePermission("staff.edit"),
  sendCredentialsToStaff,
);

module.exports = router;
