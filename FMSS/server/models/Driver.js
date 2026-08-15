const mongoose = require("mongoose");
const tenantScope = require("../plugins/tenantScope");
const { nextSequence } = require("../utils/sequence");

// ─── Driver ───────────────────────────────────────────────────────────────────
// A person who drives for a carrier. Added by the fleet owner themselves, not by
// the back office: the carrier is the only party who knows who is on the truck
// this week.
//
// Two records per driver, deliberately:
//
//   Driver  — the operational record: licence, phone, which carrier, active or
//             not. Lives per location like everything else the carrier owns.
//   User    — the *sub-account*, role "driver", `parentAccount` pointing at the
//             fleet owner's user. Only created when the driver is given a login.
//
// They are split because plenty of drivers never need an app account (a carrier
// running two trucks updates statuses themselves), and a record with a dangling
// unusable login is worse than no login. `userId` is therefore optional, and
// `hasLogin` is what the UI shows.
// ─────────────────────────────────────────────────────────────────────────────

const driverSchema = new mongoose.Schema(
  {
    // The carrier this driver runs for. Every driver has exactly one.
    fleetOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FleetOwner",
      required: true,
      index: true,
    },

    // The sub-account, when one has been issued. Sparse rather than plain unique:
    // drivers without a login all hold null, and those must not collide.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      unique: true,
      sparse: true,
      index: true,
    },

    // Human-readable identity — NY-DR-0001 — issued once on first save from the
    // same per-location counter as loadId and fleetOwnerCode.
    driverCode: { type: String, unique: true, sparse: true, index: true },

    name: {
      type: String,
      required: [true, "Driver name is required"],
      trim: true,
    },

    phone: { type: String, trim: true },

    // Only required when the driver is being given a login — a driver who never
    // signs in does not need one, and inventing a placeholder address would put
    // an unreachable value in the collection that a later mailing would use.
    email: { type: String, trim: true, lowercase: true },

    // ── Licence ──────────────────────────────────────────────────────────────
    // The carrier warrants in both agreements that every driver is "competent
    // and properly licensed" (Brokerage Agreement ¶23), so the licence is
    // collected at onboarding rather than chased later. The scan is what makes
    // that warranty checkable instead of merely asserted.
    licenseNumber: { type: String, trim: true },
    licenseState: { type: String, trim: true, uppercase: true },
    licenseClass: {
      type: String,
      trim: true,
      uppercase: true,
      // Class A is the only one that can pull a container on a chassis, which
      // is nearly all the work here — but B and C are kept for straight trucks.
      enum: ["A", "B", "C", ""],
      default: "",
    },
    licenseExpiry: Date,
    licenseDocument: {
      fileName: String,
      originalName: String,
      filePath: String,
      mimeType: String,
      size: Number,
      uploadedAt: Date,
    },

    // Hazmat, tanker and doubles/triples change what a driver may be dispatched
    // to, so they are stored as flags rather than buried in free text.
    endorsements: [
      {
        type: String,
        enum: ["H", "N", "T", "P", "S", "X"],
      },
    ],

    // DOT medical certificate — expires on its own schedule, separately from
    // the licence, and an expired one grounds the driver just as hard.
    medicalCardExpiry: Date,

    // ── Pay ──────────────────────────────────────────────────────────────────
    // How this driver is paid, so a load's payroll line can be worked out rather
    // than typed in every time. The rate is read at the moment a load is
    // calculated and then STORED on that load — see Load.accounting.payroll —
    // so raising a driver's percentage next month does not silently rewrite
    // what they were already paid for last month's runs.
    payType: {
      type: String,
      enum: ["PERCENTAGE", "FLAT", "PER_MILE", "HOURLY", ""],
      default: "",
    },

    // Read according to payType: a percentage of the load's revenue, a flat
    // amount per load, dollars per mile, or dollars per hour.
    payRate: { type: Number, default: 0 },

    notes: { type: String, trim: true },

    // Deactivated rather than deleted: a driver's name is stamped on the
    // tracking events and delivery proof of every run they made.
    active: { type: Boolean, default: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// One carrier cannot list the same email twice — that would mean two Driver
// records competing to own one sub-account. Partial so the many drivers with no
// email are not all treated as duplicates of each other.
driverSchema.index(
  { fleetOwner: 1, email: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $type: "string" } },
  },
);

driverSchema.pre("save", async function assignDriverCode() {
  if (this.driverCode) return;

  this.driverCode = await nextSequence("driver", this.locationId);
});

// Per-location data — scoping is enforced centrally, see plugins/tenantScope.js.
driverSchema.plugin(tenantScope, { modelName: "Driver" });

module.exports = mongoose.model("Driver", driverSchema);
