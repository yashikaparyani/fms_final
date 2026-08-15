const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const { connect, closeDatabase, clearDatabase } = require("./setup");
const { seed } = require("./helpers/tenantTestContext");

const Load = require("../models/Load");
const User = require("../models/User");

// Email and notification side effects are exercised elsewhere; here they would
// only add network noise to a status change.
jest.mock("../services/emailService", () => ({
  sendLoadRequiresChanges: jest.fn().mockResolvedValue({ sent: true }),
  sendLoadCreatedEmails: jest.fn().mockResolvedValue({ sent: true }),
  sendBidAcceptanceEmail: jest.fn().mockResolvedValue({ sent: true }),
  sendStreetTurnEmails: jest.fn().mockResolvedValue({ sent: true }),
  sendPodEmail: jest.fn().mockResolvedValue({ sent: true }),
  sendEmail: jest.fn().mockResolvedValue({ sent: true }),
}));
jest.mock("../services/NotificationService", () => ({
  notifyLoadCreated: jest.fn().mockResolvedValue(null),
  notifyBiddingScheduled: jest.fn().mockResolvedValue(null),
  notifyBiddingClosed: jest.fn().mockResolvedValue(null),
  notifyLoadStatusChanged: jest.fn().mockResolvedValue(null),
}));

let clientUserId;

jest.mock("../middleware/auth", () =>
  require("./helpers/tenantTestContext").authMock({ defaultRole: "staff" }),
);

const loadRoutes = require("../routes/loadRoutes");

const app = express();
app.use(express.json());
app.use("/api/loads", loadRoutes);

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

const makeClientAndLoad = async () => {
  const client = await User.create({
    firstName: "Cara",
    lastName: "Client",
    email: `cara${Date.now()}@example.com`,
    password: "hashed-password",
    role: "client",
  });
  clientUserId = client._id.toString();

  const load = await seed(() => Load.create({
    loadId: "LD-RC-1",
    customer: new mongoose.Types.ObjectId(),
    creatorId: client._id,
    truckType: "Container",
    material: "Steel",
    amount: 1000,
    status: "PENDING_VERIFICATION",
    createdBy: "client",
    pickup: { address: "1 A St", city: "Newark", state: "NJ", zip: "07102" },
    drop: { address: "2 B St", city: "Boston", state: "MA", zip: "02101" },
  }));

  return { client, load };
};

const requestChanges = (loadId, changesNote) =>
  request(app)
    .put(`/api/loads/${loadId}/status`)
    .set("role", "staff")
    .send({ status: "REQUIRES_CHANGES", changesNote });

describe("Request Changes on a load", () => {
  it("moves the load to REQUIRES_CHANGES and stores the note", async () => {
    const { load } = await makeClientAndLoad();

    const res = await requestChanges(load.loadId, "  Pickup zip is wrong  ");
    expect(res.statusCode).toEqual(200);

    const updated = await seed(() => Load.findById(load._id));
    expect(updated.status).toEqual("REQUIRES_CHANGES");
    expect(updated.changesNote).toEqual("Pickup zip is wrong");
  });

  it("rejects a blank note", async () => {
    const { load } = await makeClientAndLoad();

    const res = await requestChanges(load.loadId, "   ");
    expect(res.statusCode).toEqual(400);

    const untouched = await seed(() => Load.findById(load._id));
    expect(untouched.status).toEqual("PENDING_VERIFICATION");
  });

  it("does not half-apply the status when the note is missing", async () => {
    const { load } = await makeClientAndLoad();

    const res = await request(app)
      .put(`/api/loads/${load.loadId}/status`)
      .set("role", "staff")
      .send({ status: "REQUIRES_CHANGES" });

    expect(res.statusCode).toEqual(400);
    const untouched = await seed(() => Load.findById(load._id));
    expect(untouched.status).toEqual("PENDING_VERIFICATION");
  });

  it("lets the client edit a REQUIRES_CHANGES load and resubmit it", async () => {
    const { load } = await makeClientAndLoad();
    await requestChanges(load.loadId, "Pickup zip is wrong");

    const res = await request(app)
      .put(`/api/loads/${load.loadId}`)
      .set("role", "client")
      .set("userid", clientUserId)
      .send({ material: "Steel Coils" });

    expect(res.statusCode).toEqual(200);

    const resubmitted = await seed(() => Load.findById(load._id));
    expect(resubmitted.material).toEqual("Steel Coils");
    expect(resubmitted.status).toEqual("PENDING_VERIFICATION");
  });

  it("clears the note once the client resubmits, so it cannot go stale", async () => {
    const { load } = await makeClientAndLoad();
    await requestChanges(load.loadId, "Pickup zip is wrong");

    await request(app)
      .put(`/api/loads/${load.loadId}`)
      .set("role", "client")
      .set("userid", clientUserId)
      .send({ material: "Steel Coils" });

    const resubmitted = await seed(() => Load.findById(load._id));
    expect(resubmitted.changesNote).toBeFalsy();
  });

  it("clears the note when staff verify the load instead", async () => {
    const { load } = await makeClientAndLoad();
    await requestChanges(load.loadId, "Pickup zip is wrong");

    const res = await request(app)
      .put(`/api/loads/${load.loadId}/status`)
      .set("role", "staff")
      .send({ status: "VERIFIED" });

    expect(res.statusCode).toEqual(200);
    const verified = await seed(() => Load.findById(load._id));
    expect(verified.status).toEqual("VERIFIED");
    expect(verified.changesNote).toBeFalsy();
  });

  it("rejects an unknown status instead of writing it", async () => {
    const { load } = await makeClientAndLoad();

    const res = await request(app)
      .put(`/api/loads/${load.loadId}/status`)
      .set("role", "staff")
      .send({ status: "NOT_A_STATUS" });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    const untouched = await seed(() => Load.findById(load._id));
    expect(untouched.status).toEqual("PENDING_VERIFICATION");
  });

  it("stops a different client from editing someone else's load", async () => {
    const { load } = await makeClientAndLoad();
    await requestChanges(load.loadId, "Pickup zip is wrong");

    const res = await request(app)
      .put(`/api/loads/${load.loadId}`)
      .set("role", "client")
      .set("userid", new mongoose.Types.ObjectId().toString())
      .send({ material: "Hijacked" });

    expect(res.statusCode).toEqual(403);
  });
});
