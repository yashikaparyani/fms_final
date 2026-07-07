const mongoose = require("mongoose");
const Counter = require("./Counter.model.js");

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
    deliveryType: {
      type: String,
      enum: ["ROUNDED", "SINGLE"],
      default: "ROUNDED",
    },

    singleType: {
      type: String,
      enum: ["Pick Up", "Delivery", "Drop"],
      default: "Pick Up",
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

    material: {
      type: String,
      required: true,
    },

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
          ],
          required: true,
        },
        fileName: String,
        filePath: String,
        dateReceived: { type: Date, default: Date.now },
      },
    ],

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

    pickedUpAt: Date,
    pickedUpCity: String,
    pickedUpState: String,

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

    bids: [],
    bidAcceptanceEmailSentAt: Date,
    completedAt: Date,
    staffRating: {
      score: { type: Number, min: 1, max: 5 },
      remark: String,
      ratedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      ratedAt: Date,
    },
  },

  { timestamps: true },
);

// ===================== AUTO LOAD ID =====================
loadSchema.pre("save", async function () {
  if (this.loadId) return; // already set

  const counter = await Counter.findByIdAndUpdate(
    "load", // counter name/key
    { $inc: { seq: 1 } }, // atomically increment
    { returnDocument: "after", upsert: true }, // create if doesn't exist
  );

  // Zero-pad to 4 digits: 1 → "0001", 42 → "0042", 1000 → "1000"
  this.loadId = `LD-${String(counter.seq).padStart(4, "0")}`;
});

// ===================== EXPORT =====================
const Load = mongoose.model("Load", loadSchema);
module.exports = Load;
