const { yardAge, YARD_STATUSES } = require("../utils/yardAge");
const { addDays, todayKey, calendarDate } = require("../utils/dates");

const daysAgo = (n) => addDays(calendarDate(todayKey()), -n);

describe("yardAge", () => {
  it("covers the three parked statuses and nothing else", () => {
    expect(YARD_STATUSES).toEqual(["EMPTY_IN_YARD", "LOADED_IN_YARD", "DROP_IN_WAREHOUSE"]);
    expect(yardAge({ transportStatus: "DELIVERED", updatedAt: daysAgo(3) })).toBeNull();
  });

  it("counts from when the load last entered its current status", () => {
    const load = {
      transportStatus: "LOADED_IN_YARD",
      // An unrelated edit yesterday must not reset the age.
      updatedAt: daysAgo(1),
      transportStatusHistory: [
        { status: "LOADED_IN_YARD", changedAt: daysAgo(40) },
        { status: "IN_TRANSIT", changedAt: daysAgo(30) },
        { status: "LOADED_IN_YARD", changedAt: daysAgo(12) },
      ],
    };
    expect(yardAge(load).days).toBe(12);
  });

  it("falls back to updatedAt for a load older than the history", () => {
    expect(yardAge({ transportStatus: "EMPTY_IN_YARD", updatedAt: daysAgo(5) }).days).toBe(5);
  });

  it("reads 0 for a box put down today", () => {
    const load = {
      transportStatus: "DROP_IN_WAREHOUSE",
      transportStatusHistory: [{ status: "DROP_IN_WAREHOUSE", changedAt: new Date() }],
    };
    expect(yardAge(load).days).toBe(0);
  });
});
