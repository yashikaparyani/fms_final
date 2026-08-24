const mongoose = require("mongoose");

// ─── Instant dispatch settings ────────────────────────────────────────────────
// The commercial and operational dials behind instant dispatch: what the broker
// keeps, how far out to look for a truck, and how long a carrier has to take
// the job before it falls back to bidding.
//
// One document per branch, plus one with `branch: null` that is the house
// default every branch inherits from. A branch row only has to state what it
// changes — see settingsFor() in services/dispatchSettingsService.js, which
// layers branch over global over the hard defaults below.
//
// Deliberately NOT tenant-scoped by the plugin. The global row belongs to no
// branch and the plugin fails closed on documents without a locationId, so it
// would make the house default unreadable. Scoping here is the explicit
// `branch` filter, and every read goes through the service so there is one
// place that decides what a given branch is on.
//
// Kept off the Branch model on purpose: a branch is an identity record — name,
// code, address — and commission rates are policy that changes on its own
// schedule and wants its own audit trail.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What the system runs on if nobody has ever opened the settings screen.
 *
 * 20% is the rate the business named. The rest are picked to be safe rather
 * than aggressive: a wide radius that still means "same metro or next one
 * over", positions recent enough that the truck is plausibly still near where
 * it reported, and a window long enough for a dispatcher to see a message and
 * answer it without leaving a customer waiting all afternoon.
 */
const DEFAULTS = {
  commissionPercent: 20,
  searchRadiusMiles: 100,
  positionMaxAgeHours: 24,
  offerWindowMinutes: 30,
  instantDispatchEnabled: true,
};

const dispatchSettingsSchema = new mongoose.Schema(
  {
    // null on exactly one document: the house default.
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
      unique: true,
    },

    // What the broker keeps of the customer's amount. The carrier is shown, and
    // paid, the remainder — see services/commissionService.js.
    //
    // Capped rather than left open: a fat-fingered 200 would show a carrier a
    // negative payout, and there is no rate above 100 that means anything.
    commissionPercent: { type: Number, min: 0, max: 100 },

    // How far from the pickup to look for a truck.
    searchRadiusMiles: { type: Number, min: 1, max: 2000 },

    // A position older than this is not evidence of where a truck is now, so
    // the driver it belongs to is not offered the load.
    positionMaxAgeHours: { type: Number, min: 1, max: 720 },

    // How long carriers have to accept before the load falls back to bidding.
    offerWindowMinutes: { type: Number, min: 1, max: 1440 },

    // Lets a branch turn the whole thing off without the option disappearing
    // from every other branch.
    instantDispatchEnabled: { type: Boolean },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

module.exports = {
  DEFAULTS,
  DispatchSettings:
    mongoose.models.DispatchSettings ||
    mongoose.model("DispatchSettings", dispatchSettingsSchema),
};
