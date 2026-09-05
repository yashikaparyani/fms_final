// ─── Dates ────────────────────────────────────────────────────────────────────
// One place that knows the difference between a date and an instant, because
// treating them as the same thing is what makes an invoice dated 15 March print
// as 14 March.
//
// ── The two kinds of value ───────────────────────────────────────────────────
//
// A CALENDAR DATE has no time and no timezone. An invoice date, a due date, a
// pickup date, a licence expiry. "15 March" means 15 March in Newark, in
// Mumbai and on a printed page. It is stored as UTC midnight and MUST be read
// back in UTC — read it in any other zone and it moves.
//
// An INSTANT is a moment that happened. createdAt, sentAt, an audit entry, a
// tracking ping. It is one point on the world's timeline and every viewer should
// see it as the same US business clock, whatever machine they are sitting at.
//
// ── The bug this exists to kill ──────────────────────────────────────────────
// A <input type="date"> submits "2026-03-15". `new Date("2026-03-15")` is UTC
// midnight. `toLocaleDateString()` renders in the VIEWER's zone — so in New York
// (UTC−4) that instant is 8pm on the 14th, and the invoice prints a day early.
// The same code on a machine in India (UTC+5:30) shows the 15th, which is why
// the fault survives development and only appears once somebody in the States
// looks at it.
//
// The mirror image is just as bad: `new Date().toISOString().slice(0, 10)` — the
// usual way to fill a date input with "today" — returns TOMORROW's date for
// anyone east of Greenwich after their evening, and YESTERDAY's for anyone in
// the Americas after 7pm.
//
// So: calendar dates are read in UTC, instants are rendered in the business
// zone, and neither one ever goes through toISOString() to reach a date input.
// client/src/utils/dates.js is the mirror of this file — change both.
// ─────────────────────────────────────────────────────────────────────────────

// Where the business keeps its clock. Every instant is shown in this zone, so a
// dispatcher in Newark and a developer in Pune reading the same audit trail see
// the same times and can talk about them without converting.
//
// One zone rather than per-branch: a load's history has to read as one sequence,
// and a timeline that switches zone halfway through because a Los Angeles branch
// touched it is unreadable. A branch in another zone shows Eastern, labelled.
const BUSINESS_TIME_ZONE = "America/New_York";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** A Date, or null for anything that is not one. Never throws, never NaN. */
const toDate = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// ── Calendar dates ────────────────────────────────────────────────────────────

/**
 * A calendar date, anchored at UTC midnight.
 *
 * "2026-03-15" and a Date already at UTC midnight both come back unchanged. A
 * full timestamp is truncated to the calendar day it falls on **in the business
 * zone**, not in UTC — a payment entered at 9pm on the 15th in Newark is
 * 02:00 UTC on the 16th, and filing it under the 16th is how a month-end lands
 * in the wrong month.
 */
const calendarDate = (value) => {
  if (typeof value === "string" && DATE_KEY.test(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }

  const date = toDate(value);
  if (!date) return null;

  return new Date(`${toDateKey(date)}T00:00:00.000Z`);
};

/**
 * The "YYYY-MM-DD" a value belongs to — the only safe thing to put in a date
 * input, and the format the input submits back.
 *
 * A value at exactly UTC midnight is already a calendar date and keeps its day.
 * Anything else is an instant, and is resolved in the business zone.
 */
const toDateKey = (value) => {
  const date = toDate(value);
  if (!date) return "";

  const isUtcMidnight =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;

  // en-CA is ISO-ordered — "2026-03-15" — which is what makes this readable
  // without assembling the parts by hand.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: isUtcMidnight ? "UTC" : BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

/** Today, as a calendar date in the business zone. */
const todayKey = () => toDateKey(new Date());

/** Today at UTC midnight — the default for an invoice or payment date. */
const today = () => calendarDate(todayKey());

/**
 * N days on from a calendar date, still at UTC midnight.
 *
 * Adding 86,400,000 milliseconds to a local-midnight date lands on 23:00 the
 * previous day whenever a DST boundary falls in between. Anchored in UTC there
 * are no DST boundaries to cross, which is the other reason calendar dates are
 * stored this way.
 */
const addDays = (value, days) => {
  const date = calendarDate(value);
  if (!date) return null;

  return new Date(date.getTime() + Number(days || 0) * 86400000);
};

/**
 * Whole calendar days from `from` to `to` — negative when `to` is earlier.
 *
 * Counted between UTC-midnight anchors rather than by dividing a millisecond
 * difference, so "how many days overdue" does not come back one short because
 * the clocks changed in between.
 */
const daysBetween = (from, to) => {
  const a = calendarDate(from);
  const b = calendarDate(to);
  if (!a || !b) return 0;

  return Math.round((b.getTime() - a.getTime()) / 86400000);
};

/** How many days past `dueDate` today is; 0 if it is not yet due. */
const daysOverdue = (dueDate) => {
  const days = daysBetween(dueDate, todayKey());
  return days > 0 ? days : 0;
};

// ── Ranges ────────────────────────────────────────────────────────────────────

/**
 * The window a "from"/"to" pair means for a CALENDAR DATE field — issueDate,
 * dueDate, paidOn.
 *
 * The end is inclusive: somebody asking for "to 31 March" means the whole of the
 * 31st. Both bounds are UTC because that is where the stored values live.
 */
const calendarRange = (from, to) => {
  const range = {};

  const start = calendarDate(from);
  if (start) range.$gte = start;

  const end = calendarDate(to);
  if (end) range.$lte = new Date(end.getTime() + 86400000 - 1);

  return Object.keys(range).length ? range : null;
};

/**
 * The window a "from"/"to" pair means for an INSTANT field — createdAt, sentAt.
 *
 * Bounded by the business day, not the UTC day: a report for "1–31 March" run by
 * the Newark office must not include a load created at 8pm on 28 February, which
 * is what a UTC boundary would sweep in.
 */
const instantRange = (from, to) => {
  const range = {};

  if (from) {
    const start = startOfBusinessDay(from);
    if (start) range.$gte = start;
  }

  if (to) {
    const end = endOfBusinessDay(to);
    if (end) range.$lte = end;
  }

  return Object.keys(range).length ? range : null;
};

/**
 * How far the business zone is from UTC at a given instant, in milliseconds.
 *
 * Derived from Intl rather than hard-coded, because the offset is −5 hours in
 * January and −4 in July, and a constant would put every summer timestamp an
 * hour out.
 */
const zoneOffsetMs = (date) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: BUSINESS_TIME_ZONE,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );

  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    // Intl gives hour 24 for midnight under hour12:false in some engines.
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );

  return asIfUtc - date.getTime();
};

/** The instant at which a given calendar day begins in the business zone. */
const startOfBusinessDay = (value) => {
  const key = toDateKey(value);
  if (!key) return null;

  const [year, month, day] = key.split("-").map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

  // Two passes: the first offset is read at the wrong instant when the guess
  // lands on the far side of a DST change, and re-reading it at the corrected
  // instant settles it.
  const first = new Date(guess.getTime() - zoneOffsetMs(guess));
  return new Date(guess.getTime() - zoneOffsetMs(first));
};

/** The last millisecond of a given calendar day in the business zone. */
const endOfBusinessDay = (value) => {
  const start = startOfBusinessDay(value);
  if (!start) return null;

  const nextDay = startOfBusinessDay(addDays(toDateKey(start), 1));
  return new Date(nextDay.getTime() - 1);
};

// ── Formatting ────────────────────────────────────────────────────────────────

/**
 * A calendar date for a human: "Mar 15, 2026".
 *
 * Read in UTC, which is the whole point — a date rendered in the reader's own
 * zone is a date that changes depending on who is reading it.
 */
const formatDate = (value, { fallback = "—" } = {}) => {
  const date = toDate(value);
  if (!date) return fallback;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(calendarDate(date));
};

/** "03/15/2026" — for the places that want the numeric US form. */
const formatDateNumeric = (value, { fallback = "—" } = {}) => {
  const date = toDate(value);
  if (!date) return fallback;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(calendarDate(date));
};

/**
 * An instant for a human, on the US business clock:
 * "Mar 15, 2026, 3:42 PM EDT".
 *
 * The zone abbreviation is not decoration. Without it a timestamp is a number
 * two people in different places will read as two different moments, and the
 * whole reason for pinning the zone was to stop that.
 */
const formatDateTime = (value, { fallback = "—", seconds = false } = {}) => {
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
const formatTime = (value, { fallback = "—" } = {}) => {
  const date = toDate(value);
  if (!date) return fallback;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
};

module.exports = {
  BUSINESS_TIME_ZONE,
  toDate,
  calendarDate,
  toDateKey,
  todayKey,
  today,
  addDays,
  daysBetween,
  daysOverdue,
  calendarRange,
  instantRange,
  startOfBusinessDay,
  endOfBusinessDay,
  formatDate,
  formatDateNumeric,
  formatDateTime,
  formatTime,
};
