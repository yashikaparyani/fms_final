// An admin in "all locations" mode acting on one carrier is pinned to that
// carrier's location, so creating a driver or equipment is not refused.

const { withTenant, getTenantContext, narrowToLocation } = require("../utils/tenantContext");

describe("narrowToLocation", () => {
  it("pins an all-locations request to one of its own locations", async () => {
    const req = {};
    await withTenant({ locationIds: ["a", "b"], allLocations: true }, async () => {
      expect(narrowToLocation(req, "b")).toBe(true);
      const ctx = getTenantContext();
      expect(ctx.locationId).toBe("b");
      expect(ctx.locationIds).toEqual(["b"]);
      expect(ctx.allLocations).toBe(false);
    });
    expect(req.locationId).toBe("b");
  });

  it("never reaches a location outside the request's own set", async () => {
    await withTenant({ locationIds: ["a"], allLocations: true }, async () => {
      expect(narrowToLocation({}, "z")).toBe(false);
      expect(getTenantContext().allLocations).toBe(true);
    });
  });

  it("does nothing when a single location is already active", async () => {
    await withTenant({ locationId: "a" }, async () => {
      expect(narrowToLocation({}, "b")).toBe(false);
      expect(getTenantContext().locationId).toBe("a");
    });
  });
});
