const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { sanitizePermissions } = require("../config/permissions");

const userSchema = new mongoose.Schema(
  {
    firstName: String,
    lastName: String,

    email: {
      type: String,
      required: true,
      unique: true,
    },

    password: {
      type: String,
      required: false,
      select: false,
    },

    role: {
      type: String,
      // `driver` is a sub-account of a `fleetOwner`: a carrier adds their drivers
      // and each gets their own login for the mobile app, so pickup/delivery
      // updates and GPS carry the name of the person who actually did the run
      // rather than the carrier's single shared account.
      enum: ["admin", "staff", "client", "fleetOwner", "driver"],
      required: true,
    },

    phone: String,

    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },

    lastLogin: Date,

    timezone: {
      type: String,
      default: "Asia/Kolkata",
      enum: ["Asia/Kolkata", "UTC", "America/New_York"],
    },

    // ── Module permissions ───────────────────────────────────────────────────
    // Flat "<module>.<action>" keys drawn from config/permissions.js — see the
    // note there for why this is a string list rather than a boolean schema.
    //
    // Only meaningful for `staff`. Admins bypass every check by role, and the
    // portal roles (client, fleetOwner, driver) are bounded by their own routes.
    permissions: {
      type: [String],
      default: [],
    },

    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    addedByName: String,

    // ── Location membership ──────────────────────────────────────────────────
    // Which branches this user may work in. A staff member can hold several —
    // shared back-office teams cover more than one — and switches between them
    // in the UI. Admins are not listed here: they reach every branch by role.
    //
    // Clients and fleet owners carry exactly one, the branch they belong to.
    locations: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Branch",
        index: true,
      },
    ],

    // Which of `locations` to open on sign-in. Falls back to the first entry.
    defaultLocation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
    },

    // ── Sub-accounts ─────────────────────────────────────────────────────────
    // Set on a `driver`: the fleet-owner user whose carrier they drive for.
    // Every carrier-scoped lookup a driver makes resolves through this rather
    // than through their own id — see utils/carrierAccount.js — so a driver sees
    // exactly the loads their carrier was assigned and nothing else.
    parentAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
  },
  { timestamps: true }
);

// ─── Password hashing ─────────────────────────────────────────────────────────
// Guarded so it is idempotent: several controllers bcrypt the password
// themselves before calling create(), and re-hashing an already-hashed value
// would produce an account nobody can sign in to. Anything handed a plaintext
// password (a credential reset, a seed script) gets hashed here instead of
// silently storing it in the clear.
const BCRYPT_HASH = /^\$2[abxy]\$\d{2}\$/;

// Returns rather than calling `next`: this Mongoose version awaits an async
// document hook and hands it no callback, so declaring one gets it invoked with
// undefined. The same style as FleetOwner's code-assignment hook.
userSchema.pre("save", async function hashPassword() {
  if (!this.isModified("password") || !this.password) return;
  if (BCRYPT_HASH.test(this.password)) return;

  this.password = await bcrypt.hash(this.password, 10);
});

// Unknown or duplicated permission keys never reach the database — see
// config/permissions.js for why unknown keys are dropped rather than rejected.
//
// Takes no `next`: Mongoose treats a zero-argument document hook as synchronous
// and does not hand one in, and declaring the parameter anyway gets it called
// with undefined.
userSchema.pre("validate", function normalizePermissions() {
  if (this.isModified("permissions")) {
    this.permissions = sanitizePermissions(this.permissions);
  }
});

// 🔑 Compare Password
userSchema.methods.matchPassword = function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

/**
 * Whether this user may perform `key` ("loads.edit").
 *
 * Admins are unconditionally allowed: the role is the permission. Everyone else
 * is allowed only what is on their list, so a brand-new staff account with no
 * permissions can reach nothing until an admin grants something.
 */
userSchema.methods.hasPermission = function (key) {
  if (this.role === "admin") return true;
  return (this.permissions || []).includes(key);
};

// 👀 Hide sensitive fields
userSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.password;
    return ret;
  },
});

module.exports = mongoose.model("User", userSchema);



// // Hash password before saving
// userSchema.pre("save", async function (next) {
//   if (!this.isModified("password")) {
//     next();
//   }
//   const salt = await bcrypt.genSalt(10);
//   this.password = await bcrypt.hash(this.password, salt);
// });

// // Method to verify password
// userSchema.methods.matchPassword = async function (enteredPassword) {
//   return await bcrypt.compare(enteredPassword, this.password);
// };

// const User = mongoose.model("User", userSchema);

// module.exports = User;
