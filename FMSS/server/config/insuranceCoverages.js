// ─── Carrier insurance requirements ───────────────────────────────────────────
// What a carrier has to carry before they are allowed to haul, and what the
// insurance agency has to tell us about each policy.
//
// Two sources decide this list, and both are cited per coverage below:
//
//   · The signed agreements. The S LINE BROKERAGE Transportation Brokerage
//     Agreement (¶11–12) and the S LINE TRANSPORTATION Independent Contractor
//     Agreement (¶24, ¶38) name specific limits and AM Best ratings. Those are
//     contractual, so they are the minimums enforced here.
//   · 49 CFR Part 387, the FMCSA financial-responsibility rules, which set the
//     federal floor ($750k general freight, $1M for oil, $5M for hazmat) and
//     define the MCS-90 endorsement.
//
// `required: true` means onboarding is not complete without it. The optional
// ones are still collected because shippers routinely ask for them and a
// certificate that arrives late holds up a load.
//
// Limits are stored in whole dollars. `minLimit` is checked on submission and
// surfaced as a warning rather than a hard rejection: a broker sometimes accepts
// a lower limit for a particular lane, and an agency being unable to file a real
// policy because our form disagrees with the underwriter helps nobody.
// ─────────────────────────────────────────────────────────────────────────────

const COVERAGES = [
  {
    key: "autoLiability",
    label: "Auto / Trucking Liability",
    required: true,
    minLimit: 1000000,
    minAggregate: null,
    minAmBest: "A",
    basis: "Agreement ¶12 (Truckers Liability) · 49 CFR 387.9",
    description:
      "Primary liability for bodily injury and property damage caused by the truck. The federal floor is $750,000 for general freight; the agreement requires $1,000,000 combined single limit each occurrence.",
    needsAdditionalInsured: true,
    needsLossPayee: false,
  },
  {
    key: "generalLiability",
    label: "Commercial General Liability",
    required: true,
    minLimit: 1000000,
    minAggregate: 2000000,
    minAmBest: "A",
    basis: "Agreement ¶12",
    description:
      "Premises and operations liability away from the vehicle itself. $1,000,000 combined single limit for bodily injury and property damage, with a $2,000,000 annual aggregate.",
    needsAdditionalInsured: true,
    needsLossPayee: false,
  },
  {
    key: "cargo",
    label: "Motor Truck Cargo",
    required: true,
    minLimit: 100000,
    minAggregate: null,
    minAmBest: "B++",
    basis: "Agreement ¶11",
    description:
      "Covers the freight itself while in the carrier's custody. The agreement sets $100,000 for bobtails and $100,000 for containers, trailers and vans, and requires the broker to be named loss payee.",
    needsAdditionalInsured: false,
    needsLossPayee: true,
  },
  {
    key: "workersComp",
    label: "Workers' Compensation",
    required: true,
    minLimit: null, // statutory — the state sets it, not the contract
    statutory: true,
    minAggregate: null,
    minAmBest: null,
    basis: "Independent Contractor Agreement ¶38",
    description:
      "Statutory cover for the carrier and every one of their employees. Limits are set by the state rather than by the agreement. Carriers with no employees sometimes carry Occupational Accident instead — record that below if so.",
    needsAdditionalInsured: false,
    needsLossPayee: false,
  },
  {
    key: "trailerInterchange",
    label: "Trailer Interchange / Chassis",
    required: true,
    minLimit: 50000,
    minAggregate: null,
    minAmBest: null,
    basis: "Drayage operations — carrier pulls equipment it does not own",
    description:
      "Damage to a trailer or chassis the carrier is pulling under an interchange agreement but does not own. Required here because this is drayage work: nearly every move is on somebody else's chassis.",
    needsAdditionalInsured: false,
    needsLossPayee: false,
  },
  {
    key: "nonTruckingLiability",
    label: "Non-Trucking Liability (Bobtail)",
    required: false,
    minLimit: 1000000,
    minAggregate: null,
    minAmBest: null,
    basis: "Standard owner-operator requirement",
    description:
      "Covers the tractor when it is being driven off dispatch — home from the yard, to the shop. Primary liability usually will not respond then.",
    needsAdditionalInsured: false,
    needsLossPayee: false,
  },
  {
    key: "physicalDamage",
    label: "Physical Damage",
    required: false,
    minLimit: null,
    minAggregate: null,
    minAmBest: null,
    basis: "Usually required by the equipment lienholder",
    description:
      "Damage to the carrier's own tractor and trailer. Limit is normally the stated value of the equipment.",
    needsAdditionalInsured: false,
    needsLossPayee: true,
  },
  {
    key: "pollutionLiability",
    label: "Environmental Restoration / Pollution",
    required: false,
    minLimit: 1000000,
    minAggregate: null,
    minAmBest: null,
    basis: "Independent Contractor Agreement ¶24 · MCS-90 endorsement, 49 CFR 387.7",
    description:
      "Environmental restoration cover, named explicitly in the agreement. For most carriers this is satisfied by the MCS-90 endorsement on the auto liability policy rather than a separate policy — record it either way.",
    needsAdditionalInsured: false,
    needsLossPayee: false,
  },
  {
    key: "excessLiability",
    label: "Umbrella / Excess Liability",
    required: false,
    minLimit: null,
    minAggregate: null,
    minAmBest: null,
    basis: "Frequently required by individual shippers",
    description:
      "Sits above the primary limits. Not required by the agreement, but some shippers will not release freight without it, so it is worth having on file before it is asked for.",
    needsAdditionalInsured: true,
    needsLossPayee: false,
  },
  {
    key: "occupationalAccident",
    label: "Occupational Accident",
    required: false,
    minLimit: null,
    minAggregate: null,
    minAmBest: null,
    basis: "Alternative to Workers' Compensation for owner-operators",
    description:
      "Medical and disability cover for an owner-operator in states where they are not required to carry Workers' Compensation on themselves.",
    needsAdditionalInsured: false,
    needsLossPayee: false,
  },
];

const COVERAGE_BY_KEY = new Map(COVERAGES.map((c) => [c.key, c]));

const REQUIRED_KEYS = COVERAGES.filter((c) => c.required).map((c) => c.key);

/**
 * AM Best ratings, strongest first.
 *
 * Compared by position rather than alphabetically: "A-" sorts after "A++" as a
 * string but is a weaker rating, and a naive string compare would accept a
 * downgrade as satisfying the agreement.
 */
const AM_BEST_ORDER = [
  "A++",
  "A+",
  "A",
  "A-",
  "B++",
  "B+",
  "B",
  "B-",
  "C++",
  "C+",
  "C",
  "C-",
  "D",
  "E",
  "F",
  "S",
];

const meetsAmBest = (actual, minimum) => {
  if (!minimum) return true;
  if (!actual) return false;

  const actualRank = AM_BEST_ORDER.indexOf(String(actual).toUpperCase().trim());
  const minRank = AM_BEST_ORDER.indexOf(String(minimum).toUpperCase().trim());

  if (actualRank === -1 || minRank === -1) return false;
  return actualRank <= minRank; // earlier in the list is stronger
};

/**
 * Check one submitted policy against what the agreement asks for.
 *
 * Returns a list of human-readable shortfalls rather than a boolean: the office
 * reviewing a carrier needs to know *what* is short, and "cargo limit is
 * $50,000, the agreement requires $100,000" is the only form of that which is
 * actionable.
 */
const shortfallsFor = (policy = {}) => {
  const spec = COVERAGE_BY_KEY.get(policy.coverage);
  if (!spec) return [`"${policy.coverage}" is not a coverage this system tracks.`];

  const problems = [];

  if (spec.minLimit && Number(policy.limit || 0) < spec.minLimit) {
    problems.push(
      `${spec.label}: limit is ${formatMoney(policy.limit)}, the agreement requires ${formatMoney(spec.minLimit)}.`,
    );
  }

  if (spec.minAggregate && Number(policy.aggregateLimit || 0) < spec.minAggregate) {
    problems.push(
      `${spec.label}: aggregate is ${formatMoney(policy.aggregateLimit)}, the agreement requires ${formatMoney(spec.minAggregate)}.`,
    );
  }

  if (spec.minAmBest && !meetsAmBest(policy.amBestRating, spec.minAmBest)) {
    problems.push(
      `${spec.label}: insurer is rated ${policy.amBestRating || "unrated"}, the agreement requires at least ${spec.minAmBest}.`,
    );
  }

  if (spec.needsAdditionalInsured && !policy.additionalInsured) {
    problems.push(
      `${spec.label}: the broker must be named as an additional insured.`,
    );
  }

  if (spec.needsLossPayee && !policy.lossPayee) {
    problems.push(`${spec.label}: the broker must be named as a loss payee.`);
  }

  if (policy.expiryDate && new Date(policy.expiryDate) < new Date()) {
    problems.push(`${spec.label}: the policy expired on ${formatDate(policy.expiryDate)}.`);
  }

  return problems;
};

/** Which required coverages have not been submitted at all. */
const missingRequired = (policies = []) => {
  const present = new Set(
    policies.filter((p) => p && p.coverage).map((p) => p.coverage),
  );
  return REQUIRED_KEYS.filter((key) => !present.has(key)).map(
    (key) => COVERAGE_BY_KEY.get(key).label,
  );
};

const formatMoney = (value) =>
  value === null || value === undefined || value === ""
    ? "not stated"
    : `$${Number(value).toLocaleString("en-US")}`;

const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString("en-US");
};

/** The catalog in the shape the insurance form wants. */
const catalog = () => ({
  coverages: COVERAGES.map((c) => ({
    key: c.key,
    label: c.label,
    required: c.required,
    statutory: !!c.statutory,
    minLimit: c.minLimit,
    minAggregate: c.minAggregate,
    minAmBest: c.minAmBest,
    description: c.description,
    basis: c.basis,
    needsAdditionalInsured: c.needsAdditionalInsured,
    needsLossPayee: c.needsLossPayee,
  })),
  amBestRatings: AM_BEST_ORDER,
  requiredKeys: REQUIRED_KEYS,
});

module.exports = {
  COVERAGES,
  COVERAGE_BY_KEY,
  REQUIRED_KEYS,
  AM_BEST_ORDER,
  meetsAmBest,
  shortfallsFor,
  missingRequired,
  catalog,
  formatMoney,
};
