// A carrier assigned a load from a branch other than their own.
//
// Golden Dream (Oakland-Rail) was given LD 0145 by Head Office and could not see
// it: every read was scoped to their own branch. Their assigned loads must reach
// them from any branch, while the open bid board stays their own branch's.

const mongoose = require("mongoose");
const { connect, closeDatabase, clearDatabase } = require("./setup");
const { withTenant, runWithTenant } = require("../utils/tenantContext");
const { widenForCarrier } = require("../middleware/location");
const { carrierVisibleLoadFilter } = require("../utils/carrierAccount");
const Load = require("../models/Load");
const FleetOwner = require("../models/FleetOwner");
const TrackingEvent = require("../models/TrackingEvent");

const HOME = new mongoose.Types.ObjectId(); // the carrier's branch
const OTHER = new mongoose.Types.ObjectId(); // the branch that assigned the load
const USER = new mongoose.Types.ObjectId();
const CARRIER = new mongoose.Types.ObjectId();

const load = (loadId, locationId, over = {}) => ({
  loadId,
  locationId,
  createdBy: "staff",
  creatorId: new mongoose.Types.ObjectId(),
  customer: new mongoose.Types.ObjectId(),
  truckType: "Container",
  material: "Boxes",
  amount: 1000,
  status: "ASSIGNED",
  transportStatus: "ASSIGNED",
  assignedFleetOwner: { fleetOwnerId: CARRIER, fleetOwnerName: "Golden Dream" },
  ...over,
});

const carrierRequest = async () => {
  const req = {
    user: { _id: USER, role: "fleetOwner" },
    locationIds: [String(HOME)],
    tenantContext: { locationId: String(HOME) },
  };
  await withTenant({ unscoped: true }, () => widenForCarrier(req));
  return req;
};

const inRequest = (req, fn) =>
  new Promise((resolve, reject) =>
    runWithTenant(req.tenantContext, () => fn().then(resolve, reject)),
  );

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

beforeEach(async () => {
  await FleetOwner.collection.insertOne({
    _id: CARRIER,
    userId: USER,
    carrierName: "Golden Dream",
    locationId: HOME,
  });
  await withTenant({ unscoped: true }, () =>
    Load.create([
      load("HOME-ASSIGNED", HOME),
      load("OTHER-ASSIGNED", OTHER),
      load("OTHER-OPEN", OTHER, {
        status: "VERIFIED",
        bidStatus: "OPEN",
        assignedFleetOwner: undefined,
      }),
    ]),
  );
});

describe("A carrier's loads from another branch", () => {
  it("shows assigned loads from every branch", async () => {
    const req = await carrierRequest();
    const rows = await inRequest(req, () =>
      Load.find(carrierVisibleLoadFilter(CARRIER)).lean(),
    );
    expect(rows.map((r) => r.loadId).sort()).toEqual(["HOME-ASSIGNED", "OTHER-ASSIGNED"]);
  });

  it("opens the other branch's load by id", async () => {
    const req = await carrierRequest();
    const target = await withTenant({ unscoped: true }, () =>
      Load.findOne({ loadId: "OTHER-ASSIGNED" }).lean(),
    );
    const found = await inRequest(req, () => Load.findById(target._id).lean());
    expect(found?.loadId).toBe("OTHER-ASSIGNED");
  });

  it("keeps the open board to the carrier's own branch", async () => {
    const req = await carrierRequest();
    const open = await inRequest(req, () =>
      Load.find({
        bidStatus: "OPEN",
        $and: [{ locationId: { $in: req.carrierHomeLocationIds } }],
      }).lean(),
    );
    expect(open).toHaveLength(0);
  });

  it("files a tracking point under the load's branch, not the carrier's", async () => {
    const req = await carrierRequest();
    const target = await withTenant({ unscoped: true }, () =>
      Load.findOne({ loadId: "OTHER-ASSIGNED" }).lean(),
    );
    const event = await inRequest(req, () =>
      TrackingEvent.create({
        load: target._id,
        loadId: target.loadId,
        fleetOwner: CARRIER,
        user: USER,
        coordinates: { latitude: 37.8, longitude: -122.3 },
        recordedAt: new Date(),
        source: "mobile",
      }),
    );
    expect(String(event.locationId)).toBe(String(OTHER));
  });

  it("leaves a carrier with only home-branch loads exactly as before", async () => {
    await withTenant({ unscoped: true }, () => Load.deleteMany({ locationId: OTHER }));
    const req = await carrierRequest();
    expect(req.tenantContext).toEqual({ locationId: String(HOME) });
    expect(req.carrierHomeLocationIds).toEqual([String(HOME)]);
  });

  it("does not touch staff requests", async () => {
    const req = {
      user: { _id: new mongoose.Types.ObjectId(), role: "staff" },
      locationIds: [String(HOME)],
      tenantContext: { locationId: String(HOME) },
    };
    await widenForCarrier(req);
    expect(req.tenantContext).toEqual({ locationId: String(HOME) });
    expect(req.carrierHomeLocationIds).toBeUndefined();
  });
});
