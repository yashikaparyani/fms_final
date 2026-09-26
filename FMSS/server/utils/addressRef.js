const Address = require("../models/common/Address");

// ─── Turning a typed address into a stored reference ──────────────────────────
// Customer, FleetOwner and Company all declare `addresses` as
// `[{ type: ObjectId, ref: "Address" }]` — a list of *references* to Address
// documents, not embedded address objects. So an address the user typed cannot
// be dropped straight into that array: Mongoose tries to cast the object (or the
// stringified object) to an ObjectId, and the save blows up with
//   Cast to [ObjectId] failed for value "[ { street: ... } ]" at path addresses.0
// which is exactly the error carrier approval was throwing.
//
// The client sign-up path already did this the right way by hand — create an
// Address document, then push its `_id`. This helper is that same step in one
// place, so every path that stores an address stores a reference and none of
// them can reintroduce the mismatch.
// ─────────────────────────────────────────────────────────────────────────────

// An address form comes back with every field present but blank when the user
// left it empty. Storing that would litter the collection with hollow Address
// documents, so an all-blank address resolves to no reference at all.
const hasAnyField = (address) =>
  !!address &&
  [address.street, address.suite, address.city, address.state, address.zip].some(
    (value) => String(value ?? "").trim(),
  );

/**
 * Create an Address document for `address` and return its `_id`, ready to push
 * into an `addresses` reference array. Returns null for an empty address.
 *
 * `owner` carries the back-reference the Address model records (`customer` or
 * `company`) and the `locationId` to file it under. `locationId` is passed
 * explicitly on paths that run without an active tenant context (public
 * sign-up approval); where a context exists, tenantScope stamps it, so leaving
 * it undefined is fine.
 *
 * Pass the Mongo `session` on transactional paths so the Address is created and
 * rolled back with the rest of the account.
 */
const createAddressRef = async (address, owner = {}, session) => {
  if (!hasAnyField(address)) return null;

  const [doc] = await Address.create(
    [
      {
        street: address.street || "",
        suite: address.suite || "",
        city: address.city || "",
        state: address.state || "",
        zip: address.zip || "",
        directions: address.directions,
        lat: address.lat,
        lng: address.lng,
        ...(owner.customer ? { customer: owner.customer } : {}),
        ...(owner.company ? { company: owner.company } : {}),
        ...(owner.locationId ? { locationId: owner.locationId } : {}),
      },
    ],
    session ? { session } : undefined,
  );

  return doc._id;
};

module.exports = { createAddressRef };
