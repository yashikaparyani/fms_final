// Every fleet owner must get a unique, permanent, human-readable code:
// "SLINE 00001". It carries no branch letters — it is quoted on paperwork and
// read down the phone constantly — which is exactly why the number itself has
// to be unique across the whole business rather than per location.
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
  it("assigns SLINE 00001 to the first fleet owner", async () => {
    const fo = await inNy(() => FleetOwner.create({ carrierName: "First Carrier" }));
    expect(fo.fleetOwnerCode).toBe("SLINE 00001");
  });

  it("increments and never repeats across many creations", async () => {
    const created = [];
    for (let i = 0; i < 12; i++) {
      created.push(await inNy(() => FleetOwner.create({ carrierName: `Carrier ${i}` })));
    }

    const codes = created.map((f) => f.fleetOwnerCode);
    expect(codes[0]).toBe("SLINE 00001");
    expect(codes[11]).toBe("SLINE 00012");
    expect(new Set(codes).size).toBe(12); // all distinct
  });

  it("zero-pads to five digits", async () => {
    const fo = await inNy(() => FleetOwner.create({ carrierName: "Padded" }));
    expect(fo.fleetOwnerCode).toMatch(/^SLINE \d{5}$/);
  });

  it("counts once across the business, not once per branch", async () => {
    // Two branches issuing their own 00001 would collide on the unique index
    // the moment the branch letters came off the front.
    let chi;
    await runUnscoped(async () => {
      chi = await Branch.create({ name: "Chicago", code: "CHI" });
    });

    const first = await inNy(() => FleetOwner.create({ carrierName: "NY Carrier" }));
    const second = await withTenant({ locationId: String(chi._id) }, () =>
      FleetOwner.create({ carrierName: "Chicago Carrier" }),
    );

    expect(first.fleetOwnerCode).toBe("SLINE 00001");
    expect(second.fleetOwnerCode).toBe("SLINE 00002");
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
