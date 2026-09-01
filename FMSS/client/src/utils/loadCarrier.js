// ─── Who is carrying a load ───────────────────────────────────────────────────
// Reading the carrier off a load is not one field lookup, which is why it lives
// here rather than being re-derived per table:
//
//   · a single-carrier load names them in `assignedFleetOwner`
//   · a load split between carriers names each one on its own leg, and
//     `assignedFleetOwner` may be empty
//   · a load awarded through bidding but not yet stamped carries only
//     `winningBid.fleetOwnerId`, which has to be resolved against the carrier
//     list to get a name at all
//
// The Over tab had its own version reading `assignment.fleetOwnerName` and
// `fleetOwnerName` — neither of which is a field the loads API returns — so the
// carrier column on that tab was permanently blank.
// ─────────────────────────────────────────────────────────────────────────────

const idOf = (value) => (value && (value.$oid || value)) || null;

/** One carrier out of the roster, by id. */
export const findCarrier = (fleetOwners = [], id) => {
  const wanted = idOf(id);
  if (!wanted) return null;
  return fleetOwners.find((owner) => owner._id === wanted) || null;
};

/**
 * The primary carrier on a load as `{ name, phone }`, or null.
 *
 * `fleetOwners` is optional: without it the name still resolves for an assigned
 * load, and only the phone number and the winning-bid fallback are lost.
 */
export const carrierOnLoad = (load, fleetOwners = []) => {
  const assigned = load?.assignedFleetOwner;
  if (assigned?.fleetOwnerName) {
    return {
      name: assigned.fleetOwnerName,
      phone: findCarrier(fleetOwners, assigned.fleetOwnerId)?.phone || null,
    };
  }

  // A split load names its carriers on the legs. The first leg is the primary
  // one — it is the carrier who picks the load up.
  const firstLeg = load?.assignments?.[0];
  if (firstLeg?.fleetOwnerName) {
    return {
      name: firstLeg.fleetOwnerName,
      phone: findCarrier(fleetOwners, firstLeg.fleetOwnerId)?.phone || null,
    };
  }

  const winner = findCarrier(fleetOwners, load?.winningBid?.fleetOwnerId);
  if (winner) return { name: winner.carrierName, phone: winner.phone || null };

  return null;
};

/** The carrier's id, for a call that has to name whose roster to read. */
export const carrierIdOnLoad = (load) =>
  idOf(load?.assignedFleetOwner?.fleetOwnerId) ||
  idOf(load?.assignments?.[0]?.fleetOwnerId) ||
  idOf(load?.winningBid?.fleetOwnerId) ||
  null;

/** Just the name, for a column that has no room for anything else. */
export const carrierNameOnLoad = (load, fleetOwners = []) =>
  carrierOnLoad(load, fleetOwners)?.name || null;
