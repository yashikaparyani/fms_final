// ─── Is anybody carrying this load? ───────────────────────────────────────────
// The transport status is a statement about a carrier — ready to pick up, picked
// up, in transit — so it stays locked until there is a carrier for it to be
// about. Assignment itself sets ASSIGNED, which is the first honest value the
// status can hold.
//
// The server enforces the same rule (see the LOAD_NOT_ASSIGNED gate in
// controllers/loadController.js); this exists so the control is visibly
// unavailable rather than available-then-rejected, and so every screen that
// offers a status control asks the question the same way.
// ─────────────────────────────────────────────────────────────────────────────

/** True once the primary carrier is set, or the load has been split into legs. */
export const isAssignedToCarrier = (load) =>
  Boolean(load?.assignedFleetOwner?.fleetOwnerId) ||
  Boolean(load?.assignments?.length);

// Where a carrier's run ends with the box left behind. The next move is a second
// driver collecting it, not a change of carrier — see AssignCarrierLegsDialog.
const PARKED = ["EMPTY_IN_YARD", "LOADED_IN_YARD", "DROP_IN_WAREHOUSE"];

/** True while a carrier's run has left the load in a yard or at a warehouse. */
export const isParkedWithCarrier = (load) =>
  isAssignedToCarrier(load) && PARKED.includes(load?.transportStatus);

/** Why the status control is disabled, for a tooltip or a toast. */
export const STATUS_LOCKED_REASON =
  "Assign this load to a carrier before updating its status.";
