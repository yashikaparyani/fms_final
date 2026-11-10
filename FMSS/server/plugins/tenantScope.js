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

// ─── Shared models ────────────────────────────────────────────────────────────
// Not everything is per-location. Two other shapes are declared on the model:
//
//   shared: true        One list for the whole business — addresses, drivers,
//                       carrier onboarding. Never filtered. `locationId` is
//                       still stamped when a single location is in play, as a
//                       label of where the record was first added (and so the
//                       per-location driver codes keep their counter).
//
//   availability: true  Master lists — customers, carriers, stop companies,
//                       street-turn partners, shipping lines, chassis
//                       companies — where whoever adds the record picks which
//                       locations it is offered at. The choice is stored in
//                       `availableAt`, and lists, searches and dropdowns only
//                       show records available at the location(s) in play.
//
// Availability decides where a record can be *picked*, not whether an existing
// link to it still resolves. A lookup by _id is therefore not filtered: a
// Chicago load that already names a carrier must still show that carrier after
// Chicago is unticked, and populate() of a load's customer must not come back
// null. Every list, search and count is filtered.
//
// Records from before the choice existed have no `availableAt`; they count as
// available where they were added (`locationId`), which is exactly how they
// behaved when everything was per-location — so no migration is needed.
// ─────────────────────────────────────────────────────────────────────────────

const noLocationPicked = (modelName) =>
  Object.assign(
    new Error(
      `Choose at least one location where this ${modelName} should be available.`,
    ),
    { status: 400, code: "AVAILABILITY_REQUIRED" },
  );

/**
 * True when the filter names specific records by _id — `{ _id: x }`,
 * `{ _id: { $in: [...] } }` (what populate sends) or `{ _id: { $eq: x } }`.
 * `$ne` / `$nin` exclude records rather than name them, so they still filter.
 */
const targetsSpecificIds = (filter) => {
  const id = filter?._id;
  if (id == null) return false;
  if (typeof id !== "object" || mongoose.isValidObjectId(id)) return true;
  const ops = Object.keys(id);
  return ops.length > 0 && ops.every((op) => op === "$in" || op === "$eq");
};

/** Location ids in play for a request context, or null when there is none. */
const locationsInPlay = (context) => {
  if (context.noLocations) return [];
  if (context.locationIds?.length) return context.locationIds;
  if (context.locationId) return [context.locationId];
  return null;
};

const availableIn = (ids) => {
  const oids = ids.map(toObjectId);
  return {
    $or: [
      { availableAt: { $in: oids } },
      // Legacy rows: available where they were first added.
      { "availableAt.0": { $exists: false }, locationId: { $in: oids } },
    ],
  };
};

const installSharedScope = (schema, { modelName, availability }) => {
  if (availability) {
    schema.add({
      availableAt: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Branch" }],
        default: undefined,
        // Deliberately unindexed. These are short master lists, and a new
        // index build on `customers` races the transaction that self-signup
        // writes in: Mongo refuses it with "catalog changes; please retry".
      },
    });
  }

  // Decide where a record lives. A caller-supplied `locationId` or
  // `availableAt` always wins; otherwise the active location is used.
  const place = (doc, context) => {
    if (context?.unscoped) return;

    if (availability && !(doc.availableAt || []).length) {
      // An existing row being re-saved keeps the location it was added in,
      // rather than moving to whichever location happened to save it.
      const here = doc.locationId || context?.locationId;
      if (here) {
        doc.availableAt = [here];
      } else if (context?.noLocations) {
        throw noLocationsYet(`create a ${modelName}`);
      } else {
        throw noLocationPicked(modelName);
      }
    }

    if (!doc.locationId) {
      const here = context?.locationId || doc.availableAt?.[0];
      if (here) doc.locationId = here;
    }
  };

  schema.pre("validate", function stampSharedLocation() {
    place(this, getTenantContext());
  });

  schema.pre("insertMany", function stampManySharedLocations(docs) {
    const context = getTenantContext();
    for (const doc of docs || []) place(doc, context);
  });

  if (!availability) return;

  schema.pre(QUERY_HOOKS, function applyAvailabilityFilter() {
    const context = getTenantContext();
    if (context?.unscoped) return;
    if (this.getOptions?.().skipTenantScope) return;
    if (!context) throw missingContext(`querying ${modelName}`);

    if (targetsSpecificIds(this.getFilter?.())) return;

    const ids = locationsInPlay(context);
    if (!ids) throw missingContext(`querying ${modelName}`);

    // and() rather than where(): a caller's own $or must survive alongside it.
    this.and([availableIn(ids)]);
  });

  schema.pre("aggregate", function applyAvailabilityMatch() {
    const context = getTenantContext();
    if (context?.unscoped) return;
    if (this.options?.skipTenantScope) return;
    if (!context) throw missingContext(`aggregating ${modelName}`);

    const ids = locationsInPlay(context);
    if (!ids) throw missingContext(`aggregating ${modelName}`);
    this.pipeline().unshift({ $match: availableIn(ids) });
  });
};

module.exports = function tenantScope(
  schema,
  { modelName = "query", shared = false, availability = false } = {},
) {
  schema.add({
    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      index: true,
    },
  });

  if (shared || availability) {
    installSharedScope(schema, { modelName, availability });
    return;
  }

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

  // Mongoose 9 calls document middleware with the documents only — there is no
  // `next` any more, and an error is raised by throwing. This hook was still
  // written the old way, so its "next" was the docs array and every bulk insert
  // of a scoped model failed with "next is not a function".
  //
  // Rows that already carry a location are left alone and need no context,
  // matching stampLocation above: a caller that knows where a record belongs
  // (a notification about a load, filed under that load's location) can write
  // it even while the user is viewing all locations.
  schema.pre("insertMany", function stampManyLocations(docs) {
    const unstamped = (docs || []).filter((doc) => !doc.locationId);
    if (!unstamped.length) return;

    const context = getTenantContext();
    if (context?.unscoped) return;

    if (context?.noLocations) throw noLocationsYet(`insert ${modelName}`);
    if (context?.allLocations) throw allLocationsIsReadOnly(`insert ${modelName}`);
    if (!context?.locationId) throw missingContext(`inserting ${modelName}`);

    for (const doc of unstamped) doc.locationId = context.locationId;
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
