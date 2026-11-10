const { allowedLocationsFor } = require("../middleware/location");

// ─── Where a master record is offered ─────────────────────────────────────────
// Customers, carriers, stop companies, street-turn partners, shipping lines and
// chassis companies carry `availableAt`: the locations whose lists and dropdowns
// show them. See the "Shared models" note in plugins/tenantScope.js.
//
// The form sends the ticked locations. Two rules apply on the way in:
//
//   - You can only tick locations you work in yourself (an admin works in all).
//   - Saving never drops a location you cannot see. A Chicago dispatcher editing
//     a carrier that New York also uses would otherwise silently remove it from
//     New York just by saving — they were never shown that box to untick.
// ─────────────────────────────────────────────────────────────────────────────

const httpError = (status, message, code) =>
  Object.assign(new Error(message), { status, code });

/** What a record is available at today, including rows from before the field. */
const currentAvailability = (doc) => {
  if (!doc) return [];
  if (doc.availableAt?.length) return doc.availableAt.map(String);
  return doc.locationId ? [String(doc.locationId)] : [];
};

/**
 * The `availableAt` to store, or undefined when the request did not send one
 * (the record keeps what it has, and a new record defaults to the active
 * location).
 *
 * @param req        the request — its user decides which locations may be ticked
 * @param requested  `req.body.availableAt`
 * @param existing   the record being edited, if any
 */
const resolveAvailability = async (req, requested, existing = null) => {
  if (requested === undefined || requested === null) return undefined;

  const asked = [
    ...new Set(
      (Array.isArray(requested) ? requested : [requested])
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ),
  ];

  const allowed = await allowedLocationsFor(req.user);
  const current = currentAvailability(existing);
  // An edit form sends back the whole list, including locations this user does
  // not manage. Those are already there, so they are not being "ticked".
  if (asked.some((id) => !allowed.includes(id) && !current.includes(id))) {
    throw httpError(
      403,
      "You can only make this available at locations you work in.",
      "LOCATION_FORBIDDEN",
    );
  }

  const keptOutOfSight = current.filter((id) => !allowed.includes(id));
  const result = [...new Set([...asked.filter((id) => allowed.includes(id)), ...keptOutOfSight])];

  if (!result.length) {
    throw httpError(
      400,
      "Choose at least one location where this should be available.",
      "AVAILABILITY_REQUIRED",
    );
  }
  return result;
};

/**
 * Give a customer's or carrier's sign-in account the same locations as their
 * record, so their portal shows loads from every location they work with.
 * The account's default stays put when it is still one of them.
 */
const syncAccountLocations = async (userId, locationIds, { session } = {}) => {
  if (!userId || !locationIds?.length) return;
  const User = require("../models/User");
  const user = await User.findById(userId).session(session || null);
  if (!user) return;

  const ids = locationIds.map(String);
  const same =
    (user.locations || []).length === ids.length &&
    (user.locations || []).every((id) => ids.includes(String(id)));
  const defaultOk = user.defaultLocation && ids.includes(String(user.defaultLocation));
  if (same && defaultOk) return;

  // updateOne rather than save(): the User pre-save hook re-hashes the password
  // when it looks modified, and nothing about the password is changing here.
  await User.updateOne(
    { _id: user._id },
    { $set: { locations: ids, defaultLocation: defaultOk ? user.defaultLocation : ids[0] } },
    { session: session || undefined },
  );
};

module.exports = { resolveAvailability, currentAvailability, syncAccountLocations };
