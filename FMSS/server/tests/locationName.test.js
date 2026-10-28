// Location names are stored in one style, whatever was typed.

const {
  normalizeLocationName,
  codeFromName,
  uniqueLocationCode,
} = require("../utils/locationName");

describe("codeFromName", () => {
  it.each([
    ["Oakland-Rail Operations", "ORO"],
    ["Rail Operational - LA", "ROLA"],
    ["Long Beach Port Work", "LBPW"],
    ["Head Office", "HO"],
    ["New York", "NY"],
    ["Oakland", "OAK"],
    ["NY", "NY"],
  ])("%s → %s", (name, code) => {
    expect(codeFromName(name)).toBe(code);
  });

  it("always fits the 2-5 letters/numbers rule", () => {
    for (const name of ["A", "Q", "one two three four five six seven", "  ", "x-y"]) {
      expect(codeFromName(name)).toMatch(/^[A-Z0-9]{2,5}$/);
    }
  });
});

describe("uniqueLocationCode", () => {
  it("numbers a code that is already taken", async () => {
    const taken = new Set(["OAK", "OAK2"]);
    const isTaken = async (code) => taken.has(code);
    expect(await uniqueLocationCode("Oakland", isTaken)).toBe("OAK3");
  });

  it("stays within five characters when numbering", async () => {
    const isTaken = async (code) => code === "LBPWX";
    expect(await uniqueLocationCode("Long Beach Port Work Xtra", isTaken)).toBe("LBPW2");
  });
});

describe("normalizeLocationName", () => {
  it.each([
    ["OAKLAND-RAIL OPERATIONS", "Oakland-Rail Operations"],
    ["RAIL OPERATIONAL -LA", "Rail Operational - LA"],
    ["long beach port work", "Long Beach Port Work"],
    ["Head Office", "Head Office"],
    ["new york", "New York"],
    ["  port   OF oakland ", "Port of Oakland"],
    ["the yard", "The Yard"],
    ["ny branch", "NY Branch"],
    ["rail yard in oakland", "Rail Yard in Oakland"],
  ])("%s → %s", (typed, stored) => {
    expect(normalizeLocationName(typed)).toBe(stored);
  });

  it("leaves a non-string alone", () => {
    expect(normalizeLocationName(undefined)).toBeUndefined();
  });
});
