// Correcting the status timeline.
//
// The timeline is read as evidence — by the customer chasing a delivery, by
// accounting working out detention, by anybody arguing about a late arrival —
// and it is also sometimes wrong: a driver marks a load picked up an hour after
// they actually loaded, or taps the wrong status and then the right one.
//
// So it can be corrected, but only by an admin and only in ways that leave the
// record coherent: the entry the load's current status rests on cannot be
// deleted, and nothing can be dated into the future.

const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const { connect, closeDatabase, clearDatabase } = require("./setup");
const { seed, TEST_LOCATION_ID } = require("./helpers/tenantTestContext");
const { withTenant } = require("../utils/tenantContext");
const Load = require("../models/Load");
const LoadAudit = require("../models/LoadAudit");

const ADMIN_ID = new mongoose.Types.ObjectId();

jest.mock("../middleware/auth", () =>
  require("./helpers/tenantTestContext").authMock({ defaultRole: "admin" }),
);

const {
  updateStatusHistoryEntry,
  deleteStatusHistoryEntry,
  getLoadById,
} = require("../controllers/loadController");

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = { _id: ADMIN_ID, role: req.headers.role || "admin" };
  next();
});
const scoped = (handler) => (req, res) =>
  withTenant({ locationId: TEST_LOCATION_ID }, () => handler(req, res));

app.patch("/api/loads/:loadId/status-history/:entryId", scoped(updateStatusHistoryEntry));
app.delete("/api/loads/:loadId/status-history/:entryId", scoped(deleteStatusHistoryEntry));
app.get("/api/loads/:loadId", scoped(getLoadById));

const AN_HOUR = 3600000;
const base = new Date("2026-03-01T08:00:00.000Z");

const makeLoad = () =>
  seed(() =>
    Load.create({
      loadId: "LD 0001",
      createdBy: "staff",
      creatorId: ADMIN_ID,
      customer: new mongoose.Types.ObjectId(),
      truckType: "Container",
      material: "Boxes",
      amount: 1000,
      status: "ASSIGNED",
      transportStatus: "IN_TRANSIT",
      transportStatusHistory: [
        { status: "ASSIGNED", changedAt: new Date(base.getTime()) },
        { status: "PICKED_UP", changedAt: new Date(base.getTime() + AN_HOUR) },
        { status: "IN_TRANSIT", changedAt: new Date(base.getTime() + 2 * AN_HOUR) },
      ],
    }),
  );

const reload = () => seed(() => Load.findOne({ loadId: "LD 0001" }));

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe("Correcting the time on an entry", () => {
  it("writes the corrected time", async () => {
    const load = await makeLoad();
    const entry = load.transportStatusHistory[1];
    const corrected = new Date(base.getTime() + 30 * 60000);

    const res = await request(app)
      .patch(`/api/loads/LD 0001/status-history/${entry._id}`)
      .send({ changedAt: corrected.toISOString() });

    expect(res.statusCode).toBe(200);

    const after = await reload();
    const stored = after.transportStatusHistory.id(entry._id);
    expect(new Date(stored.changedAt).toISOString()).toBe(corrected.toISOString());
  });

  it("leaves the load's current status alone", async () => {
    // A correction is about a step, not about which step the load is on.
    const load = await makeLoad();
    const entry = load.transportStatusHistory[0];

    await request(app)
      .patch(`/api/loads/LD 0001/status-history/${entry._id}`)
      .send({ changedAt: new Date(base.getTime() - AN_HOUR).toISOString() });

    expect((await reload()).transportStatus).toBe("IN_TRANSIT");
  });

  it("refuses a time in the future", async () => {
    const load = await makeLoad();
    const entry = load.transportStatusHistory[1];

    const res = await request(app)
      .patch(`/api/loads/LD 0001/status-history/${entry._id}`)
      .send({ changedAt: new Date(Date.now() + 86400000).toISOString() });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/future/i);
  });

  it("records the correction in the audit trail, with what it used to say", async () => {
    const load = await makeLoad();
    const entry = load.transportStatusHistory[1];
    const was = new Date(entry.changedAt).toISOString();

    await request(app)
      .patch(`/api/loads/LD 0001/status-history/${entry._id}`)
      .send({ changedAt: new Date(base.getTime() + 30 * 60000).toISOString() });

    const rows = await seed(() =>
      LoadAudit.find({ action: "load.status_history_edited" }).lean(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].changes[0].from).toBe(was);
  });

  it("says so when nothing actually changed", async () => {
    const load = await makeLoad();
    const entry = load.transportStatusHistory[1];

    const res = await request(app)
      .patch(`/api/loads/LD 0001/status-history/${entry._id}`)
      .send({ changedAt: new Date(entry.changedAt).toISOString() });

    expect(res.statusCode).toBe(400);
  });
});

describe("Deleting an entry", () => {
  it("removes a superseded one", async () => {
    const load = await makeLoad();
    const entry = load.transportStatusHistory[1];

    const res = await request(app).delete(
      `/api/loads/LD 0001/status-history/${entry._id}`,
    );

    expect(res.statusCode).toBe(200);

    const after = await reload();
    expect(after.transportStatusHistory).toHaveLength(2);
    expect(after.transportStatusHistory.id(entry._id)).toBeNull();
  });

  it("refuses the entry the current status rests on", async () => {
    const load = await makeLoad();
    const latest = load.transportStatusHistory[2];

    const res = await request(app).delete(
      `/api/loads/LD 0001/status-history/${latest._id}`,
    );

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("CANNOT_DELETE_CURRENT_STATUS");
    expect((await reload()).transportStatusHistory).toHaveLength(3);
  });

  it("records the deletion", async () => {
    const load = await makeLoad();
    const entry = load.transportStatusHistory[1];

    await request(app).delete(`/api/loads/LD 0001/status-history/${entry._id}`);

    const rows = await seed(() =>
      LoadAudit.find({ action: "load.status_history_deleted" }).lean(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].summary).toMatch(/PICKED_UP/);
  });

  it("404s on an entry that is not on this load", async () => {
    await makeLoad();

    const res = await request(app).delete(
      `/api/loads/LD 0001/status-history/${new mongoose.Types.ObjectId()}`,
    );

    expect(res.statusCode).toBe(404);
  });
});

describe("The tracking page's view of the timeline", () => {
  // The admin edit and delete controls address an entry by id, and render only
  // for an entry that has one. getLoadById hand-builds each history row rather
  // than passing it through, so the id has to be carried deliberately — it was
  // dropped, and the controls silently disappeared for every load.
  it("carries each entry's id", async () => {
    await makeLoad();

    const res = await request(app).get("/api/loads/LD 0001");

    expect(res.statusCode).toBe(200);
    expect(res.body.transportStatusHistory.length).toBeGreaterThan(0);
    res.body.transportStatusHistory.forEach((entry) => {
      expect(entry._id).toBeTruthy();
    });
  });
});
