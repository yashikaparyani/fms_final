// ─── Shared invoice vocabulary ────────────────────────────────────────────────
// The words and colours the four accounting screens use for the same things.
//
// Here rather than repeated per screen because a status that reads "Part paid"
// on the register and "Partial" on the detail page is two names for one state,
// and the user has to work out that they are the same. Every label a customer or
// a clerk reads comes from this file.
//
// The server is still the authority on what a status IS — see models/Invoice.js.
// This only decides how to say it.
// ─────────────────────────────────────────────────────────────────────────────

export const money = (value) =>
  `$${(Math.round((Number(value) || 0) * 100) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** Money without the cents, for tiles where the precision is just noise. */
export const moneyShort = (value) =>
  `$${Math.round(Number(value) || 0).toLocaleString("en-US")}`;

// Dates come from utils/dates.js, not from toLocaleDateString and
// toISOString. An invoice date is a calendar date — it must read as the same day
// to a clerk in Newark and a developer in Pune — and `today()` built from
// toISOString returns tomorrow's date for anyone east of Greenwich in their
// evening. Re-exported here so the accounting screens have one import.
export {
  formatDate,
  formatDateTime,
  formatDateNumeric,
  toDateInput,
  todayKey as today,
  startOfMonthKey as startOfMonth,
  daysBetween,
} from "../../utils/dates";

// ── Status ────────────────────────────────────────────────────────────────────
// The wording is deliberately what a person would say out loud. "SENT" is the
// stored value; "Awaiting payment" is what it means to somebody looking at a
// list of things they are waiting on.
export const STATUS = {
  DRAFT: { label: "Draft", chip: "bg-gray-100 text-gray-700 border-gray-200" },
  SENT: { label: "Awaiting payment", chip: "bg-blue-50 text-blue-700 border-blue-200" },
  PARTIAL: { label: "Part paid", chip: "bg-amber-50 text-amber-800 border-amber-200" },
  PAID: { label: "Paid", chip: "bg-green-50 text-green-700 border-green-200" },
  VOID: { label: "Void", chip: "bg-gray-100 text-gray-400 border-gray-200 line-through" },
};

/**
 * How to show one invoice's state.
 *
 * Overdue is not a stored status — it is a status plus a date — but it is the
 * thing anybody scanning the register is actually looking for, so it wins the
 * chip. An invoice that is both "awaiting payment" and forty days late is, for
 * every practical purpose, just late.
 */
export const statusOf = (invoice) => {
  if (invoice.status !== "VOID" && invoice.overdue) {
    return {
      label: `${invoice.daysOverdue}d overdue`,
      chip: "bg-red-50 text-red-700 border-red-200",
    };
  }
  return STATUS[invoice.status] || STATUS.DRAFT;
};

/** The aging buckets, in the order finance reads them. */
export const AGING_BUCKETS = [
  { key: "current", label: "Current", tone: "text-gray-800" },
  { key: "d1_30", label: "1–30 days", tone: "text-amber-700" },
  { key: "d31_60", label: "31–60 days", tone: "text-orange-700" },
  { key: "d61_90", label: "61–90 days", tone: "text-red-600" },
  { key: "d90plus", label: "90+ days", tone: "text-red-700 font-bold" },
];

export const PARTY_LABEL = {
  CUSTOMER: "Customer",
  CARRIER: "Carrier",
  DRIVER: "Driver",
};

/**
 * What this document is called on this side.
 *
 * A carrier receiving a "settlement" and a customer receiving an "invoice" are
 * looking at the same record, but calling a driver's pay statement an invoice is
 * how a driver ends up thinking they have been billed.
 */
export const documentNoun = (invoice) => {
  if (invoice?.direction === "AR") return "Invoice";
  return invoice?.party?.kind === "DRIVER" ? "Settlement" : "Bill";
};

/** The API error message, or a fallback that says what failed. */
export const errorFrom = (err, fallback) =>
  err?.response?.data?.message || err?.message || fallback;
