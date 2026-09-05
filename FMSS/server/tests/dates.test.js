// Dates and timezones.
//
// The bug every case here exists to prevent is the same one: a calendar date
// that reads as a different day depending on who is looking at it. It survives
// development on a machine east of Greenwich and only appears once somebody in
// the States opens the invoice, which is why it is pinned down by tests rather
// than by trying it and seeing.

const {
  calendarDate,
  toDateKey,
  todayKey,
  addDays,
  daysBetween,
  calendarRange,
  instantRange,
  startOfBusinessDay,
  endOfBusinessDay,
  formatDate,
  formatDateNumeric,
  formatDateTime,
} = require("../utils/dates");

describe("A calendar date is the same day for everyone", () => {
  it("stores what a date input submitted, at UTC midnight", () => {
    expect(calendarDate("2026-03-15").toISOString()).toBe("2026-03-15T00:00:00.000Z");
  });

  it("displays the day that was entered", () => {
    // The whole point. Read in the viewer's zone this is 14 March in New York.
    expect(formatDate("2026-03-15")).toBe("Mar 15, 2026");
    expect(formatDateNumeric("2026-03-15")).toBe("03/15/2026");
  });

  it("round-trips back into a date input unchanged", () => {
    expect(toDateKey(calendarDate("2026-03-15"))).toBe("2026-03-15");
  });

  it("survives a value that arrives as a Date rather than a string", () => {
    expect(toDateKey(new Date("2026-03-15T00:00:00.000Z"))).toBe("2026-03-15");
  });

  it("files an evening instant under the business day it happened on", () => {
    // 9pm on the 15th in Newark is 01:00 UTC on the 16th. Filing it under the
    // 16th puts a month-end payment in the wrong month.
    expect(toDateKey("2026-03-16T01:00:00.000Z")).toBe("2026-03-15");
  });

  it("returns empty rather than throwing on rubbish", () => {
    expect(toDateKey(null)).toBe("");
    expect(toDateKey("not a date")).toBe("");
    expect(formatDate(undefined)).toBe("—");
  });
});

describe("Date arithmetic does not drift across a DST change", () => {
  it("adds days over the US spring-forward weekend", () => {
    // Adding 7 × 86,400,000ms to a local-midnight date lands on 23:00 the
    // previous day here. Anchored in UTC there is no boundary to cross.
    expect(toDateKey(addDays("2026-03-07", 7))).toBe("2026-03-14");
  });

  it("adds days over the US fall-back weekend", () => {
    expect(toDateKey(addDays("2026-10-31", 7))).toBe("2026-11-07");
  });

  it("works out Net 30 from the first of a month", () => {
    expect(toDateKey(addDays("2026-03-01", 30))).toBe("2026-03-31");
  });

  it("counts whole days between dates spanning a DST change", () => {
    expect(daysBetween("2026-03-07", "2026-03-14")).toBe(7);
    expect(daysBetween("2026-10-31", "2026-11-07")).toBe(7);
  });

  it("counts backwards as a negative", () => {
    expect(daysBetween("2026-03-14", "2026-03-07")).toBe(-7);
  });
});

describe("Range filters", () => {
  it("makes a calendar range inclusive of its last day", () => {
    // "to 31 March" means the whole of the 31st, not midnight at its start.
    const range = calendarRange("2026-03-01", "2026-03-31");

    expect(range.$gte.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(range.$lte.toISOString()).toBe("2026-03-31T23:59:59.999Z");
  });

  it("bounds an instant range by the business day, not the UTC day", () => {
    // A load created at 8pm on 28 February in Newark must not fall into a
    // report for March, which a UTC boundary would sweep it into.
    const range = instantRange("2026-03-01", "2026-03-31");

    expect(range.$gte.toISOString()).toBe("2026-03-01T05:00:00.000Z"); // EST
    expect(range.$lte.toISOString()).toBe("2026-04-01T03:59:59.999Z"); // EDT
  });

  it("accepts one bound without the other", () => {
    expect(calendarRange("2026-03-01", null).$lte).toBeUndefined();
    expect(calendarRange(null, "2026-03-31").$gte).toBeUndefined();
    expect(calendarRange(null, null)).toBeNull();
  });
});

describe("Business-day boundaries follow daylight saving", () => {
  it("opens at 05:00 UTC in winter and 04:00 in summer", () => {
    expect(startOfBusinessDay("2026-01-15").toISOString()).toBe(
      "2026-01-15T05:00:00.000Z",
    );
    expect(startOfBusinessDay("2026-07-15").toISOString()).toBe(
      "2026-07-15T04:00:00.000Z",
    );
  });

  it("closes one millisecond before the next day opens", () => {
    const end = endOfBusinessDay("2026-03-15");
    const nextStart = startOfBusinessDay("2026-03-16");

    expect(nextStart.getTime() - end.getTime()).toBe(1);
  });

  it("handles the 23-hour day the clocks change on", () => {
    // 8 March 2026 is 23 hours long in America/New_York.
    const start = startOfBusinessDay("2026-03-08");
    const end = endOfBusinessDay("2026-03-08");

    expect(Math.round((end.getTime() - start.getTime() + 1) / 3600000)).toBe(23);
  });
});

describe("Instants render on the US business clock", () => {
  it("names the zone, so two readers cannot disagree about the moment", () => {
    expect(formatDateTime("2026-03-15T19:42:00.000Z")).toBe(
      "Mar 15, 2026, 3:42 PM EDT",
    );
  });

  it("switches abbreviation with daylight saving", () => {
    expect(formatDateTime("2026-01-15T19:42:00.000Z")).toBe(
      "Jan 15, 2026, 2:42 PM EST",
    );
  });
});

describe("Today", () => {
  it("is a plain YYYY-MM-DD a date input accepts", () => {
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("agrees with the business zone rather than the host's clock", () => {
    // The failure this guards: new Date().toISOString().slice(0,10) returns
    // tomorrow for a host east of Greenwich in its evening.
    const expected = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    expect(todayKey()).toBe(expected);
  });
});
