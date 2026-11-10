// The whole point of the tenancy work: one location must never see another's
// data, and the enforcement must hold without each query asking for it.

const { connect, closeDatabase, clearDatabase } = require("./setupReplSet");
const { withTenant: runWithTenant, runUnscoped } = require("../utils/tenantContext");
const { resetBranchCodeCache } = require("../utils/sequence");

const Branch = require("../models/Branch");
const Load = require("../models/Load");
const Customer = require("../models/Customer");
const FleetOwner = require("../models/FleetOwner");

beforeAll(async () => await connect());
afterEach(async () => {
  await clearDatabase();
  resetBranchCodeCache(); // codes are cached per process; the DB just went away
});
afterAll(async () => await closeDatabase());

let ny;
let chi;

const newLoad = (overrides = {}) => ({
  createdBy: "staff",
  customer: new (require("mongoose").Types.ObjectId)(),
  truckType: "Container",
  material: "Boxes",
  amount: 100,
  ...overrides,
});

beforeEach(async () => {
  await runUnscoped(async () => {
    ny = await Branch.create({ name: "New York", code: "NY" });
    chi = await Branch.create({ name: "Chicago", code: "CHI" });
  });
});

describe("Write stamping", () => {
  it("stamps the active location onto anything created in context", async () => {
    const load = await runWithTenant({ locationId: String(ny._id) }, () =>
      Load.create(newLoad()),
    );
    expect(String(load.locationId)).toBe(String(ny._id));
  });

  it("refuses to create tenant data with no location context", async () => {
    await expect(Load.create(newLoad())).rejects.toThrow(/Tenant scope missing/i);
  });

  it("refuses to query tenant data with no location context", async () => {
    await expect(Load.find()).rejects.toThrow(/Tenant scope missing/i);
  });
});

describe("Read isolation", () => {
  beforeEach(async () => {
    await runWithTenant({ locationId: String(ny._id) }, async () => {
      await Load.create(newLoad({ material: "NY-cargo-1" }));
      await Load.create(newLoad({ material: "NY-cargo-2" }));
    });
    await runWithTenant({ locationId: String(chi._id) }, async () => {
      await Load.create(newLoad({ material: "CHI-cargo-1" }));
    });
  });

  it("find() returns only the active location's rows", async () => {
    const nyLoads = await runWithTenant({ locationId: String(ny._id) }, () =>
      Load.find(),
    );
    expect(nyLoads).toHaveLength(2);
    expect(nyLoads.every((l) => String(l.locationId) === String(ny._id))).toBe(true);

    const chiLoads = await runWithTenant({ locationId: String(chi._id) }, () =>
      Load.find(),
    );
    expect(chiLoads).toHaveLength(1);
  });

  it("countDocuments() is scoped", async () => {
    const count = await runWithTenant({ locationId: String(chi._id) }, () =>
      Load.countDocuments(),
    );
    expect(count).toBe(1);
  });

  it("findById cannot reach across locations", async () => {
    const [nyLoad] = await runWithTenant({ locationId: String(ny._id) }, () =>
      Load.find(),
    );

    const stolen = await runWithTenant({ locationId: String(chi._id) }, () =>
      Load.findById(nyLoad._id),
    );
    expect(stolen).toBeNull();
  });

  it("a handler cannot widen its own scope by passing another locationId", async () => {
    // Asking for New York's rows from a Chicago context does not error — the
    // injected filter simply overrides the supplied one, so the caller gets
    // their own location back. What matters is that nothing from NY appears.
    const rows = await runWithTenant({ locationId: String(chi._id) }, () =>
      Load.find({ locationId: ny._id }),
    );
    expect(rows.every((r) => String(r.locationId) === String(chi._id))).toBe(true);
    expect(rows.some((r) => String(r.locationId) === String(ny._id))).toBe(false);
  });

  it("aggregate() is scoped too", async () => {
    const rows = await runWithTenant({ locationId: String(ny._id) }, () =>
      Load.aggregate([{ $group: { _id: null, n: { $sum: 1 } } }]),
    );
    expect(rows[0].n).toBe(2);
  });

  it("updateMany cannot touch another location's rows", async () => {
    await runWithTenant({ locationId: String(chi._id) }, () =>
      Load.updateMany({}, { $set: { material: "OVERWRITTEN" } }),
    );

    const nyLoads = await runWithTenant({ locationId: String(ny._id) }, () =>
      Load.find(),
    );
    expect(nyLoads.every((l) => l.material !== "OVERWRITTEN")).toBe(true);
  });

  it("deleteMany cannot remove another location's rows", async () => {
    await runWithTenant({ locationId: String(chi._id) }, () => Load.deleteMany({}));

    const nyCount = await runWithTenant({ locationId: String(ny._id) }, () =>
      Load.countDocuments(),
    );
    expect(nyCount).toBe(2);
  });
});

describe("Multi-location users", () => {
  beforeEach(async () => {
    await runWithTenant({ locationId: String(ny._id) }, () => Load.create(newLoad()));
    await runWithTenant({ locationId: String(chi._id) }, () => Load.create(newLoad()));
  });

  it("sees the union of exactly the locations they belong to", async () => {
    const both = await runWithTenant(
      { locationIds: [String(ny._id), String(chi._id)] },
      () => Load.find(),
    );
    expect(both).toHaveLength(2);
  });

  it("still excludes locations they do not belong to", async () => {
    let other;
    await runUnscoped(async () => {
      other = await Branch.create({ name: "Dallas", code: "DAL" });
    });
    await runWithTenant({ locationId: String(other._id) }, () =>
      Load.create(newLoad()),
    );

    const visible = await runWithTenant(
      { locationIds: [String(ny._id), String(chi._id)] },
      () => Load.find(),
    );
    expect(visible).toHaveLength(2); // not 3
  });
});

describe("Per-location ID sequences", () => {
  it("numbers loads once across the business, with no branch code", async () => {
    // A load number is read aloud all day, so it carries no branch letters —
    // which means the number itself has to be unique everywhere, or two
    // branches would both issue LD 0001 and the second would fail the unique
    // index. See utils/sequence.js.
    const a = await runWithTenant({ locationId: String(ny._id) }, () =>
      Load.create(newLoad()),
    );
    const b = await runWithTenant({ locationId: String(ny._id) }, () =>
      Load.create(newLoad()),
    );
    const c = await runWithTenant({ locationId: String(chi._id) }, () =>
      Load.create(newLoad()),
    );

    expect(a.loadId).toBe("LD 0001");
    expect(b.loadId).toBe("LD 0002");
    // Chicago continues the same count rather than starting its own.
    expect(c.loadId).toBe("LD 0003");
  });

  it("numbers carrier codes business-wide too, with no branch prefix", async () => {
    const fo = await runWithTenant({ locationId: String(chi._id) }, () =>
      FleetOwner.create({ carrierName: "Windy City Haulage" }),
    );
    expect(fo.fleetOwnerCode).toBe("SLINE 00001");
  });

});

// Customers, carriers, stop companies, street-turn partners, shipping lines and
// chassis companies are offered at the locations picked on each record
// (`availableAt`). Drivers, onboarding and addresses are one shared list.
describe("Shared models", () => {
  const mongoose = require("mongoose");
  const Driver = require("../models/Driver");
  const Address = require("../models/common/Address");
  const ShippingLine = require("../models/ShippingLine");
  const Bid = require("../models/bidSchema");
  const TrackingEvent = require("../models/TrackingEvent");
  const allMode = () => ({
    locationIds: [String(ny._id), String(chi._id)],
    allLocations: true,
  });
  const at = (branch, fn) => runWithTenant({ locationId: String(branch._id) }, fn);

  it("offers a new record only where it was added, unless told otherwise", async () => {
    const created = await at(ny, () =>
      Customer.create({ user: new mongoose.Types.ObjectId(), customerName: "NY Client" }),
    );
    expect(String(created.locationId)).toBe(String(ny._id));
    expect(created.availableAt.map(String)).toEqual([String(ny._id)]);

    expect(await at(ny, () => Customer.find())).toHaveLength(1);
    expect(await at(chi, () => Customer.find())).toHaveLength(0);
  });

  it("lists a record at every location it is available at", async () => {
    await at(ny, () =>
      ShippingLine.create({ name: "Maersk", availableAt: [ny._id, chi._id] }),
    );
    await at(ny, () => ShippingLine.create({ name: "MSC" }));

    expect((await at(chi, () => ShippingLine.find())).map((l) => l.name)).toEqual(["Maersk"]);
    expect(await at(ny, () => ShippingLine.countDocuments())).toBe(2);
    // A caller's own $or is kept alongside the location filter.
    const either = await at(chi, () =>
      ShippingLine.find({ $or: [{ name: "Maersk" }, { name: "MSC" }] }),
    );
    expect(either.map((l) => l.name)).toEqual(["Maersk"]);
    const agg = await at(chi, () => ShippingLine.aggregate([{ $match: {} }]));
    expect(agg).toHaveLength(1);
  });

  it("still opens a record by id where it is not offered", async () => {
    const line = await at(ny, () => ShippingLine.create({ name: "CMA CGM" }));
    expect(await at(chi, () => ShippingLine.findById(line._id))).not.toBeNull();
    expect(await at(chi, () => ShippingLine.find({ _id: { $ne: line._id } }))).toHaveLength(0);
  });

  it("treats records from before the choice as available where they were added", async () => {
    await runUnscoped(() =>
      ShippingLine.collection.insertOne({ name: "Legacy", locationId: chi._id }),
    );
    expect(await at(chi, () => ShippingLine.find())).toHaveLength(1);
    expect(await at(ny, () => ShippingLine.find())).toHaveLength(0);
  });

  it("lets another location open, update and populate a carrier", async () => {
    const fo = await runWithTenant({ locationId: String(ny._id) }, async () => {
      const address = await Address.create({ city: "Newark" });
      return FleetOwner.create({ carrierName: "Empire Haul", addresses: [address._id] });
    });
    await runWithTenant({ locationId: String(ny._id) }, () =>
      Driver.create({ fleetOwner: fo._id, name: "Sam" }),
    );

    await runWithTenant({ locationId: String(chi._id) }, async () => {
      const found = await FleetOwner.findById(fo._id).populate("addresses");
      expect(found.addresses[0].city).toBe("Newark");
      await FleetOwner.updateOne({ _id: fo._id }, { phone: "555" });
      expect(await Driver.countDocuments({ fleetOwner: fo._id })).toBe(1);
    });
    const updated = await runUnscoped(() => FleetOwner.findById(fo._id).lean());
    expect(updated.phone).toBe("555");
  });

  it("can be created while viewing all locations once locations are picked", async () => {
    await expect(
      runWithTenant(allMode(), () => FleetOwner.create({ carrierName: "Nowhere Freight" })),
    ).rejects.toMatchObject({ code: "AVAILABILITY_REQUIRED" });

    const fo = await runWithTenant(allMode(), () =>
      FleetOwner.create({ carrierName: "Anywhere Freight", availableAt: [chi._id, ny._id] }),
    );
    // Filed under the first location picked, so its code has a counter.
    expect(String(fo.locationId)).toBe(String(chi._id));
    expect(fo.fleetOwnerCode).toBeTruthy();
  });

  it("can share a driver or address without a location in play", async () => {
    const address = await runWithTenant(allMode(), () => Address.create({ city: "Gary" }));
    expect(address.locationId).toBeUndefined();
  });

  it("files a record written in all-locations mode under its load's location", async () => {
    const load = await runWithTenant({ locationId: String(chi._id) }, () =>
      Load.create(newLoad()),
    );
    const event = await runWithTenant(allMode(), () =>
      TrackingEvent.create({
        load: load._id,
        loadId: load.loadId,
        user: new mongoose.Types.ObjectId(),
        coordinates: { latitude: 40, longitude: -74 },
      }),
    );
    expect(String(event.locationId)).toBe(String(chi._id));

    const [bid] = await runWithTenant(allMode(), () =>
      Bid.insertMany([
        { loadId: load._id, fleetOwnerId: new mongoose.Types.ObjectId(), amount: 10 },
      ]),
    );
    expect(String(bid.locationId)).toBe(String(chi._id));
  });

  it("still refuses an all-locations write with no load to take a location from", async () => {
    await expect(
      runWithTenant(allMode(), () => Load.create(newLoad())),
    ).rejects.toMatchObject({ code: "ALL_LOCATIONS_READ_ONLY" });
  });
});

describe("Escape hatches", () => {
  beforeEach(async () => {
    await runWithTenant({ locationId: String(ny._id) }, () => Load.create(newLoad()));
    await runWithTenant({ locationId: String(chi._id) }, () => Load.create(newLoad()));
  });

  it("runUnscoped sees every location — for cron and migrations", async () => {
    const all = await runUnscoped(() => Load.find());
    expect(all).toHaveLength(2);
  });

  it("skipTenantScope lifts the filter for a single call", async () => {
    const all = await runWithTenant({ locationId: String(ny._id) }, () =>
      Load.find().setOptions({ skipTenantScope: true }),
    );
    expect(all).toHaveLength(2);
  });
});

describe("Before any location exists", () => {
  // An administrator on a fresh install. They reach every *active* branch by
  // role, so with none created their set is empty — and every screen they land
  // on queries tenant data. Throwing there meets them with a stack trace when
  // what they need is the Locations screen.
  const noLocations = { locationIds: [], noLocations: true };

  beforeEach(async () => {
    // Seeded under a real branch, so an empty result has to be the scope's
    // doing rather than an empty database.
    await runWithTenant({ locationId: String(ny._id) }, () => Load.create(newLoad()));
  });

  it("reads come back empty instead of throwing", async () => {
    const loads = await runWithTenant(noLocations, () => Load.find());
    expect(loads).toHaveLength(0);
  });

  it("counts and aggregations come back empty too", async () => {
    const count = await runWithTenant(noLocations, () => Load.countDocuments());
    expect(count).toBe(0);

    const grouped = await runWithTenant(noLocations, () =>
      Load.aggregate([{ $group: { _id: null, total: { $sum: "$amount" } } }]),
    );
    expect(grouped).toEqual([]);
  });

  it("does NOT fall back to showing every location", async () => {
    // The failure that would matter: treating "no locations" as "unscoped"
    // would show a fresh admin every branch's data, which is the one thing the
    // whole mechanism exists to prevent.
    await runWithTenant({ locationId: String(chi._id) }, () => Load.create(newLoad()));

    const loads = await runWithTenant(noLocations, () => Load.find());
    expect(loads).toHaveLength(0);
  });

  it("refuses a write, naming the fix", async () => {
    // There is genuinely nowhere to file the record, so this one does fail —
    // but as a 400 the user can act on, not a 500.
    await expect(
      runWithTenant(noLocations, () => Load.create(newLoad())),
    ).rejects.toMatchObject({
      status: 400,
      code: "NO_LOCATION_EXISTS",
      message: expect.stringMatching(/Locations screen/i),
    });
  });

  it("still throws for code that simply forgot the context", async () => {
    // "No locations exist" and "somebody forgot to wrap this" are different
    // faults, and only the first is a normal state.
    await expect(Load.find()).rejects.toThrow(/Tenant scope missing/i);
  });
});
