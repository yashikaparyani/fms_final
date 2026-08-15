// Every fleet owner must get a unique, permanent, human-readable code. Since
// the move to multiple locations the code carries its branch: NY-FO-0001.
//
// Carrier accounts are opened by the office; there is no self-registration, so
// the staff-created path is the only one that issues a code.

// Code issuing runs in a transaction, so this suite needs a replica set.
const { connect, closeDatabase, clearDatabase } = require("./setupReplSet");
const { withTenant, runUnscoped } = require("../utils/tenantContext");
const { resetBranchCodeCache } = require("../utils/sequence");
const Branch = require("../models/Branch");
const FleetOwner = require("../models/FleetOwner");

beforeAll(async () => await connect());
afterEach(async () => {
  await clearDatabase();
  resetBranchCodeCache();
});
afterAll(async () => await closeDatabase());

let ny;

beforeEach(async () => {
  // Exactly one active branch, so public signup can infer it without a picker.
  ny = await Branch.create({ name: "New York", code: "NY" });
});

/** Create inside NY's tenant context, the way a real request would. */
const inNy = (fn) => withTenant({ locationId: String(ny._id) }, fn);

describe("Fleet owner code", () => {
  it("assigns NY-FO-0001 to the first fleet owner in a location", async () => {
    const fo = await inNy(() => FleetOwner.create({ carrierName: "First Carrier" }));
    expect(fo.fleetOwnerCode).toBe("NY-FO-0001");
  });

  it("increments and never repeats across many creations", async () => {
    const created = [];
    for (let i = 0; i < 12; i++) {
      created.push(await inNy(() => FleetOwner.create({ carrierName: `Carrier ${i}` })));
    }

    const codes = created.map((f) => f.fleetOwnerCode);
    expect(codes[0]).toBe("NY-FO-0001");
    expect(codes[11]).toBe("NY-FO-0012");
    expect(new Set(codes).size).toBe(12); // all distinct
  });

  it("zero-pads to four digits", async () => {
    const fo = await inNy(() => FleetOwner.create({ carrierName: "Padded" }));
    expect(fo.fleetOwnerCode).toMatch(/^NY-FO-\d{4}$/);
  });

  it("does not change the code when the record is edited later", async () => {
    const fo = await inNy(() => FleetOwner.create({ carrierName: "Stable Co" }));
    const original = fo.fleetOwnerCode;

    await inNy(async () => {
      fo.carrierName = "Renamed Co";
      await fo.save();
    });

    const reloaded = await runUnscoped(() => FleetOwner.findById(fo._id));
    expect(reloaded.fleetOwnerCode).toBe(original);
  });
});
