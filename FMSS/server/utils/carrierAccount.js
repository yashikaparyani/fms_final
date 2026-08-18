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

/**
 * The filter that says "this load is this carrier's work".
 *
 * A load reaches a carrier two ways now: as the whole load (assignedFleetOwner,
 * how it has always been) or as one leg of a load split between carriers
 * (assignments). Both have to match, or a carrier handed the second leg would
 * not be able to see the load they are meant to run.
 *
 * Kept here rather than written out at each call site because it is the rule
 * that decides what a carrier can see, and four hand-written copies of it are
 * four chances for one to be missed when a fifth route appears.
 */
const carrierLoadFilter = (fleetOwnerId) => ({
  $or: [
    { "assignedFleetOwner.fleetOwnerId": fleetOwnerId },
    { "assignments.fleetOwnerId": fleetOwnerId },
  ],
});


/**
 * The figure a carrier should be shown for a load, and where it came from.
 *
 * A load carries several rates and they are not interchangeable. `vendorRate`
 * is what the load was *offered* at, which is the right number right up until
 * somebody bids — and the wrong one from that moment on. Once a bid is in, the
 * carrier is looking at their own bid; once it is negotiated and awarded, at the
 * settled amount. Reading them in the wrong order leaves a carrier who won a
 * load at 1,150 still looking at the 900 it was posted at.
 *
 * Returned with its source so the app can label it, rather than showing a bare
 * number whose meaning changed underneath it.
 *
 * @param {object} load
 * @param {string} fleetOwnerId
 * @param {object} [bid]  This carrier's bid on this load, when one is known.
 */
const carrierPayoutFor = (load, fleetOwnerId, bid) => {
  const mine = (id) => String(id || "") === String(fleetOwnerId);

  // 1. Awarded to them — the settled amount, whatever it was negotiated to.
  if (mine(load?.winningBid?.fleetOwnerId) && load.winningBid.amount != null) {
    return { amount: load.winningBid.amount, source: "AWARDED" };
  }

  // 2. An offer on the table they have not answered yet. Shown ahead of their
  //    own bid because it is the number being asked about.
  if (bid?.negotiation?.status === "PENDING" && bid.negotiation.amount != null) {
    return { amount: bid.negotiation.amount, source: "NEGOTIATING" };
  }

  // 3. Their own bid, standing.
  if (bid?.amount != null) {
    return { amount: bid.amount, source: "BID" };
  }

  // 4. Their leg's agreed rate on a load split between carriers — the load-level
  //    vendor rate cannot describe two carriers at once.
  const leg = (load?.assignments || []).find((l) => mine(l.fleetOwnerId));
  if (leg?.carrierRate != null) {
    return { amount: leg.carrierRate, source: "LEG_RATE" };
  }

  // 5. What it was posted at.
  if (load?.vendorRate != null) {
    return { amount: load.vendorRate, source: "OFFERED" };
  }

  return { amount: null, source: "NOT_SET" };
};

/** A load with that figure attached, for the carrier-facing endpoints. */
const carrierLoadView = (load, fleetOwnerId, bid) => {
  const plain = load?.toObject ? load.toObject() : { ...load };
  const payout = carrierPayoutFor(plain, fleetOwnerId, bid);

  return {
    ...plain,
    carrierPayout: payout.amount,
    carrierPayoutSource: payout.source,
    myLeg: (plain.assignments || []).find(
      (l) => String(l.fleetOwnerId) === String(fleetOwnerId),
    ) || null,
  };
};


module.exports = {
  carrierPayoutFor,
  carrierLoadView,
  carrierLoadFilter,
  carrierUserIdFor,
  findCarrierFor,
  isCarrierSide,
  accountPersonFor,
};
