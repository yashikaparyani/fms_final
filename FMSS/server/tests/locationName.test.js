// Location names are stored in one style, whatever was typed.

const { normalizeLocationName } = require("../utils/locationName");

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
