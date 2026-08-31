const tenantScope = require("../plugins/tenantScope");
const crypto = require("crypto");
const mongoose = require("mongoose");
const { nextSequence } = require("../utils/sequence");
const { CHARGE_TYPES, totalsFor } = require("../config/chargeTypes");

// ─── Accounting ledger ────────────────────────────────────────────────────────
// One side of a load's books — receivables or payables — as a list of lines.
//
// Lines rather than a fixed column per charge: "Extra Stops" is genuinely two
// stops on some loads, each with its own note and amount, and a single
// `extraStops: Number` column throws that detail away. It also means adding a
// charge type is one entry in config/chargeTypes.js and no migration.
// ─────────────────────────────────────────────────────────────────────────────

const ledgerLineSchema = new mongoose.Schema(
  {
    chargeType: {
      type: String,
      enum: CHARGE_TYPES.map((c) => c.key),
      required: true,
    },

    amount: { type: Number, default: 0 },

    // Both optional and both display-only — the line's `amount` is the figure
    // that counts. Kept because "3 × $75" is how the charge was agreed, and a
    // bare $225 on an invoice is what triggers the customer's phone call.
    quantity: Number,
    rate: Number,

    note: { type: String, trim: true },

    // Which carrier this line is owed to. Payables only, and only on a load
    // split between carriers — two carriers on one load are owed two different
    // amounts, and a single payable total cannot say who gets what. Left unset
    // on a normal load, where the one carrier owns the whole ledger.
    fleetOwnerId: { type: mongoose.Schema.Types.ObjectId, ref: "FleetOwner" },

    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const ledgerSchema = new mongoose.Schema(
  {
    lines: [ledgerLineSchema],

    currency: { type: String, default: "USD" },

    invoiceNumber: String,
    invoicedAt: Date,
    dueDate: Date,
    paidAt: Date,

    notes: String,

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { _id: false },
);

// Reusable stop shapes for multiple origins (pickups) and destinations (drops).
const pickupStopSchema = new mongoose.Schema(
  {
    addressId: { type: mongoose.Schema.Types.ObjectId, ref: "Address" },
    address: { type: String },
    city: { type: String },
    state: { type: String },
    zip: { type: String },
    company: { type: String },
    poNumber: { type: String },
    pieces: { type: String },
    weight: { type: String },
    pickupDate: { type: Date },
    fromTime: { type: String },
    toTime: { type: String },
    apptGivenBy: { type: String },
    apptNumber: { type: String },
  },
  { _id: false }
);

const dropStopSchema = new mongoose.Schema(
  {
    addressId: { type: mongoose.Schema.Types.ObjectId, ref: "Address" },
    address: { type: String },
    city: { type: String },
    state: { type: String },
    zip: { type: String },
    company: { type: String },
    poNumber: { type: String },
    pieces: { type: String },
    weight: { type: String },
    deliveryDate: { type: Date },
    fromTime: { type: String },
    toTime: { type: String },
    apptGivenBy: { type: String },
    apptNumber: { type: String },
  },
  { _id: false }
);


// ─── Carrier legs ─────────────────────────────────────────────────────────────
// A load can be run by more than one carrier: one takes it from the port to a
// yard, another takes it from the yard to the consignee. Each leg is its own
// piece of work with its own carrier, its own two ends and its own progress,
// which is why this is a list rather than a second fleet-owner field.
//
// `assignedFleetOwner` above stays the primary carrier — the first leg. Every
// screen that predates this (reports, stats, ratings, the bid flow) still reads
// it and still gets a sensible answer on a single-carrier load, which is what
// keeps this change from having to rewrite all of them at once.
// ─────────────────────────────────────────────────────────────────────────────

// One end of a leg. Either a stop already on the load — in which case it was
// picked rather than typed, and `stopIndex` records which — or somewhere that
// exists only for the handover, like a yard the box is dropped at between two
// carriers. Both are stored flat so a leg reads the same either way.
const legPointSchema = new mongoose.Schema(
  {
    source: { type: String, enum: ["STOP", "CUSTOM"], default: "CUSTOM" },
    stopIndex: { type: Number },
    company: { type: String, trim: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    zip: { type: String, trim: true },
  },
  { _id: false },
);

const assignmentSchema = new mongoose.Schema(
  {
    fleetOwnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FleetOwner",
      required: true,
    },
    fleetOwnerName: { type: String },
    fleetOwnerCode: { type: String },

    origin: legPointSchema,
    destination: legPointSchema,

    // This leg's own progress. The load-level transportStatus is rolled up from
    // these — see rollupTransportStatus — so a load is only delivered once the
    // last carrier has delivered, not when the first one drops at the yard.
    transportStatus: { type: String, default: "ASSIGNED" },
    transportStatusHistory: [
      {
        status: String,
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        note: String,
        _id: false,
      },
    ],

    // What this carrier is paid for their leg. Held per leg because two
    // carriers on one load are owed two different amounts, and the load-level
    // vendorRate cannot hold both.
    carrierRate: { type: Number },

    note: { type: String, trim: true },

    assignedAt: { type: Date, default: Date.now },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { _id: true },
);
const loadSchema = new mongoose.Schema(
  {
    // ═══════════════════════════════════════════════════════════
    // SECTION 1 — LOAD IDENTITY
    // ═══════════════════════════════════════════════════════════
    loadId: {
      type: String,
      unique: true,
    },

    createdBy: {
      type: String,
      required: true,
    },

    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    refNo: String,

    // ═══════════════════════════════════════════════════════════
    // SECTION 2 — LOAD DETAILS (created by client)
    // ═══════════════════════════════════════════════════════════
    // Every load is a single move now. "ROUNDED" is legacy — a rounded trip is
    // expressed as a Drop, which carries the same two-container move — but the
    // value stays in the enum so loads created before the change still
    // validate when they are saved again.
    deliveryType: {
      type: String,
      enum: ["SINGLE", "ROUNDED"],
      default: "SINGLE",
    },

    // The move type. "Pick Up" and "Delivery" are legacy values, kept for the
    // same reason as ROUNDED above; the load form offers only Drop and Pick.
    singleType: {
      type: String,
      enum: ["Drop", "Pick", "Pick Up", "Delivery"],
      default: "Pick",
    },

    truckType: {
      type: String,
      enum: [
        "Container",
        "Flatbed",
        "Reefer",
        "Van",
        "Dry Van",
        "Open Truck",
        "Refrigerated",
        "Other",
      ],
      required: true,
    },

    driverRequirement: {
      type: String,
      enum: ["Solo Driver", "Team Driver"],
      default: "Solo Driver",
    },

    // ─── Who is actually driving it ─────────────────────────────────────────
    // The load is awarded to a carrier; the carrier then says which of their
    // drivers runs it. More than one is normal — a long move is handed over
    // partway, so each driver has their own leg with its own pickup and its own
    // destination rather than sharing the load's.
    //
    // Deliberately NOT surfaced to the customer. The office and the customer
    // deal with the carrier's account person, and a customer-facing screen that
    // named three drivers would invite them to ring one directly. See
    // `accountPersonFor` in utils/carrierAccount.js — the assigned section shows
    // the account person, never these names.
    driverAssignments: [
      new mongoose.Schema(
        {
          driver: { type: mongoose.Schema.Types.ObjectId, ref: "Driver", required: true },

          // Which carrier put this driver on the load. A load can be split
          // between carriers, and each of them names their own drivers — without
          // this there is no way to tell one carrier's drivers from another's,
          // and no way for one carrier to edit their own without touching the
          // other's.
          fleetOwnerId: { type: mongoose.Schema.Types.ObjectId, ref: "FleetOwner" },
          // Denormalised so a historical assignment still reads correctly after
          // a driver is renamed or taken off the roster.
          driverName: { type: String, trim: true },
          driverCode: { type: String, trim: true },

          // This driver's own leg. Free-form rather than pointing at the load's
          // stops: a handover happens at a yard or a truck stop that is nobody's
          // consignee and appears nowhere on the load.
          pickup: {
            address: { type: String, trim: true },
            city: { type: String, trim: true },
            state: { type: String, trim: true },
            zip: { type: String, trim: true },
          },
          drop: {
            address: { type: String, trim: true },
            city: { type: String, trim: true },
            state: { type: String, trim: true },
            zip: { type: String, trim: true },
          },

          note: { type: String, trim: true },
          assignedAt: { type: Date, default: Date.now },
          assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        },
        { _id: false },
      ),
    ],

    material: {
      type: String,
      required: true,
    },

    // The customer's name as it stood when the load was created.
    //
    // Denormalised on purpose: the load board, the POD, every report and the
    // driver app all show it, and joining back to the customer on each of those
    // to print a name is work with no upside. It also means a load stays
    // readable after a customer record is renamed or removed.
    //
    // Declared here because it was not: createLoad has always set it and the UI
    // has always read it, but with no path on the schema Mongoose's strict mode
    // dropped it on every save — so the column has been silently blank.
    customerName: String,

    amount: {
      type: Number,
      required: true,
    },

    description: String,
    remarks: String,

    hazmat: { type: Boolean, default: false },
    chassisRent: { type: Boolean, default: false },
    railContainer: { type: Boolean, default: false },
    dryVan: { type: Boolean, default: false },
    reefer: { type: Boolean, default: false },
    bookingProblem: { type: Boolean, default: false },
    putOnHold: { type: Boolean, default: false },
    hotShipment: { type: Boolean, default: false },
    isAccessorialCharges: { type: Boolean, default: false },
    isUrgent: { type: Boolean, default: false },

    containerType: {
      type: String,
      enum: ["40 Std", "40 HC", "45", "20", ""],
    },

    commodity: {
      type: String,
      enum: ["Chilled", "Dry", "Other", "Produce", "Frozen", ""],
    },

    bookingNo: String,
    shippingLine: String,
    containerNo: String,
    chassisNo: String,
    // A Drop moves two containers — one dropped, one taken away — so it carries
    // a second container and chassis number. Blank on a Pick.
    containerNo2: String,
    chassisNo2: String,
    // Name from the ChassisCompany master, stored as a string so master edits
    // never mutate historical loads.
    chassisCompany: String,
    pickupNo: String,
    sealNo: String,

    lastFreeDate: Date,
    orderBillDate: Date,

    accChargesEmail: String,
    podEmail: String,
    deliveryEmail: String,
    billingEmail: String,

    // ═══════════════════════════════════════════════════════════
    // SECTION 3A — ROUTING DETAILS
    // ═══════════════════════════════════════════════════════════
    pierTermination: String, // e.g., "EVERGREEN SHIPPING AGENCY CORP"
    emptyReturn: String,
    contactPersons: [{
      name: String,
      phone: String,
      email: String,
    }],

    // ═══════════════════════════════════════════════════════════
    // SECTION 3 — PICKUP & DROP ADDRESS
    // ═══════════════════════════════════════════════════════════
    adressAdded: {
      type: Boolean,
      default: false,
    },

    pickup: {
      addressId: { type: mongoose.Schema.Types.ObjectId, ref: "Address" },
      address: { type: String },
      city: { type: String },
      state: { type: String },
      zip: { type: String },
      company: { type: String },
      poNumber: { type: String },
      pieces: { type: String },
      weight: { type: String },
      pickupDate: { type: Date },
      fromTime: { type: String },
      toTime: { type: String },
      apptGivenBy: { type: String },
      apptNumber: { type: String },
    },

    drop: {
      addressId: { type: mongoose.Schema.Types.ObjectId, ref: "Address" },
      address: { type: String },
      city: { type: String },
      state: { type: String },
      zip: { type: String },
      company: { type: String },
      poNumber: { type: String },
      pieces: { type: String },
      weight: { type: String },
      deliveryDate: { type: Date },
      fromTime: { type: String },
      toTime: { type: String },
      apptGivenBy: { type: String },
      apptNumber: { type: String },
    },

    // Multiple origins / destinations. The single `pickup`/`drop` above are
    // kept in sync with the first element of each for backward compatibility.
    pickups: { type: [pickupStopSchema], default: undefined },
    drops: { type: [dropStopSchema], default: undefined },

    // ═══════════════════════════════════════════════════════════
    // SECTION 4 — LOAD VERIFICATION STATUS (set by staff/admin)
    // ═══════════════════════════════════════════════════════════
    status: {
      type: String,
      enum: [
        "DRAFT",
        "PENDING_VERIFICATION",
        "REQUIRES_CHANGES",
        "VERIFIED",
        "ASSIGNED",
        "REJECTED",
      ],
      default: "PENDING_VERIFICATION",
    },

    changesNote: { type: String }, // populated when status = REQUIRES_CHANGES

    documents: [
      {
        documentType: {
          type: String,
          enum: [
            "Bare Chassis In-Gate/Out-Gate",
            "Bill Of Lading",
            "Out-Gate Interchange",
            "In-Gate Interchange",
            "Proof of Delivery",
            "Scale Ticket",
            "Lumper Receipt",
            "Misc.",
            "Carrier Invoice",
            // Office-side paperwork. Deliberately kept out of the driver app —
            // see DRIVER_HIDDEN_DOCUMENT_TYPES in mobile/App.js.
            "Load Document",
          ],
          required: true,
        },
        fileName: String,
        filePath: String,
        dateReceived: { type: Date, default: Date.now },
      },
    ],

    // ═══════════════════════════════════════════════════════════
    // SECTION 4b — HOW THIS LOAD FINDS A CARRIER
    //
    // Two routes, chosen by whoever posts the load:
    //
    //   BID     — the original flow. The office verifies it, schedules a bid
    //             window, carriers bid, a winner is awarded.
    //   INSTANT — the load is offered straight to the carriers whose drivers
    //             are already near the pickup. The first to accept has it, and
    //             from that point it runs exactly like any other assigned load.
    //
    // Defaulted to BID so every load that predates this section, and every load
    // posted by anything that has not learned about the choice, behaves as it
    // always did.
    // ═══════════════════════════════════════════════════════════
    dispatchMode: {
      type: String,
      enum: ["BID", "INSTANT"],
      default: "BID",
      index: true,
    },

    instantDispatch: {
      requestedAt: Date,
      requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

      // The settings this request actually ran under, copied rather than read
      // back live. Somebody widening the house radius next month must not
      // change the answer to "who was asked about this load".
      radiusMiles: Number,
      positionMaxAgeHours: Number,

      // Where we searched from — the pickup's pinned coordinates.
      origin: {
        latitude: Number,
        longitude: Number,
      },

      // After this, no carrier can accept and the load falls back to bidding.
      expiresAt: Date,

      // Deliberately no default. A default here would be applied to every load
      // Mongoose ever creates, so a plain bid load would read as having a
      // pending offer out — untrue, and exactly the kind of thing a later query
      // that forgets to also filter on dispatchMode would act on. The status is
      // written when a request is actually made.
      status: {
        type: String,
        enum: ["PENDING", "ACCEPTED", "EXPIRED", "CANCELLED"],
        index: true,
      },

      // Every carrier the load was offered to, whether or not they answered.
      // Kept so "nobody was near" and "six carriers ignored it" are different
      // answers — they call for different things being done about it.
      offers: [
        new mongoose.Schema(
          {
            fleetOwnerId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "FleetOwner",
              required: true,
            },
            fleetOwnerName: String,
            // The nearest driver this carrier had to the pickup, which is the
            // truck they would most likely send. Not a commitment — the carrier
            // assigns whoever they want once they accept.
            driverId: { type: mongoose.Schema.Types.ObjectId, ref: "Driver" },
            driverName: String,
            distanceMiles: Number,
            // How stale that position was when we used it.
            positionRecordedAt: Date,

            notifiedAt: { type: Date, default: Date.now },
            // One row per channel attempted, so a bounced email is visible
            // rather than silently lost — the same shape street turn
            // notifications use.
            channels: [
              {
                channel: String, // "in-app" | "email" | "push"
                sent: Boolean,
                reason: String,
                _id: false,
              },
            ],

            response: {
              type: String,
              enum: ["PENDING", "ACCEPTED", "DECLINED"],
              default: "PENDING",
            },
            respondedAt: Date,
            declineReason: String,
          },
          { _id: false },
        ),
      ],

      // Who took it. Written by the accept endpoint under a conditional update
      // so two carriers accepting at the same moment cannot both win — see
      // controllers/instantDispatchController.js.
      acceptedBy: {
        fleetOwnerId: { type: mongoose.Schema.Types.ObjectId, ref: "FleetOwner" },
        fleetOwnerName: String,
        acceptedAt: Date,
        acceptedByUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      },

      // Stamped when the window closed with nobody having taken it and the load
      // was handed to the ordinary bid flow.
      fellBackAt: Date,
    },

    // ═══════════════════════════════════════════════════════════
    // SECTION 4c — WHAT THE BROKER KEEPS
    //
    // On an instant-dispatch load the customer names the price and the broker
    // takes a percentage. The carrier is offered, accepts and is paid the
    // remainder, and never sees the customer's figure.
    //
    // The rate is stamped here when the request goes out and read from here
    // forever after. A load agreed at 20% stays a load agreed at 20% after
    // somebody changes the house rate — a rate change is not a licence to
    // rewrite what a carrier already accepted.
    // ═══════════════════════════════════════════════════════════
    commission: {
      customerAmount: Number,
      commissionPercent: Number,
      commissionAmount: Number,
      carrierAmount: Number,
      stampedAt: Date,
    },

    // ═══════════════════════════════════════════════════════════
    // SECTION 5 — BID SCHEDULE (set by staff/admin after VERIFIED)
    // ═══════════════════════════════════════════════════════════
    bidStatus: {
      type: String,
      enum: ["UPCOMING", "OPEN", "CLOSED"],
      default: "UPCOMING",
    },

    bidStartTime: Date,
    bidEndTime: Date,

    // ✅ RATE & MARGIN (set by staff when scheduling bid)
    targetRate: Number, // Rate defined by staff/admin
    margin: Number, // Vendor margin to apply
    vendorRate: Number, // Calculated: targetRate + margin (for display to vendors)

    // ═══════════════════════════════════════════════════════════
    // SECTION 6 — BID RESULT (auto-set when bidding window closes)
    // ═══════════════════════════════════════════════════════════
    winningBid: {
      id: mongoose.Schema.Types.ObjectId,
      fleetOwnerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "FleetOwner",
      },
      fleetOwnerName: String,
      amount: Number,
      submittedAt: Date,
    },

    // Tracks whether the bid-acceptance email has been sent to the winner
    // (set by the manual "Send Bid Acceptance Mail" button or the cron safety-net)
    acceptanceMailSent: { type: Boolean, default: false },
    acceptanceMailSentAt: { type: Date },

    // ═══════════════════════════════════════════════════════════
    // SECTION 7 — FLEET OWNER ASSIGNMENT (auto-assign from top bid)
    // ═══════════════════════════════════════════════════════════
    assignedFleetOwner: {
      fleetOwnerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "FleetOwner",
      },
      fleetOwnerName: { type: String },
      assignedAt: { type: Date },
    },

    // Every carrier on this load, in the order they run it. Empty or absent on
    // a single-carrier load — assignedFleetOwner alone still describes those,
    // so nothing that predates legs has to learn about them.
    assignments: { type: [assignmentSchema], default: undefined },

    // ═══════════════════════════════════════════════════════════
    // SECTION 8 — TRANSPORT STATUS (updated after fleet owner confirms)
    // ═══════════════════════════════════════════════════════════
    transportStatus: {
      type: String,
      enum: [
        "LOAD_PLANNER",
        "NEW_LOAD",
        "ASSIGNED", // auto-set on assignment
        "READY_TO_PICKUP", // set when fleet owner confirms
        "PICKED_UP",
        "IN_TRANSIT",
        "REACHED_DESTINATION",
        "DELIVERED",
        "TERMINATED",
        "PAPERWORK_PENDING",
        "INVOICED",
        "STREET_TURN",
        "EMPTY_IN_YARD",
        "LOADED_IN_YARD",
        "DRIVER_ON_WAITING",
        "DROP_IN_WAREHOUSE",
      ],
      default: "NEW_LOAD",
    },

    // ═══════════════════════════════════════════════════════════
    // DOCUMENTATION COMPLETION
    // Stamped once every driver-uploadable document type is present on the
    // load. A completed load drops out of the phone app entirely — the office
    // still sees it on the web.
    // ═══════════════════════════════════════════════════════════
    documentation: {
      completedAt: Date,
      completedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },

    // ═══════════════════════════════════════════════════════════
    // STREET TURN CONFIRMATION
    // Captured from the confirmation box when transportStatus is set to
    // STREET_TURN. The three party names are copies of the master values at
    // confirmation time, so later master edits never rewrite what was agreed.
    // ═══════════════════════════════════════════════════════════
    streetTurn: {
      deliveryPartner: String,
      deliveryPartnerEmail: String,
      shippingLine: String,
      shippingLineEmail: String,
      chassisCompany: String,
      chassisCompanyEmail: String,
      note: String,
      confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      confirmedAt: Date,

      // ── Transfer agreement particulars ─────────────────────────────────
      // The blanks on the Street Turn Container and Chassis Transfer Agreement
      // (config/streetTurnAgreement.js). Stored on the load rather than derived
      // at send time so the emailed copy and the signed copy always state the
      // same thing, even after the load itself moves on.
      transfereeScac: String,
      transferLocation: String, // where the box is handed over
      returnLocation: String, // where the transferee returns it
      // "None" unless the driver notes damage. The agreement is explicit that
      // the equipment is accepted as-is except for what is written here, so an
      // empty value and "None" must not be confused — default it at capture.
      equipmentCondition: String,
      governingLawState: String,
      // One entry per recipient the confirmation email was attempted for, so
      // a failed send is visible rather than silently lost.
      notifications: [
        {
          party: String, // "Street Turn Partner" | "Shipping Line" | "Driver" | ...
          email: String,
          sent: Boolean,
          reason: String,
          attemptedAt: { type: Date, default: Date.now },
        },
      ],

      // ── The partner's signature back ───────────────────────────────────
      // Confirming a street turn tells the partner it is happening; it does not
      // prove they accepted the container. They sign from a one-off emailed
      // link, so they have no account here and the token is the authorisation.
      // Only the hash is stored, exactly as the insurance agent's link is
      // handled — see CarrierOnboarding.issueInsuranceToken.
      confirmationTokenHash: { type: String, select: false },
      confirmationTokenExpiresAt: Date,

      partnerSignature: {
        signedName: String,
        signedTitle: String,
        company: String,
        // Data-URL of the drawn signature, as the POD and agreement flows do.
        signatureData: String,
        signedAt: Date,
        note: String,
        // What makes this an execution record rather than a form: a dispute is
        // answered with where and when the signature came from.
        signedIp: String,
        signedUserAgent: String,
      },
    },

    pickedUpAt: Date,
    pickedUpCity: String,
    pickedUpState: String,

    // ─── Who actually took the delivery ─────────────────────────────────────
    // The signature on the POD proves somebody signed; it does not say who, and
    // a scrawl six weeks later is not a name anybody can act on. This is the
    // name the driver is asked for at the door, printed under RECEIVED BY on
    // the POD beside the signature — so a customer disputing a delivery is
    // answered with a person rather than a mark.
    receivedBy: {
      name: { type: String, trim: true },
      // Free text on purpose: "warehouse supervisor", "night receiver". The
      // driver is asked who they handed it to, not to classify them.
      title: { type: String, trim: true },
      capturedAt: Date,
    },

    deliveredAt: Date,
    deliveredCity: String,
    deliveredState: String,

    transportStatusHistory: [
      {
        status: {
          type: String,
          enum: [
            "LOAD_PLANNER",
            "NEW_LOAD",
            "ASSIGNED",
            "READY_TO_PICKUP",
            "PICKED_UP",
            "IN_TRANSIT",
            "REACHED_DESTINATION",
            "DELIVERED",
            "TERMINATED",
            "PAPERWORK_PENDING",
            "INVOICED",
            "STREET_TURN",
            "EMPTY_IN_YARD",
            "LOADED_IN_YARD",
            "DRIVER_ON_WAITING",
            "DROP_IN_WAREHOUSE",
          ],
        },
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        note: String,
        location: {
          latitude: Number,
          longitude: Number,
          address: String,
        },
      },
    ],

    liveTracking: {
      status: {
        type: String,
        enum: ["NOT_STARTED", "ACTIVE", "PAUSED", "STOPPED"],
        default: "NOT_STARTED",
      },
      isRequired: { type: Boolean, default: false },

      // Whose trip this is. Live tracking follows a driver, never a carrier —
      // the carrier is a company and companies do not have a position. Set when
      // a driver account starts the trip.
      driver: { type: mongoose.Schema.Types.ObjectId, ref: "Driver" },
      driverName: { type: String, trim: true },
      startedAt: Date,
      startedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      stoppedAt: Date,
      stoppedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      lastHeartbeatAt: Date,
      consent: {
        grantedAt: Date,
        platform: String,
      },
      lastLocation: {
        latitude: Number,
        longitude: Number,
        accuracy: Number,
        altitude: Number,
        heading: Number,
        speed: Number,
        recordedAt: Date,
        source: String,
      },
    },

    pickupProof: {
      images: [
        {
          fileName: String,
          filePath: String,
          uploadedAt: Date,
        },
      ],
      location: {
        latitude: Number,
        longitude: Number,
      },
      submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      submittedAt: Date,
    },

    // ─── Proof of delivery photo ────────────────────────────────────────────
    // The container actually being dropped, photographed at the warehouse.
    // Required before a driver can complete a delivery — the signature alone
    // proves somebody signed, not that the box was put where it was meant to go,
    // and that is the gap a customer disputes weeks later.
    //
    // Same shape as pickupProof so the two read the same way on screen.
    deliveryProof: {
      images: [
        {
          fileName: String,
          filePath: String,
          uploadedAt: Date,
        },
      ],
      location: {
        latitude: Number,
        longitude: Number,
      },
      submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      submittedAt: Date,
    },

    bids: [],
    bidAcceptanceEmailSentAt: Date,
    completedAt: Date,
    staffRating: {
      score: { type: Number, min: 1, max: 5 },
      remark: String,
      ratedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      ratedAt: Date,
    },

    // ═══════════════════════════════════════════════════════════
    // SECTION 9 — ACCOUNTING
    // ═══════════════════════════════════════════════════════════
    // What the customer is billed (receivables) against what the carrier and
    // vendors are paid (payables), line by line, so every load carries its own
    // profit and loss.
    //
    // The line kinds and why an advance must never be summed into a total are
    // explained in config/chargeTypes.js — that file is the authority on the
    // arithmetic, and everything here defers to it.
    //
    // `amount` above stays the load's headline figure and is kept in step with
    // the receivables total by the pre-save hook below, so every existing screen
    // that reads `amount` keeps working without knowing this section exists.
    accounting: {
      receivables: ledgerSchema,
      payables: ledgerSchema,

      // Driver pay for this load. Computed from the driver's own rate — see
      // controllers/accountingController.js — but stored, because a rate change
      // next month must not silently rewrite what somebody was already paid.
      payroll: {
        driver: { type: mongoose.Schema.Types.ObjectId, ref: "Driver" },
        driverName: String,
        payType: {
          type: String,
          enum: ["PERCENTAGE", "FLAT", "PER_MILE", "HOURLY", ""],
          default: "",
        },
        rate: Number,
        miles: Number,
        hours: Number,
        // What the rate worked out to. Held rather than derived on read so a
        // settled driver payment is a record, not a recalculation.
        amount: Number,
        calculatedAt: Date,
        calculatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        note: String,
        settledAt: Date,
      },
    },
  },

  { timestamps: true },
);

// ===================== AUTO LOAD ID =====================
// "LD 0001" — no branch code. Unlike a carrier or a driver code, a load number
// is read aloud dozens of times a day, so it is kept as short as it can be
// while staying unique; the branch a load belongs to is on the load itself
// (locationId) for anyone who needs it. Numbering therefore comes from one
// business-wide counter — see utils/sequence.js.
loadSchema.pre("save", async function () {
  if (this.loadId) return; // already set

  this.loadId = await nextSequence("load", this.locationId);
});

// ===================== BASE AMOUNT FOLLOWS THE RECEIVABLES =====================
// `amount` predates the accounting section and is read by the load table, the
// bid screens, the dashboards and the POD. Once a load has receivable lines,
// that headline figure IS the receivables total — the two disagreeing is how a
// load shows $1,200 on the board and invoices at $1,475.
//
// Only ever recomputed when there are lines to recompute from: a load created
// before this section existed, or one where the amount was simply typed in,
// keeps the number it was given.
loadSchema.pre("save", function syncAmountWithReceivables() {
  const lines = this.accounting?.receivables?.lines;
  if (!lines?.length) return;

  this.amount = totalsFor(lines).total;
});


// ─── Carrier legs ─────────────────────────────────────────────────────────────

/** True once this load is being run by named carrier legs rather than one carrier. */
loadSchema.methods.hasLegs = function () {
  return Array.isArray(this.assignments) && this.assignments.length > 0;
};

/**
 * True once somebody is actually carrying this load.
 *
 * Either the primary carrier is set, or the load has been split into legs and
 * each leg names its own. Transport status hangs off this: every value it can
 * take — ready to pick up, picked up, in transit — is a report about a carrier
 * doing something, so there is nothing truthful to say until there is a carrier
 * to say it about. See the gate in controllers/loadController.js.
 */
loadSchema.methods.hasCarrier = function () {
  return Boolean(this.assignedFleetOwner?.fleetOwnerId) || this.hasLegs();
};

/**
 * The leg belonging to a carrier, or null.
 *
 * A carrier can hold more than one leg of the same load (out and back), in
 * which case the earliest unfinished one is theirs to work on — that is the leg
 * their driver is being asked about.
 */
loadSchema.methods.legFor = function (fleetOwnerId) {
  if (!fleetOwnerId || !this.hasLegs()) return null;
  const wanted = String(fleetOwnerId);

  const theirs = this.assignments.filter(
    (leg) => String(leg.fleetOwnerId) === wanted,
  );
  if (!theirs.length) return null;

  return theirs.find((leg) => !LEG_FINISHED.includes(leg.transportStatus)) || theirs[0];
};

// How far along a leg is. Only the moving statuses are ranked — anything else
// (street turn, terminated, yard states) is off the main line and is treated as
// finished rather than as a position on it.
const LEG_ORDER = [
  "ASSIGNED",
  "READY_TO_PICKUP",
  "PICKED_UP",
  "IN_TRANSIT",
  "REACHED_DESTINATION",
  "DELIVERED",
];

const LEG_FINISHED = ["DELIVERED", "TERMINATED", "STREET_TURN", "EMPTY_IN_YARD"];

/**
 * Re-derive the load-level transportStatus from its legs.
 *
 * The load is only as far along as its *least* advanced leg: a box the first
 * carrier has dropped at the yard is not delivered, and showing it as delivered
 * because one leg finished would close it out while it is still sitting there.
 *
 * Legs off the main line are skipped when something is still running, so one
 * terminated leg does not hold the whole load at TERMINATED — but a load whose
 * legs have all finished takes the last one's outcome, which is what puts a
 * fully delivered load in the Over tab.
 */
loadSchema.methods.rollupTransportStatus = function () {
  if (!this.hasLegs()) return this.transportStatus;

  const running = this.assignments.filter(
    (leg) => !LEG_FINISHED.includes(leg.transportStatus),
  );

  if (running.length) {
    this.transportStatus = running.reduce((least, leg) => {
      const a = LEG_ORDER.indexOf(least.transportStatus);
      const b = LEG_ORDER.indexOf(leg.transportStatus);
      if (a === -1) return leg;
      if (b === -1) return least;
      return b < a ? leg : least;
    }).transportStatus;
  } else {
    this.transportStatus =
      this.assignments[this.assignments.length - 1].transportStatus;
  }

  return this.transportStatus;
};

/**
 * Mints the link the street turn partner signs from.
 *
 * Returns the plaintext token exactly once — it is emailed and never stored, so
 * a leaked database cannot be used to sign on a partner's behalf. Re-issuing
 * invalidates the previous link.
 */
loadSchema.methods.issueStreetTurnToken = function issueStreetTurnToken({ days = 14 } = {}) {
  const token = crypto.randomBytes(32).toString("hex");

  this.streetTurn = this.streetTurn || {};
  this.streetTurn.confirmationTokenHash = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
  this.streetTurn.confirmationTokenExpiresAt = new Date(
    Date.now() + days * 24 * 60 * 60 * 1000,
  );

  return token;
};

/** The stored form of a token presented by a partner, for lookup. */
loadSchema.statics.hashStreetTurnToken = (token) =>
  crypto.createHash("sha256").update(String(token)).digest("hex");

loadSchema.statics.LEG_ORDER = LEG_ORDER;
loadSchema.statics.LEG_FINISHED = LEG_FINISHED;
// Per-location data — scoping is enforced centrally, see plugins/tenantScope.js.
// Must be applied BEFORE mongoose.model(): compiling the schema freezes its
// hooks and paths, and a plugin added afterwards is silently ignored.
loadSchema.plugin(tenantScope, { modelName: "Load" });

// ===================== EXPORT =====================
const Load = mongoose.model("Load", loadSchema);

module.exports = Load;
