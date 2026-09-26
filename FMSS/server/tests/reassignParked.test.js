// Reassigning a parked load. A container waiting in a yard or a warehouse
// (LOADED_IN_YARD, EMPTY_IN_YARD, DROP_IN_WAREHOUSE) is off the transit board,
// but its journey is not over. Putting a driver on it means it is about to move
// again, so it has to return to the board — otherwise it is stranded under
// "done", counted as a finished trip, and dispatch stops watching it. This is
// the bug the carrier hit: load LD 0008 sat in LOADED_IN_YARD after a driver was
// reassigned to it.

const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const { connect, closeDatabase, clearDatabase } = require("./setup");
const { seed, TEST_LOCATION_ID } = require("./helpers/tenantTestContext");
const { withTenant } = require("../utils/tenantContext");
const Load = require("../models/Load");
const FleetOwner = require("../models/FleetOwner");
const Driver = require("../models/Driver");

const STAFF_ID = new mongoose.Types.ObjectId();

jest.mock("../middleware/auth", () =>
  require("./helpers/tenantTestContext").authMock({ defaultRole: "staff" }),
);
jest.mock("../services/whatsappEvents", () => ({
  onDriversAssigned: jest.fn(),
  onStatusChanged: jest.fn(),
}));

const { setLoadDrivers } = require("../controllers/loadController");

const app = express();
app.use(express.json());
app.put("/api/loads/:loadId/drivers", (req, res) => {
  req.user = { _id: STAFF_ID, role: "staff" };
  return withTenant({ locationId: TEST_LOCATION_ID }, () =>
    setLoadDrivers(req, res),
  );
});

let carrier;
let driver;

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

const makeLoad = (transportStatus) =>
  seed(() =>
    Load.create({
      loadId: "LD-0008",
      createdBy: "staff",
      creatorId: STAFF_ID,
      customer: new mongoose.Types.ObjectId(),
      truckType: "Flatbed",
      material: "Steel",
      amount: 5000,
      status: "ASSIGNED",
      transportStatus,
      assignedFleetOwner: {
        fleetOwnerId: carrier._id,
        fleetOwnerName: carrier.carrierName,
      },
      pickup: { company: "Port of Oakland", city: "Oakland", state: "CA" },
      drop: { company: "Acme Warehouse", city: "Reno", state: "NV" },
    }),
  );

const setDriver = () =>
  request(app)
    .put("/api/loads/LD-0008/drivers")
    .send({ drivers: [{ driver: String(driver._id) }] });

beforeEach(async () => {
  await seed(async () => {
    carrier = await FleetOwner.create({ carrierName: "Ravi sline" });
    driver = await Driver.create({
      fleetOwner: carrier._id,
      name: "New Driver",
    });
  });
});

describe("PUT /api/loads/:loadId/drivers — parked load", () => {
  for (const parked of ["LOADED_IN_YARD", "EMPTY_IN_YARD", "DROP_IN_WAREHOUSE"]) {
    it(`moves a load out of ${parked} back to ASSIGNED when a driver is put on it`, async () => {
      await makeLoad(parked);

      const res = await setDriver();
      expect(res.statusCode).toBe(200);

      const after = await seed(() => Load.findOne({ loadId: "LD-0008" }).lean());
      expect(after.transportStatus).toBe("ASSIGNED");

      // The move is recorded, so the timeline shows why the load came back.
      const last = after.transportStatusHistory.at(-1);
      expect(last.status).toBe("ASSIGNED");
      expect(last.note).toMatch(/reassigned/i);
    });
  }

  it("leaves a delivered load finished — naming a driver must not resurrect it", async () => {
    await makeLoad("DELIVERED");

    const res = await setDriver();
    expect(res.statusCode).toBe(200);

    const after = await seed(() => Load.findOne({ loadId: "LD-0008" }).lean());
    expect(after.transportStatus).toBe("DELIVERED");
  });

  it("does not resurrect a parked load when drivers are cleared", async () => {
    await makeLoad("LOADED_IN_YARD");

    const res = await request(app)
      .put("/api/loads/LD-0008/drivers")
      .send({ drivers: [] });
    expect(res.statusCode).toBe(200);

    const after = await seed(() => Load.findOne({ loadId: "LD-0008" }).lean());
    expect(after.transportStatus).toBe("LOADED_IN_YARD");
  });

  it("seeds each driver's leg with its relay order and its own status", async () => {
    await makeLoad("ASSIGNED");

    const second = await seed(() =>
      Driver.create({ fleetOwner: carrier._id, name: "Second Driver" }),
    );

    const res = await request(app)
      .put("/api/loads/LD-0008/drivers")
      .send({
        drivers: [
          { driver: String(driver._id), pickup: { city: "Oakland", state: "CA" }, drop: { city: "Sparks", state: "NV" } },
          { driver: String(second._id), pickup: { city: "Sparks", state: "NV" }, drop: { city: "Reno", state: "NV" } },
        ],
      });
    expect(res.statusCode).toBe(200);

    const after = await seed(() => Load.findOne({ loadId: "LD-0008" }).lean());
    const legs = after.driverAssignments;
    expect(legs).toHaveLength(2);
    expect(legs[0].sequence).toBe(0);
    expect(legs[1].sequence).toBe(1);
    // Each new leg opens at ASSIGNED with its own history, so the relay tracks
    // each driver's stretch independently.
    expect(legs.every((l) => l.transportStatus === "ASSIGNED")).toBe(true);
    expect(legs[0].transportStatusHistory.at(-1).status).toBe("ASSIGNED");
  });
});
