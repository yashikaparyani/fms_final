// ─── Dashboard drill-down buckets ────────────────────────────────────────────
// Tiles on the staff dashboard that are not a plain transport-status count need
// a filter of their own:
//
//   pickupDay=today|tomorrow — the "Same Day" / "Next Day" tiles, i.e. loads
//                              scheduled to pick up on that calendar day
//   accessorial              — loads carrying accessorial charges
//   unassigned               — verified loads nobody is carrying yet
//
// They live here, beside utils/lfdBuckets.js and for the same reason: the tile
// count and the list its drill-down opens are built from one query, so the two
// cannot drift. A tile that disagrees with its own list is worse than no tile.

// Every bucket below is scoped the same way the transport-status tiles are —
// only verified loads, since an unverified load has no committed schedule.
const bucketBaseFilter = () => ({ status: "VERIFIED" });

const PICKUP_DAYS = { today: 0, tomorrow: 1 };

/**
 * Mongo filter for loads picking up on `day` ("today" | "tomorrow"), given a
 * `dayRange(offsetDays)` that resolves a calendar day in the viewer's zone.
 * Returns null for an unknown day name.
 *
 * `pickup.pickupDate` is kept in sync with `pickups[0]` on save, so the single
 * stop is the field to query. The range operator also drops loads with no
 * pickup date rather than counting them as today's.
 */
const pickupDayFilter = (day, dayRange) => {
  const offset = PICKUP_DAYS[day];
  if (offset === undefined) return null;

  const { start, end } = dayRange(offset);
  return {
    ...bucketBaseFilter(),
    "pickup.pickupDate": { $gte: start, $lt: end },
  };
};

/** Mongo filter for loads flagged as carrying accessorial charges. */
const accessorialFilter = () => ({
  ...bucketBaseFilter(),
  isAccessorialCharges: true,
});

/**
 * Verified loads with nobody carrying them — no primary carrier and no legs.
 *
 * This is the queue the status lock creates: an unassigned load's transport
 * status cannot be touched (see the LOAD_NOT_ASSIGNED gate in
 * controllers/loadController.js), so a load sitting here is a load nothing can
 * be reported about until somebody acts on it. That makes it worth a tile of its
 * own rather than something to be inferred from the difference between two
 * others.
 *
 * `$in: [null]` matches an absent field as well as an explicitly null one, so a
 * load that was never assigned and one that was unassigned again both count.
 *
 * `assignments` is `default: undefined`, so "no legs" is a missing field on some
 * loads and an empty array on others; `$not: { $elemMatch: {} }` is the one
 * expression that covers both. Deliberately not a top-level `$or` — the free
 * text search in getLoads claims that key for itself, and a bucket that quietly
 * overwrites it would return the wrong loads rather than fail.
 */
const unassignedFilter = () => ({
  ...bucketBaseFilter(),
  "assignedFleetOwner.fleetOwnerId": { $in: [null] },
  assignments: { $not: { $elemMatch: {} } },
});

module.exports = {
  PICKUP_DAYS,
  bucketBaseFilter,
  pickupDayFilter,
  accessorialFilter,
  unassignedFilter,
};
