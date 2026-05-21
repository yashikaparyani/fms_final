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

router.get("/:loadId/stream", protectStream, streamTracking);
router.get(
  "/:loadId",
  protect,
  authorizeRoles("staff", "admin", "client", "fleetOwner"),
  getTrackingSnapshot,
);
router.post(
  "/:loadId/start",
  protect,
  authorizeRoles("fleetOwner"),
  startTracking,
);
router.post(
  "/:loadId/location",
  protect,
  authorizeRoles("fleetOwner"),
  updateLocation,
);
router.post(
  "/:loadId/stop",
  protect,
  authorizeRoles("fleetOwner"),
  stopTracking,
);

module.exports = router;
