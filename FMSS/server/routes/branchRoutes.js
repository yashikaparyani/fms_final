const express = require("express");
const router = express.Router();
const {
  getBranches,
  getMyBranches,
  getPublicBranches,
  createBranch,
  updateBranch,
  deactivateBranch,
  setUserBranches,
} = require("../controllers/branchController");
const { protect, authenticate, authorizeRoles } = require("../middleware/auth");

// Public — signup forms need to offer a location before an account exists.
router.get("/public", getPublicBranches);

// The switcher list. Uses `authenticate` rather than `protect`: a user with no
// location assigned must still be able to load this and get an empty list back,
// whereas `protect` would reject them with NO_LOCATION and leave the UI blank
// with nothing to explain why. Safe without the tenant context because it only
// reads Branch, which is not itself tenant-scoped.
router.get("/mine", authenticate, getMyBranches);

router
  .route("/")
  .get(protect, authorizeRoles("admin"), getBranches)
  .post(protect, authorizeRoles("admin"), createBranch);

router.put("/users/:userId", protect, authorizeRoles("admin"), setUserBranches);

router
  .route("/:id")
  .put(protect, authorizeRoles("admin"), updateBranch)
  .delete(protect, authorizeRoles("admin"), deactivateBranch);

module.exports = router;
