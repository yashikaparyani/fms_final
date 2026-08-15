const FleetOwner = require("../models/FleetOwner");

// ─── Which carrier is this request acting for? ────────────────────────────────
// Before driver sub-accounts existed, every carrier-scoped lookup was
// `FleetOwner.findOne({ userId: req.user._id })` — the signed-in user *was* the
// carrier.
//
// A driver is a sub-account of a fleet owner (models/User.js `parentAccount`),
// so their own id matches no FleetOwner at all. Resolving through the parent is
// what lets a driver see the trips their carrier was assigned, and only those:
// the driver never names a carrier, it is read off their own account, so there
// is nothing for them to tamper with.
// ─────────────────────────────────────────────────────────────────────────────

/** The user id that owns the carrier record for `user`. */
const carrierUserIdFor = (user) => {
  if (!user) return null;
  if (user.role === "driver") return user.parentAccount || null;
  return user._id || null;
};

/** True for the roles that operate as (or on behalf of) a carrier. */
const isCarrierSide = (user) => ["fleetOwner", "driver"].includes(user?.role);

/**
 * The FleetOwner this user acts for, or null.
 *
 * `select` is passed straight through so callers that only want `_id` and a name
 * are not made to load the ratings array to get them.
 */
const findCarrierFor = async (user, select) => {
  const userId = carrierUserIdFor(user);
  if (!userId) return null;

  const query = FleetOwner.findOne({ userId });
  return select ? query.select(select) : query;
};

/**
 * The carrier's account person — the one name shown wherever a load says who it
 * is assigned to.
 *
 * A load can have several drivers on it, and none of them is the answer to "who
 * is handling this?". The office and the customer deal with the carrier's
 * primary contact; showing driver names there would invite somebody to ring a
 * driver mid-run about a booking question. So the drivers stay on the
 * assignment record and this name is what gets displayed.
 *
 * Falls back through the contact list rather than returning nothing: a carrier
 * created before `isPrimary` was set still has somebody to name.
 */
const accountPersonFor = (carrier) => {
  const contacts = carrier?.contactPersons || [];
  const contact = contacts.find((c) => c.isPrimary) || contacts[0] || null;

  if (!contact?.name) return null;

  return {
    name: contact.name,
    phone: contact.phone || "",
    email: contact.email || "",
  };
};

module.exports = {
  carrierUserIdFor,
  findCarrierFor,
  isCarrierSide,
  accountPersonFor,
};
