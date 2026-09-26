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

// ── The clock every instant is shown on ──────────────────────────────────────
// This is the viewer's own timezone, taken from their device at sign-in — the
// same thing their computer's clock shows. A dispatcher in California sees
// Pacific time, one on the East Coast sees Eastern, and the header names which,
// so "3:00 PM" on a load is never ambiguous. Nothing is hardcoded to one US zone
// any more: the zone is resolved at runtime and can be set from the account.
//
// Calendar dates (a pickup date, a due date — a day with no time) are still read
// in UTC, deliberately: "15 March" is 15 March everywhere and must not shift by
// who is looking. Only INSTANTS (a time on the clock — createdAt, a tracking
// ping, a bid deadline) follow this zone.

// Used only when the device cannot be read (very old browsers) — a sane US
// default rather than throwing.
const DEFAULT_TIME_ZONE = "America/New_York";

/** The device's IANA timezone, e.g. "America/Los_Angeles". */
const deviceTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
};

const isValidZone = (tz) => {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

// Resolved once at load from what was captured at the last sign-in, falling back
// to the device. setActiveTimeZone (called on sign-in) keeps it and localStorage
// in step so a reload shows the same clock before login runs again.
let activeTimeZone = (() => {
  try {
    const saved = localStorage.getItem("timeZone");
    if (isValidZone(saved)) return saved;
  } catch {
    /* private mode / blocked storage */
  }
  return deviceTimeZone();
})();

/** The timezone every instant in the app is currently shown in. */
export const getActiveTimeZone = () => activeTimeZone;

/** Capture the device's timezone as the active one — call this on sign-in. */
export const captureDeviceTimeZone = () => setActiveTimeZone(deviceTimeZone());

/** Set the active timezone (validated) and remember it across reloads. */
export const setActiveTimeZone = (tz) => {
  if (!isValidZone(tz)) return activeTimeZone;
  activeTimeZone = tz;
  try {
    localStorage.setItem("timeZone", tz);
  } catch {
    /* storage may be unavailable; the in-memory value still applies */
  }
  return activeTimeZone;
};

// Back-compat: older imports expect a constant. It now names the *default*, not
// the active zone — new code calls getActiveTimeZone() instead.
export const BUSINESS_TIME_ZONE = DEFAULT_TIME_ZONE;

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
    timeZone: isUtcMidnight ? "UTC" : getActiveTimeZone(),
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

// ── Date-and-time inputs ──────────────────────────────────────────────────────
// A <input type="datetime-local"> holds a bare wall-clock time, "2026-03-15T14:30",
// and the browser reads it in the VIEWER's zone. Filled with getHours() and read
// back with `new Date(value)`, a bid window typed in Pune lands 9½ hours away from
// the one a dispatcher in Newark meant. Both directions go through the business
// zone instead, so the box shows — and means — US time for everybody.

const zoneParts = (date) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: getActiveTimeZone(),
      hourCycle: "h23",
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

/** An instant as a datetime-local value on the business clock: "2026-03-15T14:30". */
export const toDateTimeInput = (value) => {
  const date = toDate(value);
  if (!date) return "";
  const p = zoneParts(date);
  return `${p.year}-${p.month}-${p.day}T${String(Number(p.hour) % 24).padStart(2, "0")}:${p.minute}`;
};

/**
 * The instant a datetime-local value means on the business clock, or null.
 * Two passes so a value either side of a DST change settles on the right offset.
 */
export const fromDateTimeInput = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || "");
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);

  const offsetAt = (ms) => {
    const p = zoneParts(new Date(ms));
    return (
      Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - ms
    );
  };

  const first = wall - offsetAt(wall);
  return new Date(wall - offsetAt(first));
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
 * An instant on the viewer's own clock: "Mar 15, 2026, 3:42 PM PDT".
 *
 * The zone abbreviation is not decoration — it names which clock the time is on,
 * so a person on Pacific and one on Eastern reading the same timestamp each know
 * what it means to them.
 */
export const formatDateTime = (value, { fallback = "—", seconds = false } = {}) => {
  const date = toDate(value);
  if (!date) return fallback;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: getActiveTimeZone(),
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" } : {}),
    timeZoneName: "short",
  }).format(date);
};

/** Just the clock part of an instant, on the viewer's zone: "3:42 PM PDT". */
export const formatTime = (value, { fallback = "—" } = {}) => {
  const date = toDate(value);
  if (!date) return fallback;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: getActiveTimeZone(),
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
