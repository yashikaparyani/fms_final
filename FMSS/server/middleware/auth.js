const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { getJwtSecret } = require("../utils/jwtSecret");
const { resolveLocation } = require("./location");

const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "Not authorized, no token" });
    }

    const decoded = jwt.verify(token, getJwtSecret());

    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ message: "Not authorized, user missing" });
    }

    // Tokens last 30 days, so revoking access has to be checked here rather than
    // only at sign-in — otherwise a removed staff member or a driver taken off a
    // roster keeps working from an already-issued token for weeks.
    if (user.isDeleted || user.isActive === false) {
      return res.status(401).json({
        message: "This account is no longer active.",
        code: "ACCOUNT_DEACTIVATED",
      });
    }

    req.user = user;

    next();
  } catch (err) {
    res.status(401).json({ message: "Not authorized, token failed" });
  }
};

/**
 * Authenticate, then open the tenant context for the caller's active location.
 *
 * The two are deliberately fused into the one export every route already uses:
 * if resolving the location were a separate middleware, a route added later
 * could mount `protect` alone and quietly run its queries unscoped. Because
 * tenantScope throws rather than returning everything, that would surface as a
 * crash rather than a leak — but not forgetting at all is better still.
 */
const protect = [authenticate, resolveLocation];

const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: `Role (${req.user.role}) is not allowed to access this resource` });
    }
    next();
  };
};

module.exports = { protect, authenticate, authorizeRoles };
