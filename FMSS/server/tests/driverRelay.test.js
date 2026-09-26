// A relay of drivers on one carrier's load: driver 1 runs the box to the yard,
// driver 2 collects it and runs it on. Each driver leg carries its own status,
// and the load is only as far along as its least advanced leg — the same rule
// carrier legs already follow, brought down to the driver level.

const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const { connect, closeDatabase, clearDatabase } = require("./setup");
const { seed, TEST_LOCATION_ID } = require("./helpers/tenantTestContext");
const { withTenant } = require("../utils/tenantContext");
const Load = require("../models/Load");

const STAFF_ID = new mongoose.Types.ObjectId();
const CARRIER_ID = new mongoose.Types.ObjectId();

jest.mock("../middleware/auth", () =>
  require("./helpers/tenantTestContext").authMock({ defaultRole: "staff" }),
);
jest.mock("../services/whatsappEvents", () => ({
  onDriversAssigned: jest.fn(),
  onStatusChanged: jest.fn(),
  onPickupConfirmed: jest.fn(),
  onDelivered: jest.fn(),
  onLoadCompleted: jest.fn(),
}));
jest.mock("../services/auditService", () => ({
  recordStatusChange: jest.fn().mockResolvedValue(undefined),
  recordAssignment: jest.fn().mockResolvedValue(undefined),
}));

const { updateTransportStatus } = require("../controllers/loadController");

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = { _id: STAFF_ID, role: "staff" };
  next();
});
app.put("/api/loads/:loadId/transport-status", (req, res) =>
  withTenant({ locationId: TEST_LOCATION_ID }, () => updateTransportStatus(req, res)),
);

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

// ─── Model: rolling the load up from its driver legs ──────────────────────────
describe("recomputeTransportStatus from driver legs", () => {
  const withDriverLegs = (statuses) => {
    const doc = new Load({
      loadId: "LD-DRV",
      createdBy: "staff",
      creatorId: STAFF_ID,
      customer: new mongoose.Types.ObjectId(),
      assignedFleetOwner: { fleetOwnerId: CARRIER_ID, fleetOwnerName: "Swift" },
      driverAssignments: statuses.map((transportStatus, i) => ({
        driver: new mongoose.Types.ObjectId(),
        fleetOwnerId: CARRIER_ID,
        driverName: `Driver ${i + 1}`,
        sequence: i,
        transportStatus,
      })),
    });
    doc.recomputeTransportStatus();
    return doc.transportStatus;
  };

  it("is only as far along as the least advanced driver leg", () => {
    // Driver 1 dropped at the yard; driver 2 has not started — the load waits.
    expect(withDriverLegs(["LOADED_IN_YARD", "ASSIGNED"])).toBe("ASSIGNED");
    // Driver 1 handed over, driver 2 is rolling.
    expect(withDriverLegs(["LOADED_IN_YARD", "IN_TRANSIT"])).toBe("IN_TRANSIT");
  });

  it("is delivered only once the last leg is", () => {
    expect(withDriverLegs(["DELIVERED", "DELIVERED"])).toBe("DELIVERED");
  });

  it("ignores driver rows that carry no status (older loads)", () => {
    const doc = new Load({
      loadId: "LD-OLD",
      createdBy: "staff",
      creatorId: STAFF_ID,
      customer: new mongoose.Types.ObjectId(),
      assignedFleetOwner: { fleetOwnerId: CARRIER_ID, fleetOwnerName: "Swift" },
      transportStatus: "IN_TRANSIT",
      driverAssignments: [{ driver: new mongoose.Types.ObjectId(), driverName: "Legacy" }],
    });
    expect(doc.usesDriverLegs()).toBe(false);
    expect(doc.recomputeTransportStatus()).toBe("IN_TRANSIT");
  });
});

// ─── Integration: the office drives each leg through the endpoint ──────────────
describe("PUT transport-status on a driver leg", () => {
  const makeRelay = () =>
    seed(() =>
      Load.create({
        loadId: "LD 0008",
        createdBy: "staff",
        creatorId: STAFF_ID,
        customer: new mongoose.Types.ObjectId(),
        truckType: "Container",
        material: "Boxes",
        amount: 1000,
        status: "ASSIGNED",
        transportStatus: "ASSIGNED",
        assignedFleetOwner: {
          fleetOwnerId: CARRIER_ID,
          fleetOwnerName: "Swift Haulage",
        },
        driverAssignments: [
          {
            driver: new mongoose.Types.ObjectId(),
            fleetOwnerId: CARRIER_ID,
            driverName: "Ramesh",
            sequence: 0,
            transportStatus: "ASSIGNED",
            transportStatusHistory: [{ status: "ASSIGNED", note: "Assigned to Ramesh" }],
            pickup: { city: "Oakland", state: "CA" },
            drop: { city: "Sparks", state: "NV" },
          },
          {
            driver: new mongoose.Types.ObjectId(),
            fleetOwnerId: CARRIER_ID,
            driverName: "Suresh",
            sequence: 1,
            transportStatus: "ASSIGNED",
            transportStatusHistory: [{ status: "ASSIGNED", note: "Assigned to Suresh" }],
            pickup: { city: "Sparks", state: "NV" },
            drop: { city: "Reno", state: "NV" },
          },
        ],
      }),
    );

  const move = (legId, transportStatus) =>
    request(app)
      .put("/api/loads/LD 0008/transport-status")
      .send({ transportStatus, driverLegId: String(legId) });

  it("tracks each driver's leg and rolls the load up from them", async () => {
    const load = await makeRelay();
    const [leg1, leg2] = load.driverAssignments;

    // Driver 1 picks up. Load waits on driver 2, still ASSIGNED.
    let res = await move(leg1._id, "PICKED_UP");
    expect(res.statusCode).toBe(200);
    let after = await seed(() => Load.findOne({ loadId: "LD 0008" }).lean());
    expect(after.driverAssignments[0].transportStatus).toBe("PICKED_UP");
    expect(after.transportStatus).toBe("ASSIGNED");

    // Driver 1 drops at the yard — their leg is finished there.
    res = await move(leg1._id, "LOADED_IN_YARD");
    expect(res.statusCode).toBe(200);
    after = await seed(() => Load.findOne({ loadId: "LD 0008" }).lean());
    expect(after.driverAssignments[0].transportStatus).toBe("LOADED_IN_YARD");
    // Only leg 2 is running now, still ASSIGNED, so the load is ASSIGNED.
    expect(after.transportStatus).toBe("ASSIGNED");

    // Driver 2 collects and rolls — now the load is moving.
    res = await move(leg2._id, "PICKED_UP");
    expect(res.statusCode).toBe(200);
    after = await seed(() => Load.findOne({ loadId: "LD 0008" }).lean());
    expect(after.transportStatus).toBe("PICKED_UP");

    res = await move(leg2._id, "REACHED_DESTINATION");
    expect(res.statusCode).toBe(200);
    after = await seed(() => Load.findOne({ loadId: "LD 0008" }).lean());
    expect(after.driverAssignments[1].transportStatus).toBe("REACHED_DESTINATION");
    expect(after.transportStatus).toBe("REACHED_DESTINATION");
  });

  it("refuses to move a driver leg backwards", async () => {
    const load = await makeRelay();
    const leg1 = load.driverAssignments[0];

    await move(leg1._id, "IN_TRANSIT");
    const res = await move(leg1._id, "PICKED_UP"); // earlier than IN_TRANSIT
    expect(res.statusCode).toBe(400);
  });
});
