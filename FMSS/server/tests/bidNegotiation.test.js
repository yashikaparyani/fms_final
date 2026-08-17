const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const { connect, closeDatabase, clearDatabase } = require("./setup");
const { seed } = require("./helpers/tenantTestContext");

const Load = require("../models/Load");
const Bid = require("../models/bidSchema");
const FleetOwner = require("../models/FleetOwner");

// The acting user is driven by headers so one test file can play staff and
// either carrier in turn.
let actingUserId = null;

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

const makeLoad = () =>
  seed(() => Load.create({
    loadId: "LD-NEG-1",
    customer: new mongoose.Types.ObjectId(),
    truckType: "Container",
    material: "Steel",
    amount: 1000,
    // What staff expected to pay before any bidding happened.
    targetRate: 400,
    vendorRate: 400,
    bidStatus: "OPEN",
    status: "VERIFIED",
    createdBy: "staff",
  }));

const makeCarrier = async (carrierName) => {
  const userId = new mongoose.Types.ObjectId();
  const fleetOwner = await seed(() => FleetOwner.create({ userId, carrierName }));
  return { userId: userId.toString(), fleetOwner };
};

describe("Bid negotiation & auto-award", () => {
  it("turns a staff revision into an offer instead of rewriting the bid", async () => {
    const load = await makeLoad();
    const { fleetOwner } = await makeCarrier("Acme Haulage");
    const bid = await seed(() => Bid.create({
      loadId: load._id,
      fleetOwnerId: fleetOwner._id,
      amount: 120,
    }));

    const res = await request(app)
      .post(`/api/loads/${load.loadId}/revise-bid`)
      .set("role", "staff")
      .send({ bidId: bid._id.toString(), newAmount: 50 });

    expect(res.statusCode).toEqual(200);

    const stored = await seed(() => Bid.findById(bid._id));
    // The carrier's own number is untouched until they agree to the new one.
    expect(stored.amount).toEqual(120);
    expect(stored.negotiation.status).toEqual("PENDING");
    expect(stored.negotiation.amount).toEqual(50);
    expect(stored.negotiation.previousAmount).toEqual(120);

    // Nothing is awarded on the strength of an unanswered offer.
    const stillOpen = await seed(() => Load.findById(load._id));
    expect(stillOpen.winningBid?.fleetOwnerId).toBeUndefined();
    expect(stillOpen.status).toEqual("VERIFIED");
  });

  it("awards the load automatically when the carrier accepts the reduced amount", async () => {
    const load = await makeLoad();
    const winner = await makeCarrier("Acme Haulage");
    const loser = await makeCarrier("Rival Freight");

    const bid = await seed(() => Bid.create({
      loadId: load._id,
      fleetOwnerId: winner.fleetOwner._id,
      amount: 120,
    }));
    const rivalBid = await seed(() => Bid.create({
      loadId: load._id,
      fleetOwnerId: loser.fleetOwner._id,
      amount: 200,
    }));

    await request(app)
      .post(`/api/loads/${load.loadId}/revise-bid`)
      .set("role", "staff")
      .send({ bidId: bid._id.toString(), newAmount: 50 });

    const res = await request(app)
      .post(`/api/loads/${load.loadId}/negotiation/respond`)
      .set("role", "fleetOwner")
      .set("userid", winner.userId)
      .send({ bidId: bid._id.toString(), accept: true });

    expect(res.statusCode).toEqual(200);

    const awarded = await seed(() => Load.findById(load._id));
    expect(awarded.winningBid.fleetOwnerId.toString()).toEqual(
      winner.fleetOwner._id.toString(),
    );
    // The settled figure — not the original 120, not the 400 target rate.
    expect(awarded.winningBid.amount).toEqual(50);
    expect(awarded.vendorRate).toEqual(50);
    expect(awarded.status).toEqual("ASSIGNED");
    expect(awarded.transportStatus).toEqual("ASSIGNED");
    expect(awarded.bidStatus).toEqual("CLOSED");
    expect(awarded.assignedFleetOwner.fleetOwnerName).toEqual("Acme Haulage");

    expect((await seed(() => Bid.findById(bid._id))).amount).toEqual(50);
    expect((await seed(() => Bid.findById(bid._id))).status).toEqual("WINNING");
    expect((await seed(() => Bid.findById(rivalBid._id))).status).toEqual("REJECTED");
  });

  it("leaves the bid alone when the carrier declines", async () => {
    const load = await makeLoad();
    const carrier = await makeCarrier("Acme Haulage");
    const bid = await seed(() => Bid.create({
      loadId: load._id,
      fleetOwnerId: carrier.fleetOwner._id,
      amount: 120,
    }));

    await request(app)
      .post(`/api/loads/${load.loadId}/revise-bid`)
      .set("role", "staff")
      .send({ bidId: bid._id.toString(), newAmount: 50 });

    const res = await request(app)
      .post(`/api/loads/${load.loadId}/negotiation/respond`)
      .set("role", "fleetOwner")
      .set("userid", carrier.userId)
      .send({ bidId: bid._id.toString(), accept: false });

    expect(res.statusCode).toEqual(200);

    const stored = await seed(() => Bid.findById(bid._id));
    expect(stored.amount).toEqual(120);
    expect(stored.negotiation.status).toEqual("DECLINED");

    const untouched = await seed(() => Load.findById(load._id));
    expect(untouched.status).toEqual("VERIFIED");
  });

  it("refuses a response from a carrier who does not own the bid", async () => {
    const load = await makeLoad();
    const owner = await makeCarrier("Acme Haulage");
    const other = await makeCarrier("Rival Freight");

    const bid = await seed(() => Bid.create({
      loadId: load._id,
      fleetOwnerId: owner.fleetOwner._id,
      amount: 120,
    }));

    await request(app)
      .post(`/api/loads/${load.loadId}/revise-bid`)
      .set("role", "staff")
      .send({ bidId: bid._id.toString(), newAmount: 50 });

    const res = await request(app)
      .post(`/api/loads/${load.loadId}/negotiation/respond`)
      .set("role", "fleetOwner")
      .set("userid", other.userId)
      .send({ bidId: bid._id.toString(), accept: true });

    expect(res.statusCode).toEqual(403);
    expect((await seed(() => Bid.findById(bid._id))).amount).toEqual(120);
  });

  it("rejects an acceptance once the load went to somebody else", async () => {
    const load = await makeLoad();
    const slow = await makeCarrier("Acme Haulage");
    const fast = await makeCarrier("Rival Freight");

    const bid = await seed(() => Bid.create({
      loadId: load._id,
      fleetOwnerId: slow.fleetOwner._id,
      amount: 120,
    }));

    await request(app)
      .post(`/api/loads/${load.loadId}/revise-bid`)
      .set("role", "staff")
      .send({ bidId: bid._id.toString(), newAmount: 50 });

    // Staff award it manually to the other carrier while the offer sits open.
    await request(app)
      .post(`/api/loads/${load.loadId}/award-bid`)
      .set("role", "staff")
      .send({ fleetOwnerId: fast.fleetOwner._id.toString(), bidAmount: 90 });

    const res = await request(app)
      .post(`/api/loads/${load.loadId}/negotiation/respond`)
      .set("role", "fleetOwner")
      .set("userid", slow.userId)
      .send({ bidId: bid._id.toString(), accept: true });

    expect(res.statusCode).toEqual(409);

    const awarded = await seed(() => Load.findById(load._id));
    expect(awarded.winningBid.fleetOwnerId.toString()).toEqual(
      fast.fleetOwner._id.toString(),
    );
    expect(awarded.vendorRate).toEqual(90);
  });

  it("keeps a manual award's payout in step with the awarded amount", async () => {
    const load = await makeLoad();
    const carrier = await makeCarrier("Acme Haulage");
    await seed(() => Bid.create({
      loadId: load._id,
      fleetOwnerId: carrier.fleetOwner._id,
      amount: 50,
    }));

    await request(app)
      .post(`/api/loads/${load.loadId}/award-bid`)
      .set("role", "staff")
      .send({ fleetOwnerId: carrier.fleetOwner._id.toString(), bidAmount: 50 });

    const awarded = await seed(() => Load.findById(load._id));
    // vendorRate started at the 400 target rate; the app reads it as the
    // carrier payout, so it has to follow the settled bid.
    expect(awarded.vendorRate).toEqual(50);
    expect(awarded.winningBid.amount).toEqual(50);
  });
});
