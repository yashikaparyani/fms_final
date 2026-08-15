const { unknownPermissions } = require("../config/permissions");

// ─── Module permission gates ──────────────────────────────────────────────────
// Role answers "which portal is this?"; a permission answers "may this staff
// member do this particular thing?". Routes usually want both:
//
//   router.post("/", protect, authorizeRoles("admin", "staff"),
//               requirePermission("customers.create"), createCustomer)
//
// The role check stays because it is what keeps a client or a carrier out of a
// back-office route entirely — a permission list is only consulted for staff.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Require every one of `keys`.
 *
 * Admins pass unconditionally (the role is the permission). A staff member needs
 * all of the keys — routes that mean "any of these" should say so with
 * requireAnyPermission.
 */
const requirePermission = (...keys) => {
  const required = keys.flat().filter(Boolean);

  // A key that is not in the catalog can never be granted, so a route mounted
  // with a typo would reject every caller forever and read as a permission
  // problem. Fail at startup instead, where the stack points at the route.
  const typos = unknownPermissions(required);
  if (typos.length) {
    throw new Error(
      `requirePermission: unknown permission key(s) ${typos.join(", ")}. ` +
        `Add them to config/permissions.js or fix the spelling.`,
    );
  }

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (req.user.role === "admin") return next();

    const missing = required.filter((key) => !req.user.hasPermission?.(key));

    if (missing.length) {
      return res.status(403).json({
        message: `You do not have permission to do this (${missing.join(", ")}). Ask an administrator.`,
        code: "PERMISSION_DENIED",
        missing,
      });
    }

    next();
  };
};

/** Require at least one of `keys` — for screens reachable more than one way. */
const requireAnyPermission = (...keys) => {
  const options = keys.flat().filter(Boolean);

  const typos = unknownPermissions(options);
  if (typos.length) {
    throw new Error(
      `requireAnyPermission: unknown permission key(s) ${typos.join(", ")}.`,
    );
  }

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (req.user.role === "admin") return next();

    if (options.some((key) => req.user.hasPermission?.(key))) return next();

    return res.status(403).json({
      message: `You do not have permission to do this. Ask an administrator.`,
      code: "PERMISSION_DENIED",
      missing: options,
    });
  };
};

module.exports = { requirePermission, requireAnyPermission };
