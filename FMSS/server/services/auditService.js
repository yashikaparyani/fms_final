const LoadAudit = require("../models/LoadAudit");
const {
  TRACKED_SET,
  FLATTENED,
  DATE_FIELDS,
  BOOLEAN_FIELDS,
  labelFor,
} = require("../config/loadFieldLabels");

// ─── Recording what happened to a load ────────────────────────────────────────
// Everything that writes to the audit trail goes through here, so the trail has
// one shape and one set of rules rather than fifteen call sites each inventing
// their own.
//
// The governing decision: **recording an event must never break the thing that
// happened.** A load that moved to DELIVERED has moved, whether or not the log
// line was written. Every record function therefore swallows its own errors and
// reports them to the console rather than throwing — an audit trail that can
// fail a delivery update is worse than a gap in an audit trail.
// ─────────────────────────────────────────────────────────────────────────────

const isBlank = (value) =>
  value === undefined || value === null || value === "";

/** Compare loosely enough that "" and null are the same non-answer. */
const sameValue = (a, b) => {
  if (isBlank(a) && isBlank(b)) return true;
  if (a instanceof Date || b instanceof Date) {
    const aTime = a ? new Date(a).getTime() : null;
    const bTime = b ? new Date(b).getTime() : null;
    return aTime === bTime;
  }
  // Dates arrive as strings from a form and as Dates from the database, so the
  // comparison has to survive both.
  if (typeof a === "object" || typeof b === "object") {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  }
  return String(a ?? "") === String(b ?? "");
};

/** A value in a form a person can read in a sentence. */
const present = (field, value) => {
  if (isBlank(value)) return "—";

  if (BOOLEAN_FIELDS.has(field)) return value ? "Yes" : "No";

  if (DATE_FIELDS.has(field)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleDateString("en-US");
  }

  if (typeof value === "object") return JSON.stringify(value);

  return String(value);
};

/** Read a possibly-nested path off a plain object. */
const read = (source, path) =>
  path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), source);

/**
 * Field-level differences between two versions of a load.
 *
 * Nested objects named in FLATTENED are compared leaf by leaf: "Pickup City:
 * Long Beach → Oakland" is an answer, whereas two JSON blobs under the heading
 * "Pickup changed" is a puzzle.
 */
const diffLoad = (before = {}, after = {}) => {
  const changes = [];

  const consider = (field) => {
    if (!TRACKED_SET.has(field)) return;

    const from = read(before, field);
    const to = read(after, field);

    if (sameValue(from, to)) return;

    changes.push({
      field,
      label: labelFor(field),
      from: present(field, from),
      to: present(field, to),
    });
  };

  // Top-level tracked fields.
  TRACKED_SET.forEach((field) => {
    if (!field.includes(".")) consider(field);
  });

  // Leaves of the flattened objects.
  FLATTENED.forEach((parent) => {
    TRACKED_SET.forEach((field) => {
      if (field.startsWith(`${parent}.`)) consider(field);
    });
  });

  return changes;
};

/** The actor fields, denormalised so the trail survives the account being removed. */
const actorFrom = (user) => ({
  actor: user?._id,
  actorName:
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.email ||
    "System",
  actorRole: user?.role || "system",
});

/** Where the request came from, for a change somebody later disputes. */
const contextFrom = (req) => ({
  source: req?.body?.source === "mobile" ? "mobile" : req ? "web" : "system",
  ip: req
    ? req.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || ""
    : "",
});

/**
 * Write one entry.
 *
 * Never throws. See the note at the top of this file: the audit trail is a
 * record of work, not a participant in it.
 */
const record = async ({
  load,
  kind,
  action,
  summary,
  body,
  changes = [],
  user,
  req,
  visibility = "INTERNAL",
  followUp,
}) => {
  try {
    if (!load?._id) return null;

    return await LoadAudit.create({
      load: load._id,
      loadId: load.loadId,
      // The audit row belongs to the same location as the load it describes.
      // Stamped explicitly rather than left to the tenant plugin, because some
      // of these are written from cron jobs that run unscoped.
      locationId: load.locationId,
      kind,
      action,
      summary,
      body,
      changes,
      visibility,
      followUp,
      ...actorFrom(user),
      ...contextFrom(req),
    });
  } catch (error) {
    console.error(`[audit] could not record "${action}" on ${load?.loadId}:`, error.message);
    return null;
  }
};

// ── The events worth naming ──────────────────────────────────────────────────
// Each of these is a call site's way of saying what it MEANT, rather than
// leaving a generic diff to guess. "Assigned to Swift Haulage" and
// "assignedFleetOwner.fleetOwnerName: — → Swift Haulage" are the same change;
// only one of them reads like something that happened.

const recordCreated = (load, user, req) =>
  record({
    load,
    kind: "CREATED",
    action: "load.created",
    summary: `Load created${load.customerName ? ` for ${load.customerName}` : ""}`,
    user,
    req,
  });

/**
 * An ordinary edit. Writes nothing when nothing tracked actually moved — a save
 * that changed only `updatedAt` is not an event, and logging it would bury the
 * real ones.
 */
const recordFieldChanges = async ({ load, before, after, user, req, note }) => {
  const changes = diffLoad(before, after);
  if (!changes.length) return null;

  const summary =
    changes.length === 1
      ? `${changes[0].label} changed from ${changes[0].from} to ${changes[0].to}`
      : `${changes.length} details updated`;

  return record({
    load,
    kind: "FIELD_CHANGE",
    action: "load.updated",
    summary,
    body: note,
    changes,
    user,
    req,
  });
};

const recordStatusChange = ({ load, field, from, to, note, user, req }) =>
  record({
    load,
    kind: "STATUS",
    action: field === "transportStatus" ? "load.transport_status" : "load.status",
    summary: `${labelFor(field)} moved from ${present(field, from)} to ${present(field, to)}`,
    body: note,
    changes: [
      { field, label: labelFor(field), from: present(field, from), to: present(field, to) },
    ],
    user,
    req,
  });

const recordAssignment = ({ load, carrierName, previousName, released, user, req }) =>
  record({
    load,
    kind: "ASSIGNMENT",
    action: released ? "load.carrier_released" : "load.carrier_assigned",
    summary: released
      ? `Released from ${previousName || "the assigned carrier"}`
      : `Assigned to ${carrierName}${previousName ? ` (was ${previousName})` : ""}`,
    changes: [
      {
        field: "assignedFleetOwner.fleetOwnerName",
        label: "Assigned Carrier",
        from: previousName || "—",
        to: released ? "—" : carrierName,
      },
    ],
    user,
    req,
  });

const recordFinancial = ({ load, action, summary, changes, user, req }) =>
  record({ load, kind: "FINANCIAL", action, summary, changes, user, req });

const recordDocument = ({ load, action, summary, user, req }) =>
  record({ load, kind: "DOCUMENT", action, summary, user, req });

const recordCommunication = ({ load, summary, body, user, req }) =>
  record({
    load,
    kind: "COMMUNICATION",
    action: "load.email_sent",
    summary,
    body,
    user,
    req,
  });

/** The cron and other unattended work. No actor, and it says so. */
const recordSystem = ({ load, action, summary, changes }) =>
  record({ load, kind: "SYSTEM", action, summary, changes, user: null });

module.exports = {
  diffLoad,
  record,
  recordCreated,
  recordFieldChanges,
  recordStatusChange,
  recordAssignment,
  recordFinancial,
  recordDocument,
  recordCommunication,
  recordSystem,
  present,
  actorFrom,
};
