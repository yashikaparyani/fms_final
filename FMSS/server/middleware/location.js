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

// ─── Carriers work loads from any branch ──────────────────────────────────────
// A carrier is filed under the branch that onboarded them, but the office can
// assign them a load from any branch (Golden Dream, an Oakland-Rail carrier,
// was given LD 0145 from Head Office). Scoped to their own branch alone, that
// load was assigned and invisible: missing from their list, 404 on its detail
// screen, nothing to update the status on.
//
// So for the carrier side, reads also span the branches of the loads they hold.
// That widens nothing they could not already reach: every carrier endpoint
// filters by their own carrier id, and the one that does not, the open bid
// board, narrows itself back to `req.carrierHomeLocationIds`.
//
// Writes still default to the carrier's own branch, except a record about one
// of their loads (a tracking point, a notification, an audit row), which is
// filed under that load's branch so the office running the load sees it. See
// `loadLocations` in plugins/tenantScope.js.
// ─────────────────────────────────────────────────────────────────────────────

const CARRIER_ROLES = ["fleetOwner", "driver"];

/** Map of loadId → branch id for every load this carrier holds, in any branch. */
const carrierLoadLocations = async (user) => {
  // Required here rather than at the top: models load the tenant plugin, which
  // loads the context module this file also feeds.
  const { findCarrierFor, carrierLoadFilter } = require("../utils/carrierAccount");
  const Load = require("../models/Load");

  const carrier = await findCarrierFor(user, "_id");
  if (!carrier) return new Map();

  const loads = await Load.find(carrierLoadFilter(carrier._id))
    .setOptions({ skipTenantScope: true })
    .select("_id locationId")
    .lean();

  return new Map(
    loads.filter((l) => l.locationId).map((l) => [String(l._id), String(l.locationId)]),
  );
};

/** Widen a carrier's tenant context to the branches of the loads they hold. */
const widenForCarrier = async (req) => {
  if (!CARRIER_ROLES.includes(req.user.role)) return;

  const home = req.locationIds.map(String);
  req.carrierHomeLocationIds = home;

  const loadLocations = await carrierLoadLocations(req.user);
  const extra = [...new Set(loadLocations.values())].filter((id) => !home.includes(id));
  if (!extra.length) return;

  req.tenantContext = {
    ...req.tenantContext,
    locationIds: [...home, ...extra],
    loadLocations,
  };
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
        req.tenantContext = { locationIds: [], noLocations: true };
        return runWithTenant(req.tenantContext, next);
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
      req.tenantContext = { locationIds: allowed, allLocations: true };
      await widenForCarrier(req);
      return runWithTenant(req.tenantContext, next);
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
    req.tenantContext = { locationId: active };
    await widenForCarrier(req);

    return runWithTenant(req.tenantContext, next);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  resolveLocation,
  allowedLocationsFor,
  widenForCarrier,
  LOCATION_HEADER,
};
