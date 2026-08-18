// Carrier legs: more than one carrier on a load, each running their own stretch
// of it.
//
// The rules worth pinning down are the ones that decide what a carrier can see
// and how far along the load is, because both used to have a single obvious
// answer and now do not: a second carrier must be able to reach the load they
// were given, and a load must not read as delivered because the first of two
// carriers dropped it at a yard.

const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const { connect, closeDatabase, clearDatabase } = require("./setup");
const { seed, TEST_LOCATION_ID } = require("./helpers/tenantTestContext");
const { withTenant } = require("../utils/tenantContext");
const Load = require("../models/Load");
const FleetOwner = require("../models/FleetOwner");
const Driver = require("../models/Driver");
const { carrierLoadFilter } = require("../utils/carrierAccount");

const STAFF_ID = new mongoose.Types.ObjectId();

jest.mock("../middleware/auth", () =>
  require("./helpers/tenantTestContext").authMock({ defaultRole: "staff" }),
);
jest.mock("../services/auditService", () => ({
  recordAssignment: jest.fn().mockResolvedValue(undefined),
}));

const { setLoadAssignments } = require("../controllers/loadController");

const app = express();
app.use(express.json());
app.put("/api/loads/:loadId/assignments", (req, res) => {
  req.user = { _id: STAFF_ID, role: "staff" };
  return withTenant({ locationId: TEST_LOCATION_ID }, () =>
    setLoadAssignments(req, res),
  );
});

let load;
let portToYard;
let yardToDoor;

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

beforeEach(async () => {
  await seed(async () => {
    portToYard = await FleetOwner.create({ carrierName: "Port Drayage LLC" });
    yardToDoor = await FleetOwner.create({ carrierName: "Last Mile Freight" });

    load = await Load.create({
      loadId: "LD-9001",
      createdBy: "staff",
      creatorId: STAFF_ID,
      customer: new mongoose.Types.ObjectId(),
      truckType: "Flatbed",
      material: "Steel",
      amount: 5000,
      status: "VERIFIED",
      pickup: { company: "Port of Oakland", city: "Oakland", state: "CA" },
      drop: { company: "Acme Warehouse", city: "Reno", state: "NV" },
    });
  });
});

const assign = (body) =>
  request(app).put("/api/loads/LD-9001/assignments").send(body);

const twoLegs = {
  assignments: [
    {
      fleetOwnerId: null, // filled per test
      origin: { source: "STOP", stopIndex: 0 },
      destination: { source: "CUSTOM", company: "Sparks Yard", city: "Sparks", state: "NV" },
      carrierRate: 900,
    },
    {
      fleetOwnerId: null,
      origin: { source: "CUSTOM", company: "Sparks Yard", city: "Sparks", state: "NV" },
      destination: { source: "STOP", stopIndex: 0 },
      carrierRate: 400,
    },
  ],
};

const bodyForTwo = () => ({
  assignments: [
    { ...twoLegs.assignments[0], fleetOwnerId: String(portToYard._id) },
    { ...twoLegs.assignments[1], fleetOwnerId: String(yardToDoor._id) },
  ],
});

describe("PUT /api/loads/:loadId/assignments", () => {
  it("puts two carriers on one load, each with their own ends", async () => {
    const res = await assign(bodyForTwo());

    expect(res.statusCode).toEqual(200);
    expect(res.body.load.assignments).toHaveLength(2);

    const [first, second] = res.body.load.assignments;
    expect(first.fleetOwnerName).toEqual("Port Drayage LLC");
    expect(second.fleetOwnerName).toEqual("Last Mile Freight");
    expect(second.origin.company).toEqual("Sparks Yard");
  });

  it("copies a stop off the load rather than trusting what was sent", async () => {
    const res = await assign({
      assignments: [
        {
          fleetOwnerId: String(portToYard._id),
          // A browser claiming this stop is somewhere else must not be believed.
          origin: { source: "STOP", stopIndex: 0, city: "Nowhere" },
          destination: { source: "CUSTOM", city: "Sparks", state: "NV" },
        },
      ],
    });

    expect(res.body.load.assignments[0].origin.city).toEqual("Oakland");
    expect(res.body.load.assignments[0].origin.company).toEqual("Port of Oakland");
  });

  it("keeps the first carrier as the primary, for everything that predates legs", async () => {
    const res = await assign(bodyForTwo());

    expect(res.body.load.assignedFleetOwner.fleetOwnerName).toEqual("Port Drayage LLC");
    expect(res.body.load.status).toEqual("ASSIGNED");
    expect(res.body.load.bidStatus).toEqual("CLOSED");
  });

  it("refuses a leg with only one end", async () => {
    const res = await assign({
      assignments: [
        {
          fleetOwnerId: String(portToYard._id),
          origin: { source: "STOP", stopIndex: 0 },
          destination: { source: "CUSTOM" },
        },
      ],
    });

    expect(res.statusCode).toEqual(400);
    expect(res.body.message).toMatch(/origin and a destination/i);
  });

  it("refuses an empty set rather than silently unassigning", async () => {
    const res = await assign({ assignments: [] });

    expect(res.statusCode).toEqual(400);
    expect(res.body.message).toMatch(/at least one carrier/i);
  });

  it("keeps progress on a leg that survives an edit", async () => {
    const first = await assign(bodyForTwo());
    const legs = first.body.load.assignments;

    // The first carrier is already rolling.
    await seed(async () => {
      const doc = await Load.findOne({ loadId: "LD-9001" });
      doc.assignments[0].transportStatus = "IN_TRANSIT";
      await doc.save();
    });

    // Dispatcher re-saves the split, sending the legs back with their ids.
    const again = await assign({
      assignments: [
        { ...bodyForTwo().assignments[0], _id: legs[0]._id },
        { ...bodyForTwo().assignments[1], _id: legs[1]._id },
      ],
    });

    expect(again.body.load.assignments[0].transportStatus).toEqual("IN_TRANSIT");
  });
});

describe("Load-level status rolled up from legs", () => {
  const withLegs = (statuses) => {
    const doc = new Load({
      loadId: "LD-ROLL",
      createdBy: "staff",
      creatorId: STAFF_ID,
      customer: new mongoose.Types.ObjectId(),
      assignments: statuses.map((transportStatus) => ({
        fleetOwnerId: new mongoose.Types.ObjectId(),
        transportStatus,
      })),
    });
    doc.rollupTransportStatus();
    return doc.transportStatus;
  };

  it("is only as far along as the least advanced leg", () => {
    // The box is at the yard, not at the consignee.
    expect(withLegs(["DELIVERED", "ASSIGNED"])).toEqual("ASSIGNED");
    expect(withLegs(["IN_TRANSIT", "PICKED_UP"])).toEqual("PICKED_UP");
  });

  it("is delivered only once every leg is", () => {
    expect(withLegs(["DELIVERED", "DELIVERED"])).toEqual("DELIVERED");
  });

  it("does not let one finished leg hold back a load still running", () => {
    // A terminated first leg must not park the load at TERMINATED while the
    // second carrier is still driving.
    expect(withLegs(["TERMINATED", "IN_TRANSIT"])).toEqual("IN_TRANSIT");
  });
});

describe("What a carrier can see", () => {
  it("matches the carrier holding the whole load and the carrier holding a leg", async () => {
    await assign(bodyForTwo());

    const secondCarriersLoads = await seed(() =>
      Load.find(carrierLoadFilter(yardToDoor._id)).lean(),
    );

    // Without legs in the filter this carrier sees nothing: they are on the
    // second leg and were never the primary.
    expect(secondCarriersLoads.map((l) => l.loadId)).toEqual(["LD-9001"]);
  });

  it("does not show a load to a carrier who is on none of its legs", async () => {
    await assign(bodyForTwo());

    const stranger = await seed(() =>
      FleetOwner.create({ carrierName: "Someone Else Trucking" }),
    );
    const theirs = await seed(() =>
      Load.find(carrierLoadFilter(stranger._id)).lean(),
    );

    expect(theirs).toHaveLength(0);
  });
});

describe("legFor", () => {
  it("gives a carrier the leg they still have work on", async () => {
    await assign(bodyForTwo());
    const doc = await seed(() => Load.findOne({ loadId: "LD-9001" }));

    expect(String(doc.legFor(yardToDoor._id).fleetOwnerId)).toEqual(
      String(yardToDoor._id),
    );
  });

  it("gives nothing to a carrier who is not on the load", async () => {
    await assign(bodyForTwo());
    const doc = await seed(() => Load.findOne({ loadId: "LD-9001" }));

    expect(doc.legFor(new mongoose.Types.ObjectId())).toBeNull();
  });
});

describe("Each carrier names their own drivers", () => {
  // A load split between carriers has two rosters on it. Each carrier edits
  // their own; neither can disturb the other's, which is what a straight
  // overwrite of driverAssignments used to do.
  const driversOf = (doc, carrier) =>
    (doc.driverAssignments || [])
      .filter((a) => String(a.fleetOwnerId) === String(carrier._id))
      .map((a) => a.driverName)
      .sort();

  it("keeps the first carrier's drivers when the second names theirs", async () => {
    await assign(bodyForTwo());

    const [alpha, bravo] = await seed(() =>
      Driver.create([
        { name: "Alpha Driver", fleetOwner: portToYard._id },
        { name: "Bravo Driver", fleetOwner: yardToDoor._id },
      ]),
    );

    // Carrier one puts their driver on.
    await seed(async () => {
      const doc = await Load.findOne({ loadId: "LD-9001" });
      doc.driverAssignments = [
        {
          driver: alpha._id,
          driverName: alpha.name,
          fleetOwnerId: portToYard._id,
        },
      ];
      await doc.save();
    });

    // Carrier two now saves theirs, replacing only their own rows.
    await seed(async () => {
      const doc = await Load.findOne({ loadId: "LD-9001" });
      const others = doc.driverAssignments.filter(
        (a) => String(a.fleetOwnerId) !== String(yardToDoor._id),
      );
      doc.driverAssignments = [
        ...others,
        {
          driver: bravo._id,
          driverName: bravo.name,
          fleetOwnerId: yardToDoor._id,
        },
      ];
      await doc.save();
    });

    const doc = await seed(() => Load.findOne({ loadId: "LD-9001" }));

    expect(driversOf(doc, portToYard)).toEqual(["Alpha Driver"]);
    expect(driversOf(doc, yardToDoor)).toEqual(["Bravo Driver"]);
    expect(doc.driverAssignments).toHaveLength(2);
  });

  it("records which carrier each driver belongs to", async () => {
    await assign(bodyForTwo());

    const driver = await seed(() =>
      Driver.create({ name: "Alpha Driver", fleetOwner: portToYard._id }),
    );

    await seed(async () => {
      const doc = await Load.findOne({ loadId: "LD-9001" });
      doc.driverAssignments = [
        {
          driver: driver._id,
          driverName: driver.name,
          fleetOwnerId: portToYard._id,
        },
      ];
      await doc.save();
    });

    const doc = await seed(() => Load.findOne({ loadId: "LD-9001" }));

    // Without this there is no telling one carrier's drivers from another's.
    expect(String(doc.driverAssignments[0].fleetOwnerId)).toEqual(
      String(portToYard._id),
    );
  });
});

describe("A driver sees only their own runs", () => {
  // A driver is a sub-account of a carrier, but their board is not the
  // carrier's: they get the runs they were named on, not everything the company
  // is moving.
  const myLoadsFor = (driver) =>
    Load.find({ "driverAssignments.driver": driver._id }).lean();

  it("leaves out a load their carrier holds but they are not on", async () => {
    await assign(bodyForTwo());

    const [onIt, notOnIt] = await seed(() =>
      Driver.create([
        { name: "On It", fleetOwner: portToYard._id },
        { name: "Not On It", fleetOwner: portToYard._id },
      ]),
    );

    await seed(async () => {
      const doc = await Load.findOne({ loadId: "LD-9001" });
      doc.driverAssignments = [
        {
          driver: onIt._id,
          driverName: onIt.name,
          fleetOwnerId: portToYard._id,
        },
      ];
      await doc.save();
    });

    expect((await seed(() => myLoadsFor(onIt))).map((l) => l.loadId)).toEqual([
      "LD-9001",
    ]);
    // Same carrier, same load, but this driver was never put on it.
    expect(await seed(() => myLoadsFor(notOnIt))).toHaveLength(0);
  });

  it("gives each driver their own pickup and drop off the same load", async () => {
    await assign(bodyForTwo());

    const [first, second] = await seed(() =>
      Driver.create([
        { name: "First Leg", fleetOwner: portToYard._id },
        { name: "Second Leg", fleetOwner: yardToDoor._id },
      ]),
    );

    await seed(async () => {
      const doc = await Load.findOne({ loadId: "LD-9001" });
      doc.driverAssignments = [
        {
          driver: first._id,
          driverName: first.name,
          fleetOwnerId: portToYard._id,
          pickup: { city: "Oakland", state: "CA" },
          drop: { city: "Sparks", state: "NV" },
        },
        {
          driver: second._id,
          driverName: second.name,
          fleetOwnerId: yardToDoor._id,
          pickup: { city: "Sparks", state: "NV" },
          drop: { city: "Reno", state: "NV" },
        },
      ];
      await doc.save();
    });

    const doc = await seed(() => Load.findOne({ loadId: "LD-9001" }).lean());

    const legOf = (driver) =>
      doc.driverAssignments.find(
        (a) => String(a.driver) === String(driver._id),
      );

    expect(legOf(first).drop.city).toEqual("Sparks");
    expect(legOf(second).pickup.city).toEqual("Sparks");
    expect(legOf(second).drop.city).toEqual("Reno");
  });
});
