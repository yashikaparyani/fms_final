// ─── Tenant context for tests ─────────────────────────────────────────────────
// Most API suites replace `../middleware/auth` with a stub so they can drive a
// route as any role without minting real tokens. The real `protect` is
// `[authenticate, resolveLocation]` (see middleware/auth.js) — and the stubs
// only ever replaced the first half. With no `resolveLocation`, no tenant
// context is opened, so the first tenant-scoped query inside the handler throws
// "Tenant scope missing" and the whole suite fails on setup rather than on
// anything it was written to check.
//
// This provides the missing half. `authMock()` returns a drop-in replacement for
// the auth module whose `protect` both authenticates and opens a context, so the
// suites exercise the same scoping the real app does instead of switching it off.
//
// Fixtures created directly (not through a route) need the same context, and the
// SAME location — otherwise a record seeded in one tenant is invisible to a
// request scoped to another, which reads as a 404 for no obvious reason. `seed()`
// below is that context.
// ─────────────────────────────────────────────────────────────────────────────

const mongoose = require("mongoose");
const { withTenant } = require("../../utils/tenantContext");

// Fixed rather than random so fixtures and requests always agree, and so a
// failure is reproducible run to run.
const TEST_LOCATION_ID = "10ca10ca10ca10ca10ca10ca";

/**
 * A stand-in for `../middleware/auth`.
 *
 * @param {{defaultRole?: string}} options  Role used when a request sends no
 *        `role` header — suites differ on whether that should be staff or admin.
 */
const authMock = ({ defaultRole = "staff", bearerTestUser = false } = {}) => ({
  protect: [
    (req, res, next) => {
      // Some suites authenticate with `Bearer TestUser <role> <id>` and check
      // that a request with no header is refused. Those need the header to be
      // the only way in — a mock that always invents a user turns their
      // "rejects unauthenticated" case into a pass for the wrong reason.
      if (bearerTestUser) {
        const header = req.headers.authorization || "";
        if (!header.startsWith("Bearer TestUser")) {
          return res.status(401).json({ message: "Not authorized" });
        }
        const [, , role, id] = header.split(" ");
        req.user = { _id: id, id, role };
        return next();
      }

      req.user = {
        _id: req.headers.userid
          ? new mongoose.Types.ObjectId(req.headers.userid)
          : new mongoose.Types.ObjectId(),
        role: req.headers.role || defaultRole,
      };
      req.user.id = req.user._id.toString();
      next();
    },
    // The half the stubs were missing. Mirrors resolveLocation's single-location
    // branch, including what it puts on `req`.
    (req, res, next) => {
      req.locationId = TEST_LOCATION_ID;
      req.locationIds = [TEST_LOCATION_ID];
      req.allLocations = false;
      return withTenant({ locationId: TEST_LOCATION_ID }, () => next());
    },
  ],

  authenticate: (req, res, next) => {
    req.user = {
      _id: new mongoose.Types.ObjectId(),
      role: req.headers.role || defaultRole,
    };
    next();
  },

  authorizeRoles:
    (...roles) =>
    (req, res, next) => {
      if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ message: "Not authorized" });
      }
      next();
    },
});

/**
 * Run fixture setup inside the same tenant the mocked requests use, so seeded
 * records are visible to the routes under test.
 *
 *   const owner = await seed(() => FleetOwner.create({ ... }));
 */
const seed = (fn) => withTenant({ locationId: TEST_LOCATION_ID }, fn);

module.exports = { TEST_LOCATION_ID, authMock, seed };
