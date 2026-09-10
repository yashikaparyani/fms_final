// ─── Load urgency model ──────────────────────────────────────────────────────
// Loads are ranked by how soon they pick up. The buckets drive the row tint and
// the priority badge.
//
// The order they are listed in is a different question, and the answer is the
// delivery date, earliest first — see sortByDeliveryDate. What the office is
// asked all day is when a load lands, not when it left, so the table is read as
// a calendar of what is due when.
// Shared by the Pending, Dispatch Management, All Transit and Over tables.

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

// ── The appointment window beside the date ───────────────────────────────────
// A date on its own does not tell dispatch whether a load is a morning or an
// afternoon problem, and that is the question the transit boards are read to
// answer. The stop the window is taken from is the same stop the date above was
// taken from, so the two never describe different appointments.
const pickupStopOf = (row) =>
  row.pickups?.[0]?.pickupDate ? row.pickups[0] : (row.pickup ?? row.pickups?.[0] ?? null);
const dropStopOf = (row) =>
  row.drops?.[0]?.deliveryDate ? row.drops[0] : (row.drop ?? row.drops?.[0] ?? null);

/**
 * The window as it was typed — "08:00", "8am", "0800-1400" are all things that
 * are actually in this field. It is free text on the model, so it is shown
 * rather than parsed: turning "8am" into a real time would invent a precision
 * the data does not have, and get it wrong on the rows that are already ranges.
 *
 * Returns "" rather than null when there is nothing, so a caller can test it as
 * a string and render nothing at all for the many loads with no window set.
 */
const windowOf = (stop) => {
  const from = String(stop?.fromTime ?? "").trim();
  const to = String(stop?.toTime ?? "").trim();
  if (from && to) return from === to ? from : `${from}–${to}`;
  return from || to || "";
};

export const pickupWindowOf = (row) => windowOf(pickupStopOf(row));
export const dropWindowOf   = (row) => windowOf(dropStopOf(row));

/**
 * Date and window as one line, for the phone cards — where each field is a
 * single label/value pair and there is no second row to hang the time off.
 * Falls back to the date alone, so a load with no window reads unchanged.
 */
export const withWindow = (date, window) =>
  date && window ? `${date} · ${window}` : date;

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
 * Decorate each row with its `urgency`, then order strictly by `dateOf`,
 * earliest first — July, then August, then September.
 *
 * The date line is the whole order: an expired July load sits above a live
 * August one rather than being pushed to the bottom, because the table is read
 * as a calendar of what is happening when. `urgency` still rides along for the
 * row tint and the priority badge, so an overdue load is still obvious where it
 * sits.
 *
 * Loads with no date cannot be placed on that line at all, so they collect at
 * the end rather than at the top, where a missing date would otherwise sort as
 * the earliest of all.
 */
const sortByDate = (rows, dateOf) =>
  rows
    .map((row) => ({ ...row, urgency: urgencyOf(row) }))
    .sort((a, b) => {
      const aDate = dateOf(a);
      const bDate = dateOf(b);
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;
      return new Date(aDate) - new Date(bDate);
    });

/**
 * The order every Load Management tab is read in: earliest delivery date at the
 * top.
 *
 * Delivery rather than pickup because the question the office is answering is
 * "what is due next" — a load picking up tomorrow and delivering in three weeks
 * is not more pressing than one delivering the day after tomorrow, and ordering
 * by pickup put it above.
 */
export const sortByDeliveryDate = (rows) => sortByDate(rows, dropDateOf);

/** Pickup order, kept for anywhere that genuinely wants the departure line. */
export const sortByPickupDate = (rows) => sortByDate(rows, pickupDateOf);
