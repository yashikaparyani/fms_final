// ─── Load urgency model ──────────────────────────────────────────────────────
// Loads are ranked by how soon they pick up. The buckets drive the row tint and
// the priority badge; the order itself is the pickup date, earliest first, so
// the table reads as a calendar of what is happening when.
// Shared by the Pending, Dispatch Management and All Transit tables.

export const URGENCY = {
  URGENT:  "URGENT",   // picks up in under 5 days
  SOON:    "SOON",     // 5–10 days out
  LATER:   "LATER",    // more than 10 days out
  EXPIRED: "EXPIRED",  // pickup date already passed
  NO_DATE: "NO_DATE",  // no pickup date recorded
};

// Expired and undated loads are deliberately muted: they keep their place on
// the date line but must not compete for attention with live, upcoming work.
export const URGENCY_COLORS = {
  [URGENCY.URGENT]:  { bg: "#fff0f0", border: "#ef4444" },
  [URGENCY.SOON]:    { bg: "#fffbeb", border: "#f59e0b" },
  [URGENCY.LATER]:   { bg: "#edf9ee", border: "#22c55e" },
  [URGENCY.EXPIRED]: { bg: "#f3f4f6", border: "#9ca3af" },
  [URGENCY.NO_DATE]: { bg: "#f9fafb", border: "#d1d5db" },
};

export const URGENCY_LABEL = {
  [URGENCY.URGENT]:  { text: "Urgent",    className: "bg-red-100 text-red-800" },
  [URGENCY.SOON]:    { text: "Soon",      className: "bg-amber-100 text-amber-800" },
  [URGENCY.LATER]:   { text: "Scheduled", className: "bg-green-100 text-green-800" },
  [URGENCY.EXPIRED]: { text: "Expired",   className: "bg-gray-200 text-gray-700" },
  [URGENCY.NO_DATE]: { text: "No date",   className: "bg-gray-100 text-gray-500" },
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Whole calendar days from today until `value`. Negative once the date passes.
 * Comparing at midnight keeps "today" at 0 regardless of the time of day.
 */
export const daysUntil = (value) => {
  if (!value) return null;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return null;
  target.setHours(0, 0, 0, 0);
  return Math.round((target - startOfToday()) / 86400000);
};

// `pickup` is kept in sync with `pickups[0]` server-side, but a load edited
// through the multi-stop form carries the array as the source of truth.
export const pickupDateOf = (row) => row.pickups?.[0]?.pickupDate ?? row.pickup?.pickupDate ?? null;
export const dropDateOf   = (row) => row.drops?.[0]?.deliveryDate ?? row.drop?.deliveryDate ?? null;

export const urgencyOf = (row) => {
  const days = daysUntil(pickupDateOf(row));
  if (days === null) return URGENCY.NO_DATE;
  if (days < 0) return URGENCY.EXPIRED;
  if (days < 5) return URGENCY.URGENT;
  if (days <= 10) return URGENCY.SOON;
  return URGENCY.LATER;
};

/**
 * The bulb is an LFD alarm, not a pickup alarm: it fires when the last free
 * date lands today, tomorrow or the day after. An LFD already gone is a
 * different problem and gets the existing EXPIRED treatment instead.
 */
export const isLfdAlarming = (row) => {
  const days = daysUntil(row.lastFreeDate);
  return days !== null && days >= 0 && days <= 2;
};

/**
 * Decorate each row with its `urgency`, then order strictly by pickup date,
 * earliest first — July, then August, then September.
 *
 * The date line is the whole order: an expired July load sits above a live
 * August one rather than being pushed to the bottom, because the table is read
 * as a calendar of what is happening when. `urgency` still rides along for the
 * row tint and the priority badge, so an overdue load is still obvious where it
 * sits.
 *
 * Loads with no pickup date cannot be placed on that line at all, so they
 * collect at the end rather than at the top, where a missing date would
 * otherwise sort as the earliest of all.
 */
export const sortByPickupDate = (rows) =>
  rows
    .map((row) => ({ ...row, urgency: urgencyOf(row) }))
    .sort((a, b) => {
      const aDate = pickupDateOf(a);
      const bDate = pickupDateOf(b);
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;
      return new Date(aDate) - new Date(bDate);
    });
