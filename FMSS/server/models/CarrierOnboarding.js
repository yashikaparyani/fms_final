const mongoose = require("mongoose");
const crypto = require("crypto");
const tenantScope = require("../plugins/tenantScope");
const { AGREEMENT_KEYS } = require("../config/carrierAgreements");
const { COVERAGES } = require("../config/insuranceCoverages");

// ─── Carrier onboarding ───────────────────────────────────────────────────────
// Everything a carrier has to hand over after the short signup form before they
// are allowed to haul: the agreement details, their drivers, and their
// insurance. One document per carrier, filled in over several sittings.
//
// It is a separate collection from FleetOwner deliberately. FleetOwner is read
// on every load, bid and dispatch screen; this is read on one screen during
// onboarding and then rarely again, and it carries a tax ID and an insurance
// agent's access token that have no business being loaded alongside a dispatch
// board.
//
// The steps are ordered but not gated: a carrier waiting on their insurance
// agent can still go back and add a driver. `status` is derived from what is
// actually complete rather than from how far they clicked — see refreshStatus().
// ─────────────────────────────────────────────────────────────────────────────

const STEPS = ["agreements", "drivers", "insurance", "review"];

const STATUSES = [
  "IN_PROGRESS", // carrier still filling things in
  "AWAITING_INSURANCE", // everything else done, agent has not submitted yet
  "UNDER_REVIEW", // complete, waiting on the office
  "APPROVED",
  "REJECTED",
];

const fileSchema = new mongoose.Schema(
  {
    fileName: String,
    originalName: String,
    filePath: String,
    mimeType: String,
    size: Number,
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { _id: false },
);

// One signed agreement. The generated PDF is kept rather than re-rendered on
// demand: what the carrier signed is a fact about a moment, and regenerating it
// later from a since-edited profile would quietly produce a different document
// from the one they agreed to.
const signedAgreementSchema = new mongoose.Schema(
  {
    key: { type: String, enum: AGREEMENT_KEYS, required: true },

    // Document-specific answers — initials, operating location. Shape is
    // declared in config/carrierAgreements.js rather than here, because the
    // blanks differ per document and pinning them in the schema would mean a
    // migration every time a contract is revised.
    values: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },

    acknowledgements: [String],

    signedName: String,
    signedTitle: String,
    // Data-URL of the drawn signature, as the POD flow already does.
    signatureData: String,
    signedAt: Date,

    // Kept so a dispute can be answered with where and when it was signed.
    signedIp: String,
    signedUserAgent: String,

    document: fileSchema,

    // Bumped when the office issues a revised contract, so an old signature is
    // never silently treated as covering new terms.
    version: { type: Number, default: 1 },
  },
  { _id: false },
);

const policySchema = new mongoose.Schema(
  {
    coverage: {
      type: String,
      enum: COVERAGES.map((c) => c.key),
      required: true,
    },

    insurerName: String, // the underwriter
    amBestRating: String,
    policyNumber: String,

    limit: Number,
    aggregateLimit: Number,
    deductible: Number,

    effectiveDate: Date,
    expiryDate: Date,

    namedInsured: String,
    additionalInsured: { type: Boolean, default: false },
    lossPayee: { type: Boolean, default: false },
    waiverOfSubrogation: { type: Boolean, default: false },

    // 49 CFR 387.7 — the endorsement that makes the auto liability policy
    // answer for environmental restoration. Tracked as a flag because most
    // carriers satisfy the pollution requirement with it rather than a separate
    // policy.
    mcs90Attached: { type: Boolean, default: false },

    noticeOfCancellationDays: { type: Number, default: 30 },

    certificate: fileSchema,
    notes: String,
  },
  { _id: false },
);

const carrierOnboardingSchema = new mongoose.Schema(
  {
    fleetOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FleetOwner",
      required: true,
      unique: true,
      index: true,
    },

    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    status: { type: String, enum: STATUSES, default: "IN_PROGRESS", index: true },

    // Where the carrier left off, so the form reopens where they stopped. A
    // hint for the UI only — nothing is enforced from it.
    currentStep: { type: String, enum: STEPS, default: "agreements" },

    // The shared field set from config/carrierAgreements.js — one answer set
    // that fills the blanks on both documents.
    profile: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },

    agreements: [signedAgreementSchema],

    // Appendix A of the contractor agreement.
    equipment: [
      new mongoose.Schema(
        {
          unitNumber: String,
          equipmentType: String,
          make: String,
          model: String,
          year: Number,
          vin: { type: String, uppercase: true, trim: true },
          plate: String,
          plateState: String,
        },
        { _id: false },
      ),
    ],

    insurance: {
      // Who was asked, and when — so "we are waiting on the agent" is a fact
      // with a date on it rather than a guess.
      agencyName: String,
      agentName: String,
      agentEmail: String,
      agentPhone: String,
      invitedAt: Date,
      invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reminderSentAt: Date,

      // The agent has no account here — they follow a one-off link. Only the
      // hash is stored, the same way a password reset token is handled: a
      // leaked database dump must not hand somebody the ability to file
      // insurance on a carrier's behalf.
      tokenHash: { type: String, select: false },
      tokenExpiresAt: Date,

      submittedAt: Date,
      submittedByName: String,
      submittedByEmail: String,

      policies: [policySchema],

      // Shortfalls found against config/insuranceCoverages.js at submission
      // time. Stored rather than recomputed so the office sees what was flagged
      // when it was reviewed, even after the requirements are revised.
      shortfalls: [String],
    },

    // Office decision.
    reviewedAt: Date,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewNote: String,

    submittedAt: Date,
  },
  { timestamps: true },
);

/** True once every required agreement carries a signature. */
carrierOnboardingSchema.methods.agreementsComplete = function () {
  return AGREEMENT_KEYS.every((key) =>
    (this.agreements || []).some((a) => a.key === key && a.signedAt),
  );
};

/** True once the insurance agent has come back with something. */
carrierOnboardingSchema.methods.insuranceComplete = function () {
  return !!this.insurance?.submittedAt && (this.insurance.policies || []).length > 0;
};

/**
 * Re-derive `status` from what is actually on the document.
 *
 * Driven by completeness rather than by which button was last pressed, so a
 * carrier who fills everything in and then closes the tab is still recorded as
 * ready for review, and an insurance policy that is deleted moves them back.
 * An office decision (APPROVED / REJECTED) is left alone — that is a human
 * judgement, not something to recompute.
 */
carrierOnboardingSchema.methods.refreshStatus = function ({ hasDrivers = false } = {}) {
  if (this.status === "APPROVED" || this.status === "REJECTED") return this.status;

  const agreements = this.agreementsComplete();
  const insurance = this.insuranceComplete();

  if (agreements && insurance && hasDrivers) {
    this.status = "UNDER_REVIEW";
    if (!this.submittedAt) this.submittedAt = new Date();
  } else if (agreements && this.insurance?.invitedAt && !insurance) {
    this.status = "AWAITING_INSURANCE";
  } else {
    this.status = "IN_PROGRESS";
  }

  return this.status;
};

/**
 * Issue a fresh access link for the insurance agent.
 *
 * Returns the plaintext token exactly once — it is emailed and never stored, so
 * re-reading the document cannot recover it. Re-issuing invalidates whatever
 * came before, which is what makes "send it to a different agent" safe.
 */
carrierOnboardingSchema.methods.issueInsuranceToken = function ({ days = 30 } = {}) {
  const token = crypto.randomBytes(32).toString("hex");

  this.insurance = this.insurance || {};
  this.insurance.tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  this.insurance.tokenExpiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  return token;
};

/** The stored form of a token presented by an agent, for lookup. */
carrierOnboardingSchema.statics.hashInsuranceToken = (token) =>
  crypto.createHash("sha256").update(String(token)).digest("hex");

// Per-location data — scoping is enforced centrally, see plugins/tenantScope.js.
carrierOnboardingSchema.plugin(tenantScope, { modelName: "CarrierOnboarding" });

carrierOnboardingSchema.statics.STEPS = STEPS;
carrierOnboardingSchema.statics.STATUSES = STATUSES;

module.exports = mongoose.model("CarrierOnboarding", carrierOnboardingSchema);
