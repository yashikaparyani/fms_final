// The status lock: a load's transport status cannot be set until somebody is
// carrying it.
//
// Every value the transport status can take is a statement about a carrier —
// ready to pick up, picked up, in transit, delivered. On an unassigned load
// there is nobody those statements could be about, so setting one records a
// movement that did not happen and then drives the dashboards, the customer's
// tracking page and the LFD alarms off it.
//
// Two ways in, and both are gated: the dedicated status endpoint and the
// transportStatus field on the ordinary edit route. A rule enforced on one of
// two doors is not enforced.

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

const { updateTransportStatus, updateLoad } = require("../controllers/loadController");

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = { _id: STAFF_ID, role: "staff" };
  next();
});
app.put("/api/loads/:loadId/transport-status", (req, res) =>
  withTenant({ locationId: TEST_LOCATION_ID }, () => updateTransportStatus(req, res)),
);
app.put("/api/loads/:loadId", (req, res) =>
  withTenant({ locationId: TEST_LOCATION_ID }, () => updateLoad(req, res)),
);

const makeLoad = (over = {}) =>
  seed(() =>
    Load.create({
      loadId: "LD 0001",
      createdBy: "staff",
      creatorId: STAFF_ID,
      customer: new mongoose.Types.ObjectId(),
      truckType: "Container",
      material: "Boxes",
      amount: 1000,
      status: "ASSIGNED",
      transportStatus: "NEW_LOAD",
      ...over,
    }),
  );

const assignedToACarrier = {
  transportStatus: "ASSIGNED",
  assignedFleetOwner: {
    fleetOwnerId: CARRIER_ID,
    fleetOwnerName: "Swift Haulage",
    assignedAt: new Date(),
  },
};

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe("PUT /api/loads/:loadId/transport-status", () => {
  it("refuses to move an unassigned load, and says what to do about it", async () => {
    await makeLoad();

    const res = await request(app)
      .put("/api/loads/LD 0001/transport-status")
      .send({ transportStatus: "PICKED_UP" });

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("LOAD_NOT_ASSIGNED");
    expect(res.body.message).toMatch(/assign/i);
  });

  it("leaves the status exactly as it was", async () => {
    await makeLoad();

    await request(app)
      .put("/api/loads/LD 0001/transport-status")
      .send({ transportStatus: "PICKED_UP" });

    const after = await seed(() => Load.findOne({ loadId: "LD 0001" }));
    expect(after.transportStatus).toBe("NEW_LOAD");
    expect(after.transportStatusHistory).toHaveLength(0);
  });

  it("lets the status through once a carrier has the load", async () => {
    await makeLoad(assignedToACarrier);

    const res = await request(app)
      .put("/api/loads/LD 0001/transport-status")
      .send({ transportStatus: "READY_TO_PICKUP" });

    expect(res.statusCode).toBe(200);

    const after = await seed(() => Load.findOne({ loadId: "LD 0001" }));
    expect(after.transportStatus).toBe("READY_TO_PICKUP");
  });

  it("counts a load split into legs as carried, even with no primary carrier", async () => {
    // A multi-carrier load names its carriers on the legs rather than in
    // assignedFleetOwner, and it is just as carried as a single-carrier one.
    await makeLoad({
      assignments: [
        {
          fleetOwnerId: CARRIER_ID,
          fleetOwnerName: "Swift Haulage",
          transportStatus: "ASSIGNED",
        },
      ],
    });

    const res = await request(app)
      .put("/api/loads/LD 0001/transport-status")
      .send({ transportStatus: "READY_TO_PICKUP" });

    expect(res.statusCode).toBe(200);
  });
});

describe("PUT /api/loads/:loadId — the edit screen is not a way around it", () => {
  it("refuses a transportStatus on an unassigned load", async () => {
    await makeLoad();

    const res = await request(app)
      .put("/api/loads/LD 0001")
      .send({ transportStatus: "DELIVERED" });

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("LOAD_NOT_ASSIGNED");

    const after = await seed(() => Load.findOne({ loadId: "LD 0001" }));
    expect(after.transportStatus).toBe("NEW_LOAD");
  });

  it("still allows every other edit on an unassigned load", async () => {
    // The lock is on the status, not on the load. An unassigned load is exactly
    // the one still being corrected before it goes out.
    await makeLoad();

    const res = await request(app)
      .put("/api/loads/LD 0001")
      .send({ remarks: "Call the yard before 4pm" });

    expect(res.statusCode).toBe(200);

    const after = await seed(() => Load.findOne({ loadId: "LD 0001" }));
    expect(after.remarks).toBe("Call the yard before 4pm");
  });

  it("accepts a transportStatus once the load is assigned", async () => {
    await makeLoad(assignedToACarrier);

    const res = await request(app)
      .put("/api/loads/LD 0001")
      .send({ transportStatus: "IN_TRANSIT" });

    expect(res.statusCode).toBe(200);

    const after = await seed(() => Load.findOne({ loadId: "LD 0001" }));
    expect(after.transportStatus).toBe("IN_TRANSIT");
  });
});
