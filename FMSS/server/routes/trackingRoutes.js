const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const {
  getTrackingSnapshot,
  startTracking,
  stopTracking,
  streamTracking,
  updateLocation,
} = require("../controllers/trackingController");
const { protect, authorizeRoles } = require("../middleware/auth");
const { requireDriverLicense } = require("../middleware/driverCompliance");
const { getJwtSecret } = require("../utils/jwtSecret");

const router = express.Router();

const protectStream = async (req, res, next) => {
  try {
    const bearerToken = req.headers.authorization?.split(" ")[1];
    const token = bearerToken || req.query.token;

    if (!token) {
      return res.status(401).json({ message: "Not authorized, no token" });
    }

    const decoded = jwt.verify(token, getJwtSecret());
    req.user = await User.findById(decoded.id);

    if (!req.user) {
      return res.status(401).json({ message: "Not authorized, user missing" });
    }

    next();
  } catch (error) {
    res.status(401).json({ message: "Not authorized, token failed" });
  }
};

// Drivers are carrier-side everywhere below: a driver sub-account is the account
// that is actually in the cab, so starting a trip, streaming GPS and closing it
// out are theirs to do. The controller resolves them to their own carrier
// (utils/carrierAccount.js), so the assignment check is unchanged.
const carrierSide = authorizeRoles("fleetOwner", "driver");

router.get("/:loadId/stream", protectStream, streamTracking);
router.get(
  "/:loadId",
  protect,
  authorizeRoles("staff", "admin", "client", "fleetOwner", "driver"),
  getTrackingSnapshot,
);
// Starting a trip is gated with the status updates, not separately: the app
// requires live tracking to be running before PICKED_UP, so letting a driver
// start a trip and then refusing the pickup would fail them halfway through the
// job instead of before it.
router.post("/:loadId/start", protect, carrierSide, requireDriverLicense, startTracking);
router.post("/:loadId/location", protect, carrierSide, updateLocation);
router.post("/:loadId/stop", protect, carrierSide, stopTracking);

module.exports = router;
