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
 * Statuses at which a load stops being the carrier's business.
 *
 * Not the same question as "is it finished" — a delivered load is finished and
 * the carrier still needs it, because the POD is on it and that is what they
 * invoice against. These three are the ones where there is nothing left for
 * them on it at all:
 *
 *   INVOICED           the office has billed it; what happens next is between
 *                      them and the customer
 *   DROP_IN_WAREHOUSE  the box was handed over and is somebody else's problem
 *   TERMINATED         it is off; there is no work to do and no paperwork to
 *                      chase
 *
 * Deliberately narrower than the capacity module's finished list
 * (utils/carrierCapacity.js), which answers "is this truck free" — a different
 * question with a different answer for DELIVERED.
 */
const CARRIER_HIDDEN_TRANSPORT_STATUSES = [
  "INVOICED",
  "DROP_IN_WAREHOUSE",
  "TERMINATED",
];

/**
 * The carrier's work, as they should be shown it.
 *
 * `carrierLoadFilter` answers "is this theirs", which stays true forever and is
 * the right question for reading one load by id. This answers "should it still
 * be on their board", which is what every list they browse wants.
 */
const carrierVisibleLoadFilter = (fleetOwnerId) => ({
  ...carrierLoadFilter(fleetOwnerId),
  transportStatus: { $nin: CARRIER_HIDDEN_TRANSPORT_STATUSES },
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

// Leg statuses that mean the carrier's run is over — mirrors LEG_FINISHED on
// the Load model, repeated here so this module does not need the model.
const LEG_DONE = [
  "DELIVERED",
  "TERMINATED",
  "STREET_TURN",
  "EMPTY_IN_YARD",
  "LOADED_IN_YARD",
  "DROP_IN_WAREHOUSE",
];

/** The carrier's own leg of a split load: the one still running, else their first. */
const myLegOf = (load, fleetOwnerId) => {
  const theirs = (load?.assignments || []).filter(
    (l) => String(l.fleetOwnerId?._id || l.fleetOwnerId) === String(fleetOwnerId),
  );
  return theirs.find((l) => !LEG_DONE.includes(l.transportStatus)) || theirs[0] || null;
};

/**
 * One end of a leg, shaped as a stop. A stop picked off the load keeps the
 * load's own details for it (dates, contact); a typed-in handover point, like
 * a yard, has only what was typed — the load's pickup date is not the day the
 * box is collected from the yard.
 */
const stopFromLegPoint = (point, loadStops = []) => {
  if (!point) return null;
  const base =
    point.source === "STOP" && Number.isInteger(point.stopIndex)
      ? loadStops[point.stopIndex] || {}
      : {};
  return {
    ...base,
    company: point.company || base.company || "",
    address: point.address || base.address || "",
    city: point.city || base.city || "",
    state: point.state || base.state || "",
    zip: point.zip || base.zip || "",
  };
};

/**
 * A load as one carrier on it should see it.
 *
 * On a split load each carrier works their own leg: its own two ends, its own
 * status and its own history. Showing them the load's original pickup and drop
 * sent the second carrier to the port the first carrier already collected from.
 * On a single-carrier load nothing changes.
 */
const legView = (load, fleetOwnerId) => {
  const leg = myLegOf(load, fleetOwnerId);
  if (!leg) return { myLeg: null };

  const pickups = load.pickups?.length ? load.pickups : [load.pickup].filter(Boolean);
  const drops = load.drops?.length ? load.drops : [load.drop].filter(Boolean);
  const pickup = stopFromLegPoint(leg.origin, pickups);
  const drop = stopFromLegPoint(leg.destination, drops);

  return {
    myLeg: leg,
    transportStatus: leg.transportStatus,
    transportStatusHistory: leg.transportStatusHistory || [],
    ...(pickup ? { pickup, pickups: [pickup] } : {}),
    ...(drop ? { drop, drops: [drop] } : {}),
  };
};

/** A driver's own leg of a relay, the one still running, else their first. */
const myDriverLegOf = (load, driverId) => {
  const theirs = (load?.driverAssignments || []).filter(
    (l) => String(l.driver?._id || l.driver) === String(driverId) && !!l.transportStatus,
  );
  return theirs.find((l) => !LEG_DONE.includes(l.transportStatus)) || theirs[0] || null;
};

/**
 * A load as one *driver* on it should see it, when a single carrier runs it as a
 * relay of its own drivers. Same idea as legView for carrier legs: the driver
 * sees their own stretch — its two ends, its status and its timeline — not the
 * load's original ends, so the yard-to-door driver is not sent to the port the
 * first driver already collected from. A driver-leg pickup/drop is what was typed
 * for the handover; it has no load stop behind it.
 */
const driverLegView = (load, driverId) => {
  const leg = myDriverLegOf(load, driverId);
  if (!leg) return { myDriverLeg: null };

  const asStop = (point) =>
    point && (point.address || point.city || point.state || point.zip)
      ? {
          company: point.company || "",
          address: point.address || "",
          city: point.city || "",
          state: point.state || "",
          zip: point.zip || "",
        }
      : null;

  const pickup = asStop(leg.pickup);
  const drop = asStop(leg.drop);

  return {
    myDriverLeg: leg,
    transportStatus: leg.transportStatus,
    transportStatusHistory: leg.transportStatusHistory || [],
    ...(pickup ? { pickup, pickups: [pickup] } : {}),
    ...(drop ? { drop, drops: [drop] } : {}),
  };
};

/** A load with that figure attached, for the carrier-facing endpoints. */
const carrierLoadView = (load, fleetOwnerId, bid) => {
  const plain = load?.toObject ? load.toObject() : { ...load };
  const payout = carrierPayoutFor(plain, fleetOwnerId, bid);

  return {
    ...plain,
    ...legView(plain, fleetOwnerId),
    carrierPayout: payout.amount,
    carrierPayoutSource: payout.source,
  };
};


module.exports = {
  carrierPayoutFor,
  carrierLoadView,
  legView,
  driverLegView,
  carrierLoadFilter,
  carrierVisibleLoadFilter,
  CARRIER_HIDDEN_TRANSPORT_STATUSES,
  carrierUserIdFor,
  findCarrierFor,
  isCarrierSide,
  accountPersonFor,
};
