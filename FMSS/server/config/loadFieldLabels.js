// ─── What a load's fields are called, and which ones are worth logging ────────
// The audit trail records field edits, and a trail that says
// `accChargesEmail: null → ""` is noise that buries the one line somebody
// actually needed to find. This file decides two things:
//
//   · TRACKED — which fields a change is worth recording at all.
//   · LABELS  — what to call them in a sentence a dispatcher can read.
//
// Everything not listed in TRACKED is ignored. An allow-list rather than a
// deny-list, deliberately: a field added later is silently untracked, which is a
// gap somebody notices and fixes, whereas a deny-list silently starts logging
// internal bookkeeping the day it is added and drowns the trail.
// ─────────────────────────────────────────────────────────────────────────────

const LABELS = {
  // Identity and commercial
  refNo: "Reference #",
  bookingNo: "Booking #",
  amount: "Base Amount",
  customer: "Customer",
  customerName: "Customer",

  // Equipment
  truckType: "Load Type",
  singleType: "Move Type",
  deliveryType: "Delivery Type",
  containerType: "Container Type",
  containerNo: "Container #",
  containerNo2: "Container #2",
  chassisNo: "Chassis #",
  chassisNo2: "Chassis #2",
  sealNo: "Seal #",
  pickupNo: "Pickup #",
  material: "Material",
  commodity: "Commodity",
  shippingLine: "Shipping Line",

  // Dates
  lastFreeDate: "Last Free Date",
  orderBillDate: "Order/Bill Date",

  // Flags that change how a load is handled
  hazmat: "Hazmat",
  chassisRent: "Chassis Rent",
  railContainer: "Rail Container",
  dryVan: "Dry Van",
  reefer: "Reefer",
  isUrgent: "Urgent",
  hotShipment: "Hot Shipment",
  putOnHold: "On Hold",
  bookingProblem: "Booking Problem",
  isAccessorialCharges: "Accessorial Charges",

  // Status
  status: "Verification Status",
  transportStatus: "Transport Status",
  bidStatus: "Bid Status",

  // Routing — the nested ones are flattened to these paths before comparison.
  "pickup.company": "Pickup Company",
  "pickup.address": "Pickup Address",
  "pickup.city": "Pickup City",
  "pickup.state": "Pickup State",
  "pickup.zip": "Pickup ZIP",
  "pickup.pickupDate": "Pickup Date",
  "pickup.fromTime": "Pickup From",
  "pickup.toTime": "Pickup To",
  "drop.company": "Delivery Company",
  "drop.address": "Delivery Address",
  "drop.city": "Delivery City",
  "drop.state": "Delivery State",
  "drop.zip": "Delivery ZIP",
  "drop.deliveryDate": "Delivery Date",
  "drop.fromTime": "Delivery From",
  "drop.toTime": "Delivery To",

  // Contact
  accChargesEmail: "Accessorial Charges Email",
  podEmail: "POD Email",
  deliveryEmail: "Delivery Email",
  billingEmail: "Billing Email",

  // Notes carried on the load itself
  description: "Description",
  remarks: "Remarks",
  changesNote: "Changes Requested",

  // Assignment
  "assignedFleetOwner.fleetOwnerName": "Assigned Carrier",

  // Bidding window
  bidStartTime: "Bid Opens",
  bidEndTime: "Bid Closes",
};

/**
 * The fields a change is recorded for.
 *
 * Derived from LABELS rather than listed twice — a field worth naming in the
 * trail is exactly a field worth logging, and keeping two lists in step by hand
 * is how one of them ends up wrong.
 */
const TRACKED = Object.keys(LABELS);

const TRACKED_SET = new Set(TRACKED);

/**
 * Paths that are flattened one level before comparison.
 *
 * `pickup` is an object with a dozen keys. Comparing it whole gives
 * "Pickup changed" with two JSON blobs, which nobody can read; comparing the
 * leaves gives "Pickup City: Long Beach → Oakland", which is the answer.
 */
const FLATTENED = ["pickup", "drop", "assignedFleetOwner"];

const labelFor = (field) => LABELS[field] || field;

// Fields whose values are dates — formatted rather than printed as an ISO
// string, since "2026-03-14T00:00:00.000Z" in a sentence is not a date to a
// person reading it.
const DATE_FIELDS = new Set([
  "lastFreeDate",
  "orderBillDate",
  "bidStartTime",
  "bidEndTime",
  "pickup.pickupDate",
  "drop.deliveryDate",
]);

const BOOLEAN_FIELDS = new Set([
  "hazmat",
  "chassisRent",
  "railContainer",
  "dryVan",
  "reefer",
  "isUrgent",
  "hotShipment",
  "putOnHold",
  "bookingProblem",
  "isAccessorialCharges",
]);

module.exports = {
  LABELS,
  TRACKED,
  TRACKED_SET,
  FLATTENED,
  DATE_FIELDS,
  BOOLEAN_FIELDS,
  labelFor,
};
