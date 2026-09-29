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
 * A carrier's phone: their own number, else their primary contact's — plenty of
 * carriers were entered with the number only against the contact person.
 */
export const carrierPhone = (owner) => {
  if (!owner) return null;
  if (owner.phone) return owner.phone;
  const contacts = owner.contactPersons || [];
  const contact = contacts.find((c) => c.isPrimary && c.phone) || contacts.find((c) => c.phone);
  return contact?.phone || null;
};

/** The phone for a carrier id on a load, from the roster. */
export const phoneForCarrier = (fleetOwners, id) =>
  carrierPhone(findCarrier(fleetOwners, id));

/**
 * Every carrier on a load as `{ name, phone }`, in running order — each leg of
 * a split load, otherwise the one carrier. Empty when nobody is on it.
 */
export const carriersOnLoad = (load, fleetOwners = []) => {
  if (load?.assignments?.length) {
    return load.assignments.map((leg) => ({
      name: leg.fleetOwnerName,
      phone: phoneForCarrier(fleetOwners, leg.fleetOwnerId),
    }));
  }
  const one = carrierOnLoad(load, fleetOwners);
  return one ? [one] : [];
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
      phone: phoneForCarrier(fleetOwners, assigned.fleetOwnerId),
    };
  }

  // A split load names its carriers on the legs. The first leg is the primary
  // one — it is the carrier who picks the load up.
  const firstLeg = load?.assignments?.[0];
  if (firstLeg?.fleetOwnerName) {
    return {
      name: firstLeg.fleetOwnerName,
      phone: phoneForCarrier(fleetOwners, firstLeg.fleetOwnerId),
    };
  }

  const winner = findCarrier(fleetOwners, load?.winningBid?.fleetOwnerId);
  if (winner) return { name: winner.carrierName, phone: carrierPhone(winner) };

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
