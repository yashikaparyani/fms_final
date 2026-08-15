const Branch = require("../models/Branch");
const { runWithTenant } = require("../utils/tenantContext");

// ─── Active location resolution ───────────────────────────────────────────────
// Decides which branch this request operates on, proves the caller is allowed
// there, and opens the tenant context that plugins/tenantScope.js reads.
//
// The client names its choice in the `x-location-id` header. Membership is
// checked against the user's own list every request — never trusted from the
// header alone — so changing the header cannot reach another branch's data.
// ─────────────────────────────────────────────────────────────────────────────

const LOCATION_HEADER = "x-location-id";
const ALL = "all";

/** Branch ids a user may operate in. Admins reach every active branch. */
const allowedLocationsFor = async (user) => {
  if (user.role === "admin") {
    const branches = await Branch.find({ active: true }).select("_id").lean();
    return branches.map((b) => String(b._id));
  }
  return (user.locations || []).map(String);
};

/**
 * Must run after `protect`. Populates:
 *   req.locationId   — the single active branch, or null in "all" mode
 *   req.locationIds  — every branch in play (always set)
 *   req.allLocations — true when the request spans the user's whole set
 * and runs the rest of the request inside the matching tenant context.
 */
const resolveLocation = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const allowed = await allowedLocationsFor(req.user);

    if (!allowed.length) {
      // ── Bootstrap ────────────────────────────────────────────────────────
      // An admin's location set is "every active branch", so an empty one does
      // not mean their account is misconfigured — it means the install has no
      // branches yet, or every branch has been deactivated. Refusing them here
      // is a deadlock: the screen that creates the first location is itself
      // behind this middleware, so there would be no way in at all.
      //
      // They are let through in a "no locations" context rather than an
      // unscoped one. Branch and User are not tenant-scoped, so the Locations
      // and Staff screens work as normal; per-location reads come back empty —
      // which is the truthful answer, since no branches means no loads — and
      // per-location writes are refused with a message naming the fix. See
      // `noLocations` in plugins/tenantScope.js.
      //
      // Empty rather than unscoped is what keeps this safe: an unscoped context
      // would show every location's data, which is the one thing this whole
      // mechanism exists to prevent.
      if (req.user.role === "admin") {
        req.locationId = null;
        req.locationIds = [];
        req.allLocations = false;
        req.noLocations = true;
        return runWithTenant({ locationIds: [], noLocations: true }, next);
      }

      return res.status(403).json({
        message:
          "Your account is not assigned to any location. Ask an administrator to assign one.",
        code: "NO_LOCATION",
      });
    }

    const requested = String(
      req.headers[LOCATION_HEADER] || req.query.locationId || "",
    ).trim();

    // "all" spans only what this user may already see — never everything.
    //
    // `allLocations` is carried into the tenant context as well as onto `req`,
    // so a write attempted in this mode is refused with a message that names the
    // fix rather than the internal "no active location" fault — see
    // plugins/tenantScope.js. Reads are unaffected and span the whole set.
    if (requested.toLowerCase() === ALL) {
      req.locationId = null;
      req.locationIds = allowed;
      req.allLocations = true;
      return runWithTenant({ locationIds: allowed, allLocations: true }, next);
    }

    if (requested && !allowed.includes(requested)) {
      return res.status(403).json({
        message: "You do not have access to that location.",
        code: "LOCATION_FORBIDDEN",
      });
    }

    // No explicit choice: the user's default when they still belong to it,
    // otherwise the first branch they can reach.
    const fallback =
      (req.user.defaultLocation && allowed.includes(String(req.user.defaultLocation))
        ? String(req.user.defaultLocation)
        : null) || allowed[0];

    const active = requested || fallback;

    req.locationId = active;
    req.locationIds = [active];
    req.allLocations = false;

    return runWithTenant({ locationId: active }, next);
  } catch (err) {
    next(err);
  }
};

module.exports = { resolveLocation, allowedLocationsFor, LOCATION_HEADER };
