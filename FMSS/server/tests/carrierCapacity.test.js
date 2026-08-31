// One truck, one load.
//
// A carrier cannot run more loads at once than they have trucks. The case that
// matters is the owner-operator: one tractor, one driver, and a load already on
// it. Until it is delivered they must not be assigned another, must not be able
// to bid for one, and must not be shown the board at all.
//
// The fleet size comes from the signed Appendix A equipment schedule, and a
// carrier who has not filed one is deliberately NOT restricted — absent data is
// not evidence of a one-truck fleet, and treating it as one would lock every
// carrier who predates onboarding out of the bid board with no way to see why.

const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const { connect, closeDatabase, clearDatabase } = require("./setup");
const { seed, TEST_LOCATION_ID } = require("./helpers/tenantTestContext");
const { withTenant } = require("../utils/tenantContext");

const Load = require("../models/Load");
const FleetOwner = require("../models/FleetOwner");
const CarrierOnboarding = require("../models/CarrierOnboarding");

const CARRIER_USER_ID = new mongoose.Types.ObjectId();
const STAFF_ID = new mongoose.Types.ObjectId();

jest.mock("../middleware/auth", () =>
  require("./helpers/tenantTestContext").authMock({ defaultRole: "staff" }),
);

const { getLoads, getMyCapacity, assignFleetOwner } = require("../controllers/loadController");

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = {
    _id: req.headers.role === "fleetOwner" ? CARRIER_USER_ID : STAFF_ID,
    role: req.headers.role || "staff",
  };
  next();
});
const scoped = (handler) => (req, res) =>
  withTenant({ locationId: TEST_LOCATION_ID }, () => handler(req, res));

app.get("/api/loads/my-capacity", scoped(getMyCapacity));
app.get("/api/loads", scoped(getLoads));
app.put("/api/loads/:loadId/assign-fleet-owner", scoped(assignFleetOwner));

let carrier;

const TRACTOR = {
  unitNumber: "T-1",
  equipmentType: "Tractor",
  make: "Freightliner",
  model: "Cascadia",
  year: 2021,
  vin: "1FUJGLDR9CLBP8834",
};

/** An Appendix A schedule with `count` power units on it. */
const withEquipment = (count, extra = []) =>
  seed(() =>
    CarrierOnboarding.create({
      fleetOwner: carrier._id,
      equipment: [
        ...Array.from({ length: count }, (_, i) => ({
          ...TRACTOR,
          unitNumber: `T-${i + 1}`,
        })),
        ...extra,
      ],
    }),
  );

const makeLoad = (over = {}) =>
  seed(() =>
    Load.create({
      loadId: over.loadId || "LD 0001",
      createdBy: "staff",
      creatorId: STAFF_ID,
      customer: new mongoose.Types.ObjectId(),
      truckType: "Container",
      material: "Boxes",
      amount: 1000,
      status: "VERIFIED",
      bidStatus: "OPEN",
      transportStatus: "NEW_LOAD",
      ...over,
    }),
  );

/** A load already on this carrier's truck. */
const loadOnTheRoad = (transportStatus = "IN_TRANSIT") =>
  makeLoad({
    loadId: "LD 0009",
    status: "ASSIGNED",
    bidStatus: "CLOSED",
    transportStatus,
    assignedFleetOwner: {
      fleetOwnerId: carrier._id,
      fleetOwnerName: "Owner Operator",
      assignedAt: new Date(),
    },
  });

const asCarrier = (path) => request(app).get(path).set("role", "fleetOwner");

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

beforeEach(async () => {
  carrier = await seed(() =>
    FleetOwner.create({ userId: CARRIER_USER_ID, carrierName: "Owner Operator" }),
  );
});

describe("Reading the fleet size", () => {
  it("counts power units, not trailers and chassis", async () => {
    await withEquipment(1, [
      { ...TRACTOR, unitNumber: "TR-1", equipmentType: "Trailer" },
      { ...TRACTOR, unitNumber: "CH-1", equipmentType: "Chassis" },
    ]);
    await loadOnTheRoad();

    const res = await asCarrier("/api/loads/my-capacity");

    expect(res.body.trucks).toBe(1);
    expect(res.body.atCapacity).toBe(true);
  });

  it("does not restrict a carrier who has filed no equipment", async () => {
    // Absent data is not a one-truck fleet.
    await loadOnTheRoad();

    const res = await asCarrier("/api/loads/my-capacity");

    expect(res.body.trucks).toBeNull();
    expect(res.body.atCapacity).toBe(false);
  });

  it("lets a two-truck carrier take a second load", async () => {
    await withEquipment(2);
    await loadOnTheRoad();

    const res = await asCarrier("/api/loads/my-capacity");

    expect(res.body.trucks).toBe(2);
    expect(res.body.running).toBe(1);
    expect(res.body.atCapacity).toBe(false);
  });
});

describe("What a committed carrier can see", () => {
  beforeEach(async () => {
    await withEquipment(1);
  });

  it("shows the board while their truck is free", async () => {
    await makeLoad();

    const res = await asCarrier("/api/loads");

    expect(res.body.map((l) => l.loadId)).toEqual(["LD 0001"]);
  });

  it("hides it entirely once they have a load on the road", async () => {
    await makeLoad();
    await loadOnTheRoad();

    const res = await asCarrier("/api/loads");

    expect(res.body).toEqual([]);
  });

  it("gives the board back the moment that load is delivered", async () => {
    await makeLoad();
    await loadOnTheRoad("DELIVERED");

    const res = await asCarrier("/api/loads");

    expect(res.body.map((l) => l.loadId)).toEqual(["LD 0001"]);
    expect((await asCarrier("/api/loads/my-capacity")).body.atCapacity).toBe(false);
  });

  it("names the load that is in the way", async () => {
    await loadOnTheRoad();

    const res = await asCarrier("/api/loads/my-capacity");

    expect(res.body.blockingLoad.loadId).toBe("LD 0009");
    expect(res.body.message).toMatch(/LD 0009/);
    expect(res.body.message).toMatch(/delivered/i);
  });
});

describe("Assigning to a committed carrier", () => {
  beforeEach(async () => {
    await withEquipment(1);
  });

  it("is refused, and says why", async () => {
    await makeLoad();
    await loadOnTheRoad();

    const res = await request(app)
      .put("/api/loads/LD 0001/assign-fleet-owner")
      .send({ fleetOwnerId: carrier._id, fleetOwnerName: "Owner Operator" });

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("CARRIER_AT_CAPACITY");
    expect(res.body.message).toMatch(/LD 0009/);

    const untouched = await seed(() => Load.findOne({ loadId: "LD 0001" }));
    expect(untouched.assignedFleetOwner?.fleetOwnerId).toBeUndefined();
  });

  it("still allows the load they already hold to be reassigned to them", async () => {
    // Correcting a detail on the load that is itself the blocker must not be
    // blocked by it — that would be a rule with no way out.
    await loadOnTheRoad();

    const res = await request(app)
      .put("/api/loads/LD 0009/assign-fleet-owner")
      .send({ fleetOwnerId: carrier._id, fleetOwnerName: "Owner Operator" });

    expect(res.statusCode).toBe(200);
  });

  it("allows it once their truck is free again", async () => {
    await makeLoad();
    await loadOnTheRoad("DELIVERED");

    const res = await request(app)
      .put("/api/loads/LD 0001/assign-fleet-owner")
      .send({ fleetOwnerId: carrier._id, fleetOwnerName: "Owner Operator" });

    expect(res.statusCode).toBe(200);
  });
});
