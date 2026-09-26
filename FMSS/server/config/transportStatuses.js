// ─── Where a load sits in its journey ─────────────────────────────────────────
// The one definition of "still running" and "finished", shared by everything
// that has to answer either question.
//
// ── Why this file exists ─────────────────────────────────────────────────────
// These lists used to be written out by hand wherever they were needed, and the
// copies disagreed. The carrier app was the visible result: the Assigned tile
// counted five statuses, the Assigned list excluded a different four, and a load
// moved to PAPERWORK_PENDING fell through the gap — gone from the Assigned list,
// not yet in Completed, and counted by neither tile. To the carrier it looked
// like their load had been deleted by pressing a status button.
//
// So the rule is stated once here and imported. A load is running until it
// reaches a status that genuinely ends the journey; everything before that,
// paperwork included, is still the carrier's load.
// ─────────────────────────────────────────────────────────────────────────────

// The forward progression every load walks, in order.
const MAIN_PROGRESSION = [
  "ASSIGNED",
  "READY_TO_PICKUP",
  "PICKED_UP",
  "IN_TRANSIT",
  "REACHED_DESTINATION",
  "DELIVERED",
];

// The journey is over: the box is off the truck and nothing about it will move
// again. TERMINATED is here because a cancelled trip has also ended — it does
// not belong in a list of work still to do.
const COMPLETED_TRANSPORT_STATUSES = [
  "DELIVERED",
  "TERMINATED",
  "STREET_TURN",
  "EMPTY_IN_YARD",
  "LOADED_IN_YARD",
  "DROP_IN_WAREHOUSE",
];

// The driving is done and the documents are not. A paperwork-pending load has
// nothing left for dispatch to arrange, so it leaves All Transit — but it is not
// an ended journey either, so it does not belong in the same bucket as delivered
// and terminated. It gets its own sub-tab under Over, which is where the person
// chasing the driver for a Bill of Lading is looking.
//
// Deliberately NOT added to COMPLETED_TRANSPORT_STATUSES: that list also decides
// what a carrier has finished with, and a carrier whose load vanishes into
// "Completed" the moment it needs paperwork is a carrier who never uploads it.
// See CARRIER_FINISHED_STATUSES below.
const PAPERWORK_TRANSPORT_STATUSES = ["PAPERWORK_PENDING"];

// Everything the Over tab lists: the journeys that ended, plus the ones waiting
// on documents.
const OVER_TAB_TRANSPORT_STATUSES = [
  ...COMPLETED_TRANSPORT_STATUSES,
  ...PAPERWORK_TRANSPORT_STATUSES,
];

// Handed to the back office. An invoiceable load is finished as far as dispatch
// is concerned — nothing about it will move again — but it is not finished as a
// piece of work: somebody still has to bill it. So it leaves All Transit without
// landing in Over, and turns up in Accounting instead, which is where the person
// who has to act on it is sitting.
//
// Kept separate from COMPLETED_TRANSPORT_STATUSES rather than added to it: the
// Over tab is the archive of journeys that ended, and a load waiting to be
// invoiced filed under "done" is exactly how it stops being invoiced.
const ACCOUNTING_TRANSPORT_STATUSES = ["INVOICED"];

// Everything that has left dispatch's hands, by one route or the other.
const OFF_TRANSIT_TRANSPORT_STATUSES = [
  ...OVER_TAB_TRANSPORT_STATUSES,
  ...ACCOUNTING_TRANSPORT_STATUSES,
];

// ─── Parked, not finished ─────────────────────────────────────────────────────
// A container waiting in a yard or a warehouse. It counts as "off transit" while
// it sits there — nothing is moving — but the box has NOT completed its journey:
// it still has to be collected and driven the rest of the way. So the moment it
// is handed to a driver again (a straight driver swap, or a new carrier), it goes
// back onto the transit board rather than staying filed under "done".
//
// TERMINATED and DELIVERED are deliberately left out: those are real endings, and
// naming a driver on a delivered load must not resurrect it. STREET_TURN is out
// too — it is settled between carriers, not a box parked waiting for a truck.
const REASSIGNABLE_PARKED_STATUSES = [
  "LOADED_IN_YARD",
  "EMPTY_IN_YARD",
  "DROP_IN_WAREHOUSE",
];

// What a carrier sees under "Completed". Wider than COMPLETED_TRANSPORT_STATUSES
// by one: a delivered load that the office has since invoiced is still done from
// where the carrier is standing, and dropping off their list entirely when we
// raise the invoice would be inexplicable to them.
//
// Narrower than OFF_TRANSIT_TRANSPORT_STATUSES by one, and that is the point:
// PAPERWORK_PENDING has left the office's transit board but has NOT left the
// driver's. Uploading the documents is the work, and it is theirs.
const CARRIER_FINISHED_STATUSES = [
  ...COMPLETED_TRANSPORT_STATUSES,
  ...ACCOUNTING_TRANSPORT_STATUSES,
];

/**
 * Is this load still the carrier's to move?
 *
 * Everything that is not finished — which deliberately includes the paperwork
 * and waiting statuses that sit mid-journey (PAPERWORK_PENDING,
 * DRIVER_ON_WAITING). The load has not been delivered, so it is still running.
 */
const isCarrierActive = (transportStatus) =>
  !!transportStatus && !CARRIER_FINISHED_STATUSES.includes(transportStatus);

module.exports = {
  MAIN_PROGRESSION,
  COMPLETED_TRANSPORT_STATUSES,
  PAPERWORK_TRANSPORT_STATUSES,
  OVER_TAB_TRANSPORT_STATUSES,
  ACCOUNTING_TRANSPORT_STATUSES,
  OFF_TRANSIT_TRANSPORT_STATUSES,
  CARRIER_FINISHED_STATUSES,
  REASSIGNABLE_PARKED_STATUSES,
  isCarrierActive,
};
