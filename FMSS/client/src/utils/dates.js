// ─── Dates ────────────────────────────────────────────────────────────────────
// The mirror of server/utils/dates.js. Change both.
//
// ── The two kinds of value ───────────────────────────────────────────────────
//
// A CALENDAR DATE has no time and no timezone. An invoice date, a due date, a
// pickup date, a licence expiry. "15 March" means 15 March in Newark, in Mumbai
// and on a printed page. It is stored as UTC midnight and MUST be read back in
// UTC — read it in any other zone and it moves.
//
// An INSTANT is a moment that happened. createdAt, sentAt, an audit entry, a
// tracking ping. One point on the world's timeline, shown to everybody as the
// same US business clock whatever machine they are sitting at.
//
// ── The bug this exists to kill ──────────────────────────────────────────────
// A <input type="date"> submits "2026-03-15". `new Date("2026-03-15")` is UTC
// midnight. `toLocaleDateString()` renders in the VIEWER's zone — so in New York
// (UTC−4) that instant is 8pm on the 14th, and the invoice shows a day early.
// The same code on a machine in India (UTC+5:30) shows the 15th, which is why
// this survives development and only appears once somebody in the States looks.
//
// The mirror image is just as bad: `new Date().toISOString().slice(0, 10)` — the
// usual way to put "today" into a date input — returns TOMORROW for anyone east
// of Greenwich in their evening, and YESTERDAY in the Americas after 7pm.
//
// So: calendar dates are read in UTC, instants are rendered in the business
// zone, and nothing ever reaches a date input via toISOString().
// ─────────────────────────────────────────────────────────────────────────────

// Where the business keeps its clock. Every instant is shown in this zone, so a
// dispatcher in Newark and a developer in Pune reading the same audit trail see
// the same times and can talk about them without converting.
export const BUSINESS_TIME_ZONE = "America/New_York";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** A Date, or null for anything that is not one. Never throws, never NaN. */
export const toDate = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// ── Calendar dates ────────────────────────────────────────────────────────────

/**
 * The "YYYY-MM-DD" a value belongs to — the only safe thing to put in a
 * <input type="date">, and the format it submits back.
 *
 * A value at exactly UTC midnight is already a calendar date and keeps its day.
 * Anything else is an instant and is resolved in the business zone, so a payment
 * entered at 9pm in Newark files under that day rather than the next one.
 */
export const toDateKey = (value) => {
  const date = toDate(value);
  if (!date) return "";

  const isUtcMidnight =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;

  // en-CA is ISO-ordered — "2026-03-15" — which is what a date input wants.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: isUtcMidnight ? "UTC" : BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

/** What a date input should be pre-filled with. Alias of toDateKey, named for the use. */
export const toDateInput = toDateKey;

/** A calendar date anchored at UTC midnight — what to send back to the API. */
export const calendarDate = (value) => {
  if (typeof value === "string" && DATE_KEY.test(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }
  const key = toDateKey(value);
  return key ? new Date(`${key}T00:00:00.000Z`) : null;
};

/** Today in the business zone, as "YYYY-MM-DD". */
export const todayKey = () => toDateKey(new Date());

/** First of this month in the business zone, as "YYYY-MM-DD". */
export const startOfMonthKey = () => `${todayKey().slice(0, 7)}-01`;

/**
 * N days on from a calendar date.
 *
 * Anchored in UTC, so there is no DST boundary to drift across — adding
 * 86,400,000ms to a local-midnight date lands on 23:00 the previous day twice a
 * year.
 */
export const addDays = (value, days) => {
  const date = calendarDate(value);
  if (!date) return null;
  return new Date(date.getTime() + Number(days || 0) * 86400000);
};

/** Whole calendar days from `from` to `to`; negative when `to` is earlier. */
export const daysBetween = (from, to) => {
  const a = calendarDate(from);
  const b = calendarDate(to);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
};

/** Days past `dueDate`, or 0 if it is not yet due. */
export const daysOverdue = (dueDate) => {
  const days = daysBetween(dueDate, todayKey());
  return days > 0 ? days : 0;
};

// ── Formatting ────────────────────────────────────────────────────────────────

/**
 * A calendar date for a human: "Mar 15, 2026".
 *
 * Read in UTC, which is the whole point — a date rendered in the reader's own
 * zone is a date that changes depending on who is reading it.
 */
export const formatDate = (value, { fallback = "—" } = {}) => {
  const date = toDate(value);
  if (!date) return fallback;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(calendarDate(date));
};

/** "03/15/2026" — the numeric US form, for tables that need the width. */
export const formatDateNumeric = (value, { fallback = "—" } = {}) => {
  const date = toDate(value);
  if (!date) return fallback;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(calendarDate(date));
};

/** "Mar 15" — for dense rows where the year is obvious from context. */
export const formatDateShort = (value, { fallback = "—" } = {}) => {
  const date = toDate(value);
  if (!date) return fallback;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(calendarDate(date));
};

/**
 * An instant on the US business clock: "Mar 15, 2026, 3:42 PM EDT".
 *
 * The zone abbreviation is not decoration. Without it a timestamp is a number
 * two people in different places read as two different moments, which is exactly
 * what pinning the zone was meant to stop.
 */
export const formatDateTime = (value, { fallback = "—", seconds = false } = {}) => {
  const date = toDate(value);
  if (!date) return fallback;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" } : {}),
    timeZoneName: "short",
  }).format(date);
};

/** Just the clock part of an instant: "3:42 PM EDT". */
export const formatTime = (value, { fallback = "—" } = {}) => {
  const date = toDate(value);
  if (!date) return fallback;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
};

/**
 * "3 days ago", "in 2 weeks" — for ages, never for a date somebody must act on.
 *
 * Relative time is friendly and imprecise. A due date renders as a date; how
 * long ago a status changed renders as this.
 */
export const formatRelative = (value, { fallback = "—" } = {}) => {
  const date = toDate(value);
  if (!date) return fallback;

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);

  const [amount, unit] =
    abs < 60
      ? [seconds, "second"]
      : abs < 3600
        ? [Math.round(seconds / 60), "minute"]
        : abs < 86400
          ? [Math.round(seconds / 3600), "hour"]
          : abs < 2592000
            ? [Math.round(seconds / 86400), "day"]
            : abs < 31536000
              ? [Math.round(seconds / 2592000), "month"]
              : [Math.round(seconds / 31536000), "year"];

  return new Intl.RelativeTimeFormat("en-US", { numeric: "auto" }).format(amount, unit);
};
