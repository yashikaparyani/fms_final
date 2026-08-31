import { PRE_DISPATCH, STATUS_ROW_COLORS } from "./loadColorMode";

// ─── Transport statuses, as people see them ───────────────────────────────────
// One list, in journey order, for every screen that names a transport status:
// the Update Status controls, the status filters, the Over tab's sub-tabs. It
// was previously written out four times — in AssignedLoadsTable, in
// TransportStatusDialog, in StaffLoadDetails and in Load.jsx — and the four had
// already drifted, each offering a slightly different set.
//
// The order comes from STATUS_ROW_COLORS so the list, the row tints and the
// legend all read the same way round, and adding a status to the model means
// adding it in exactly one place here.
// ─────────────────────────────────────────────────────────────────────────────

/** Every status the model can hold, in journey order. */
export const TRANSPORT_STATUSES = Object.keys(STATUS_ROW_COLORS);

// Written out rather than generated so "Ready to Pickup" is not "Ready To
// Pickup" — a generated title case gets the small words wrong, and these labels
// are read all day.
const LABELS = {
  LOAD_PLANNER: "Load Planner",
  NEW_LOAD: "New Load",
  ASSIGNED: "Assigned",
  READY_TO_PICKUP: "Ready to Pickup",
  PICKED_UP: "Picked Up",
  IN_TRANSIT: "In Transit",
  DRIVER_ON_WAITING: "Driver on Waiting",
  REACHED_DESTINATION: "Reached Destination",
  DELIVERED: "Delivered",
  DROP_IN_WAREHOUSE: "Drop in Warehouse",
  EMPTY_IN_YARD: "Empty in Yard",
  LOADED_IN_YARD: "Loaded in Yard",
  STREET_TURN: "Street Turn",
  PAPERWORK_PENDING: "Paperwork Pending",
  INVOICED: "Invoiced",
  TERMINATED: "Terminated",
};

/** "READY_TO_PICKUP" → "Ready to Pickup". Falls back to the raw value. */
export const transportStatusLabel = (value) =>
  LABELS[value] || (value || "—").replace(/_/g, " ");

/**
 * The statuses a person may actually choose.
 *
 * Load Planner and New Load are excluded. They are not decisions anybody makes
 * — they are where a load sits before it has been dispatched, written by the
 * system on creation and on unassignment — and offering them alongside "Picked
 * Up" invited somebody to reverse a live load into a pre-dispatch state. Since
 * the status control is locked until a load is assigned (see loadAssignment.js),
 * neither could be a legitimate choice anyway.
 *
 * Both remain valid on the model and still colour and label correctly wherever
 * a load is genuinely sitting in one.
 */
export const SELECTABLE_TRANSPORT_STATUSES = TRANSPORT_STATUSES.filter(
  (status) => !PRE_DISPATCH.has(status),
);

/** `{ value, label }` pairs, for AppSelect and the filter dropdowns. */
export const TRANSPORT_STATUS_OPTIONS = SELECTABLE_TRANSPORT_STATUSES.map(
  (value) => ({ value, label: transportStatusLabel(value) }),
);
