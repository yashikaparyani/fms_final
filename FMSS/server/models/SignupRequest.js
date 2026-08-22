const mongoose = require("mongoose");

/**
 * A public sign-up waiting on the office.
 *
 * Registration deliberately does not create an account. Carrier sign-up was
 * removed once before precisely because anyone could open a carrier portal
 * without being vetted; this brings it back with the vetting made explicit —
 * the form lands here, the office approves or rejects it, and only on approval
 * is a real User created and its credentials mailed out. Nothing in this
 * collection can sign in.
 *
 * Both audiences share one collection because they share one flow. `role`
 * decides which half of the fields is meaningful and which account gets built
 * at approval.
 */
const signupRequestSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["client", "fleetOwner"],
      required: true,
    },

    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      index: true,
    },

    // ── Shared ────────────────────────────────────────────────────────────
    // Indexed by the partial unique index declared below, not here — declaring
    // both makes Mongoose build two indexes on the same key.
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    phone: { type: String, trim: true },

    // The operating location the account will belong to. Resolved when the
    // form is submitted so an approver is not asked to guess it later.
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch" },

    address: {
      street: String,
      suite: String,
      city: String,
      state: String,
      zip: String,
    },

    // ── Shipper (role: client) ────────────────────────────────────────────
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    customerName: { type: String, trim: true },

    // ── Carrier (role: fleetOwner) ────────────────────────────────────────
    carrierName: { type: String, trim: true },
    mcLicense: { type: String, trim: true },
    dotLicense: { type: String, trim: true },

    // Anything the applicant wants the office to know.
    note: { type: String, trim: true, maxlength: 2000 },

    // ── Review ────────────────────────────────────────────────────────────
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
    rejectionReason: { type: String, trim: true },

    // Set on approval, so a request can never mint two accounts.
    createdUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // Whether the credentials email actually went out. Approval must not fail
    // because a mail server was down, but the office has to be able to see that
    // it did and re-send by hand.
    credentialsEmailed: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// One live application per address. Someone who was rejected may apply again,
// and an approved request keeps its history, so only PENDING is constrained.
signupRequestSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { status: "PENDING" } },
);

/** A display name that works for either audience, for the review list. */
signupRequestSchema.virtual("displayName").get(function displayName() {
  if (this.role === "fleetOwner") return this.carrierName || this.email;
  return this.customerName || [this.firstName, this.lastName].filter(Boolean).join(" ") || this.email;
});

signupRequestSchema.set("toJSON", { virtuals: true });
signupRequestSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("SignupRequest", signupRequestSchema);
