const CarrierOnboarding = require("../models/CarrierOnboarding");
const { runUnscoped } = require("./tenantContext");

// ─── Who may see and bid on the board ─────────────────────────────────────────
// A carrier is shown loads open for bidding — and may bid on them — only once
// the office has approved their onboarding AND their insurance certificates are
// on file. Until then there is nothing on the board for them: no loads, no
// counts on the dashboard, no "bidding is open" notifications. Their drivers see
// exactly what the carrier sees.
//
// Both conditions, not either: the office can approve a file with insurance
// still outstanding (reviewOnboarding's overrideOutstanding), and that approval
// is not a licence to haul uninsured.
//
// A carrier with no onboarding file at all is not approved. That includes
// carriers created before onboarding existed — they get approved like anyone
// else before they can bid.
//
// Read unscoped: the carrier id always comes off the caller's own account (see
// utils/carrierAccount.js), and the cron and notification callers have no
// location context to scope by.
// ─────────────────────────────────────────────────────────────────────────────

const NOT_APPROVED = {
  code: "ONBOARDING_NOT_APPROVED",
  message:
    "Loads open for bidding appear here once the office has approved your onboarding. Finish anything outstanding on your Onboarding page and the office will review it.",
};

const NO_INSURANCE = {
  code: "INSURANCE_NOT_ON_FILE",
  message:
    "Loads open for bidding appear here once your insurance certificates are on file. Ask your insurance agent to file them from the link on your Onboarding page.",
};

const NO_CARRIER = {
  code: "NO_CARRIER",
  message: "No carrier profile is linked to your account. Ask the office to finish setting it up.",
};

/**
 * Why this carrier may not see or bid on the board, or null when they may.
 * Returns `{ code, message }` — the message is written to be shown as it is.
 */
const biddingBlockFor = async (carrierId) => {
  if (!carrierId) return NO_CARRIER;

  const file = await runUnscoped(() =>
    CarrierOnboarding.findOne({ fleetOwner: carrierId }).select(
      "status insurance.submittedAt insurance.policies",
    ),
  );

  if (!file || file.status !== "APPROVED") return NOT_APPROVED;
  if (!file.insuranceComplete()) return NO_INSURANCE;
  return null;
};

/**
 * Every carrier cleared to bid, as a Set of FleetOwner id strings — for sending
 * "bidding is open" to the carriers who can act on it and nobody else. The same
 * rule as biddingBlockFor, as one query.
 */
const biddingCarrierIds = async () => {
  const files = await runUnscoped(() =>
    CarrierOnboarding.find({
      status: "APPROVED",
      "insurance.submittedAt": { $ne: null },
      "insurance.policies.0": { $exists: true },
    })
      .select("fleetOwner")
      .lean(),
  );
  return new Set(files.map((f) => String(f.fleetOwner)));
};

module.exports = { biddingBlockFor, biddingCarrierIds };
