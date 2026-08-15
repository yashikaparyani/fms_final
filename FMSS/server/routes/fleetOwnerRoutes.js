const express = require("express");
const router = express.Router();
const {
  getFleetOwners,
  getFleetOwnerById,
  createFleetOwner,
  updateFleetOwner,
  deleteFleetOwner,
  sendCredentialsToFleetOwner,
  getAssignedLoadToConfirm
} = require("../controllers/fleetOwnerController");
const { protect, authorizeRoles } = require("../middleware/auth");

// Drivers see the same list as their carrier: it is the list of runs they may be
// asked to make, and the resolver narrows it to their carrier's own loads.
router.get(
  "/assignedLoad",
  protect,
  authorizeRoles("fleetOwner", "driver"),
  getAssignedLoadToConfirm,
);

router.route("/")
  .get(protect, authorizeRoles("staff", "admin"), getFleetOwners)
  .post(protect, authorizeRoles("staff", "admin"), createFleetOwner);

router.route("/:id")
  .get(protect, authorizeRoles("staff", "admin"), getFleetOwnerById)
  .put(protect, authorizeRoles("staff", "admin"), updateFleetOwner)
  .delete(protect, authorizeRoles("staff", "admin"), deleteFleetOwner);

router.post("/:id/send-credentials", protect, authorizeRoles("staff", "admin"), sendCredentialsToFleetOwner);


module.exports = router;
