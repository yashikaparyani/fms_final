// ─── One truck, one load ──────────────────────────────────────────────────────
// A carrier cannot run more loads at once than they have trucks to run them
// with. The case that matters is the owner-operator: one tractor, one driver,
// and a load already on it. Until that load is delivered they cannot take
// another, so they must not be assigned one, must not be able to bid for one,
// and must not be shown the board at all — a carrier browsing loads they are
// not allowed to accept is being invited to waste their own time and ours.
//
// Two numbers decide it:
//
//   trucks   — the power units on the carrier's Appendix A equipment schedule
//              (models/CarrierOnboarding.js). That schedule is signed, so it is
//              the closest thing to an authoritative fleet size we hold.
//   running  — loads assigned to them, by any route, that have not finished.
//
// A carrier with nothing on their schedule is NOT restricted. Absent data is
// not evidence of a one-truck fleet, and treating it as one would silently lock
// every carrier who signed up before onboarding existed out of the bid board
// with no way for them to see why.
// ─────────────────────────────────────────────────────────────────────────────

const CarrierOnboarding = require("../models/CarrierOnboarding");
const Load = require("../models/Load");

// What can actually pull a load. A trailer or a chassis is equipment the
// carrier owns, not a second truck they could run a second load with.
const POWER_UNIT_TYPES = new Set(["Tractor", "Straight Truck"]);

// A load stops occupying a truck once it is delivered or otherwise finished.
// INVOICED is included: the box is gone and only the paperwork is left, so
// holding the carrier's only truck hostage to an unbilled invoice would be
// absurd.
const FINISHED_TRANSPORT_STATUSES = [
  "DELIVERED",
  "TERMINATED",
  "STREET_TURN",
  "EMPTY_IN_YARD",
  "LOADED_IN_YARD",
  "DROP_IN_WAREHOUSE",
  "INVOICED",
];

/**
 * How many trucks this carrier has told us about.
 *
 * `null` means "we do not know" — not zero. The callers below treat the two
 * very differently.
 */
const truckCountFor = async (fleetOwnerId) => {
  const onboarding = await CarrierOnboarding.findOne({ fleetOwner: fleetOwnerId })
    .select("equipment")
    .lean();

  const equipment = onboarding?.equipment || [];
  if (!equipment.length) return null;

  const trucks = equipment.filter((item) =>
    POWER_UNIT_TYPES.has(String(item?.equipmentType || "").trim()),
  ).length;

  // A schedule listing only trailers is a schedule we cannot read a fleet size
  // out of, which is the "unknown" case rather than the "no trucks" case.
  return trucks > 0 ? trucks : null;
};

/** Mongo filter for the loads a carrier currently has on the road. */
const runningLoadsFilter = (fleetOwnerId) => ({
  transportStatus: { $nin: FINISHED_TRANSPORT_STATUSES },
  $or: [
    { "assignedFleetOwner.fleetOwnerId": fleetOwnerId },
    { "assignments.fleetOwnerId": fleetOwnerId },
  ],
});

/**
 * Whether this carrier has room for another load.
 *
 * Returns everything a caller needs to explain the answer, because every one of
 * them has to tell somebody why: the carrier being refused a bid, the office
 * being refused an assignment, and the board that came back empty.
 */
const carrierAvailability = async (fleetOwnerId) => {
  if (!fleetOwnerId) {
    return { trucks: null, running: 0, atCapacity: false, blockingLoad: null };
  }

  const trucks = await truckCountFor(fleetOwnerId);

  // Unknown fleet size — no restriction. See the note at the top.
  if (trucks === null) {
    return { trucks: null, running: 0, atCapacity: false, blockingLoad: null };
  }

  const running = await Load.find(runningLoadsFilter(fleetOwnerId))
    .select("loadId transportStatus")
    .lean();

  return {
    trucks,
    running: running.length,
    atCapacity: running.length >= trucks,
    // Named so the message can say *which* load is in the way. On a one-truck
    // carrier there is only ever one, which is the whole point.
    blockingLoad: running[0] || null,
  };
};

/**
 * The sentence shown to a carrier who is at capacity, or null when they are not.
 *
 * One wording, used by the bid endpoint, the assignment endpoints and the phone
 * app, so a carrier is never told two different stories about the same rule.
 */
const atCapacityMessage = (availability) => {
  if (!availability?.atCapacity) return null;

  const { trucks, blockingLoad } = availability;
  const fleet = trucks === 1 ? "your truck is" : `all ${trucks} of your trucks are`;
  const load = blockingLoad?.loadId ? ` Load ${blockingLoad.loadId} is` : " A load is";

  return (
    `You cannot take on another load yet — ${fleet} already committed.` +
    `${load} still in progress; once it is delivered you will be able to see and bid on loads again.`
  );
};

module.exports = {
  POWER_UNIT_TYPES,
  FINISHED_TRANSPORT_STATUSES,
  truckCountFor,
  runningLoadsFilter,
  carrierAvailability,
  atCapacityMessage,
};
