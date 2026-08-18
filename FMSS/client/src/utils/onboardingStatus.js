// ─── Carrier onboarding statuses, as the office reads them ────────────────────
// The five values on CarrierOnboarding.status, with the wording and colour each
// gets everywhere it is shown. Kept in one place because the queue, the review
// screen and the carrier's own banner all name the same states, and three
// copies of "AWAITING_INSURANCE means amber" drift the first time one is
// edited.
//
// `label` is deliberately not the enum value. REJECTED is shown as "Sent back"
// because that is what it means here — the file returns to the carrier with a
// note, it is not a permanent refusal.
// ─────────────────────────────────────────────────────────────────────────────

export const ONBOARDING_STATUSES = [
  "UNDER_REVIEW",
  "AWAITING_INSURANCE",
  "IN_PROGRESS",
  "REJECTED",
  "APPROVED",
];

const META = {
  UNDER_REVIEW: {
    label: "Needs review",
    tone: "bg-indigo-50 border-indigo-200 text-indigo-900",
    badge: "bg-indigo-100 text-indigo-800 border-indigo-200",
    row: { bg: "#eef2ff", border: "#c7d2fe" },
    blurb: "Complete and waiting on the office to approve it.",
  },
  AWAITING_INSURANCE: {
    label: "Waiting on insurance",
    tone: "bg-amber-50 border-amber-200 text-amber-900",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    row: { bg: "#fffbeb", border: "#fde68a" },
    blurb: "Everything else is done; the agency has not filed certificates yet.",
  },
  IN_PROGRESS: {
    label: "In progress",
    tone: "bg-blue-50 border-blue-200 text-blue-900",
    badge: "bg-blue-100 text-blue-800 border-blue-200",
    row: { bg: "#f8fafc", border: "#e2e8f0" },
    blurb: "The carrier is still filling their file in.",
  },
  APPROVED: {
    label: "Approved",
    tone: "bg-green-50 border-green-200 text-green-900",
    badge: "bg-green-100 text-green-800 border-green-200",
    row: { bg: "#f0fdf4", border: "#bbf7d0" },
    blurb: "Cleared to haul.",
  },
  REJECTED: {
    label: "Sent back",
    tone: "bg-red-50 border-red-200 text-red-900",
    badge: "bg-red-100 text-red-800 border-red-200",
    row: { bg: "#fef2f2", border: "#fecaca" },
    blurb: "Returned to the carrier with a note saying what to fix.",
  },
};

const UNKNOWN = {
  label: "Unknown",
  tone: "bg-gray-50 border-gray-200 text-gray-800",
  badge: "bg-gray-100 text-gray-700 border-gray-200",
  row: { bg: "#ffffff", border: "#e5e7eb" },
  blurb: "",
};

export const onboardingStatusMeta = (status) => META[status] || UNKNOWN;

/** Row tints for LoadTable, keyed the way it expects. */
export const onboardingRowColors = Object.fromEntries(
  Object.entries(META).map(([key, meta]) => [key, meta.row]),
);
