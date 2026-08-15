// Timezone helpers for date-bucketed stats.
//
// "Today" has to be resolved in the viewer's timezone, not the server's and not
// UTC: a load whose last free date is tonight in Los Angeles must not read as
// tomorrow's problem just because the API happens to run in UTC. The client
// sends its IANA zone (`?tz=`) and every day boundary below is derived from it.

/** Fall back to UTC rather than throwing on a missing or bogus zone name. */
const resolveTimeZone = (tz) => {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
};

/**
 * The UTC instant matching a wall-clock time in `timeZone`.
 * `localISO` is a bare ISO string with no offset, e.g. "2026-08-12T00:00:00".
 */
const utcFromLocal = (localISO, timeZone) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    // h23 rather than hour12:false — some ICU builds render midnight as "24"
    // under the latter, which lands the instant a full day out.
    hourCycle: "h23",
  });

  // Read the bare string as if it were UTC, see what that instant looks like in
  // the target zone, then shift by the difference to cancel the offset out.
  const guess = new Date(`${localISO}Z`);
  const parts = {};
  formatter.formatToParts(guess).forEach(({ type, value }) => {
    if (type !== "literal") parts[type] = value;
  });
  const asSeenInZone = new Date(
    `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`,
  );
  return new Date(guess.getTime() - (asSeenInZone.getTime() - guess.getTime()));
};

/** Calendar date `offsetDays` from today in `timeZone`, as "YYYY-MM-DD". */
const dateStringInTz = (timeZone, offsetDays = 0) => {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  // Date.UTC handles month/year rollover; formatting the result back through
  // the zone would not — that shifts the date a day for negative offsets.
  const [year, month, day] = today.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + offsetDays))
    .toISOString()
    .slice(0, 10);
};

/**
 * UTC bounds of a calendar day in `timeZone`, as a half-open [start, end)
 * range — half-open so a timestamp at 23:59:59.999 cannot fall in two days.
 */
const dayRangeInTz = (timeZone, offsetDays = 0) => {
  const dateStr = dateStringInTz(timeZone, offsetDays);
  const nextStr = dateStringInTz(timeZone, offsetDays + 1);

  return {
    dateStr,
    start: utcFromLocal(`${dateStr}T00:00:00`, timeZone),
    end: utcFromLocal(`${nextStr}T00:00:00`, timeZone),
  };
};

module.exports = { resolveTimeZone, utcFromLocal, dateStringInTz, dayRangeInTz };
