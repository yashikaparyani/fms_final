const mongoose = require("mongoose");
const { getTenantContext } = require("../utils/tenantContext");

// ─── Tenant scoping plugin ────────────────────────────────────────────────────
// Applied to every collection that holds per-location data. It does two things:
//
//   1. Stamps `locationId` onto anything created inside a request.
//   2. Injects a `locationId` filter into every read, update and delete.
//
// It exists because scoping 295 hand-written queries one by one would leak the
// first time somebody adds the 296th. Enforcement belongs in one place that new
// code cannot forget to call.
//
// It fails CLOSED. A query against tenant data with no context throws instead of
// returning everything, because the failure mode of guessing is one location
// reading another's loads. Work that genuinely spans locations must say so via
// runUnscoped() or .skipTenantScope().
// ─────────────────────────────────────────────────────────────────────────────

// Every query middleware that can read or modify documents. `distinct` and the
// findOneAnd* family are easy to forget and each one is a hole if missed.
const QUERY_HOOKS = [
  "count",
  "countDocuments",
  "deleteMany",
  "deleteOne",
  "distinct",
  "estimatedDocumentCount",
  "find",
  "findOne",
  "findOneAndDelete",
  "findOneAndRemove",
  "findOneAndReplace",
  "findOneAndUpdate",
  "replaceOne",
  "update",
  "updateMany",
  "updateOne",
];

// Queries get their filters cast by Mongoose, so a string id there just works.
// Aggregation pipelines are passed to the driver as-is with no casting, and a
// string will silently match nothing — which reads as "this location has no
// data" rather than as an error. Convert explicitly.
const toObjectId = (value) => {
  if (value instanceof mongoose.Types.ObjectId) return value;
  return mongoose.isValidObjectId(value)
    ? new mongoose.Types.ObjectId(String(value))
    : value;
};

const missingContext = (what) =>
  new Error(
    `Tenant scope missing: ${what} ran without an active location. ` +
      `Wrap request handling in resolveLocation, or declare the call ` +
      `location-spanning with runUnscoped() / .skipTenantScope().`,
  );

// "All locations" is a combined *reading* view: it spans several branches, so
// there is no single one to file a new record under. Picking one silently would
// put the record somewhere the user did not choose, which is the one thing this
// whole mechanism exists to prevent — so the write is refused and the message
// names the fix, because from the user's side this looks like a permission
// problem and it is not one.
const allLocationsIsReadOnly = (what) =>
  Object.assign(
    new Error(
      `Cannot ${what} while viewing all locations. ` +
        `Pick a single location from the switcher in the header, then try again.`,
    ),
    { status: 400, code: "ALL_LOCATIONS_READ_ONLY" },
  );

// A filter that matches nothing. Used for the "no locations exist yet" context —
// see the note on `noLocations` below.
const MATCH_NOTHING = { locationId: { $in: [] } };

const noLocationsYet = (what) =>
  Object.assign(
    new Error(
      `Cannot ${what}: no operating location exists yet. ` +
        `Create one from the Locations screen first.`,
    ),
    // Surfaced to the caller as a 400 rather than a 500 — this is a setup step
    // the user can take, not a fault.
    { status: 400, code: "NO_LOCATION_EXISTS" },
  );

module.exports = function tenantScope(schema, { modelName = "query" } = {}) {
  schema.add({
    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      index: true,
    },
  });

  // ── Writes: stamp the active location ──────────────────────────────────────
  // pre("validate") rather than pre("save") so the field is present before
  // required-field validation and before any model's own save hooks run — the
  // loadId hook needs locationId to pick the right counter.
  schema.pre("validate", function stampLocation() {
    if (this.locationId) return;

    const context = getTenantContext();
    if (context?.unscoped) return;

    // Writes still fail when no location exists — but with a message naming the
    // fix. There is genuinely nowhere to file the record, and silently inventing
    // a home for it would be worse than saying so.
    if (context?.noLocations) {
      throw noLocationsYet(`create a ${modelName}`);
    }

    if (context?.allLocations) {
      throw allLocationsIsReadOnly(`create a ${modelName}`);
    }

    if (!context?.locationId) {
      throw missingContext(`creating a ${modelName}`);
    }

    this.locationId = context.locationId;
  });

  schema.pre("insertMany", function stampManyLocations(next, docs) {
    const context = getTenantContext();
    if (context?.unscoped) return next();

    if (context?.noLocations) {
      return next(noLocationsYet(`insert ${modelName}`));
    }

    if (context?.allLocations) {
      return next(allLocationsIsReadOnly(`insert ${modelName}`));
    }

    if (!context?.locationId) return next(missingContext(`inserting ${modelName}`));

    for (const doc of docs || []) {
      if (!doc.locationId) doc.locationId = context.locationId;
    }
    next();
  });

  // ── Reads / updates / deletes: constrain to the active location ────────────
  schema.pre(QUERY_HOOKS, function applyLocationFilter() {
    const context = getTenantContext();
    if (context?.unscoped) return;

    // Per-call escape hatch, for the rare legitimate cross-location lookup.
    if (this.getOptions?.().skipTenantScope) return;

    if (!context) throw missingContext(`querying ${modelName}`);

    // ── No locations exist yet ────────────────────────────────────────────
    // An administrator on a fresh install, before the first branch is created.
    // Reads match nothing rather than throwing: with no branches there are no
    // loads, so an empty list is the truthful answer, and it cannot leak
    // another location's rows because there is no other location. Throwing here
    // instead would meet them with a stack trace on the dashboard when what
    // they need is the Locations screen.
    if (context.noLocations) {
      this.where(MATCH_NOTHING);
      return;
    }

    // A user with several locations viewing "all" sees exactly their own set —
    // never everything, which is why this is $in over the allowed list rather
    // than dropping the filter.
    if (context.locationIds?.length) {
      this.where({ locationId: { $in: context.locationIds } });
      return;
    }

    if (!context.locationId) throw missingContext(`querying ${modelName}`);

    // .where() wins over any locationId the caller passed, so a handler cannot
    // widen its own scope by supplying one.
    this.where({ locationId: context.locationId });
  });

  // Aggregations bypass query middleware entirely, so they need their own match
  // pushed to the very front of the pipeline — before any $group or $lookup can
  // fold in another location's rows.
  schema.pre("aggregate", function applyLocationMatch() {
    const context = getTenantContext();
    if (context?.unscoped) return;
    if (this.options?.skipTenantScope) return;
    if (!context) throw missingContext(`aggregating ${modelName}`);

    // Same as the query hook: nothing to aggregate over when no branch exists.
    if (context.noLocations) {
      this.pipeline().unshift({ $match: MATCH_NOTHING });
      return;
    }

    if (context.locationIds?.length) {
      this.pipeline().unshift({
        $match: { locationId: { $in: context.locationIds.map(toObjectId) } },
      });
      return;
    }

    if (!context.locationId) throw missingContext(`aggregating ${modelName}`);
    this.pipeline().unshift({
      $match: { locationId: toObjectId(context.locationId) },
    });
  });
};

module.exports.QUERY_HOOKS = QUERY_HOOKS;
