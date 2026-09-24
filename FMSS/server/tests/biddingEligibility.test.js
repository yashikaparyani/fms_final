// Approved and insured, or no board.
//
// A carrier sees loads open for bidding — and may bid on them — only once the
// office has approved their onboarding AND their insurance certificates are on
// file. Both, not either: the office can approve a file with insurance still
// outstanding, and that approval is not a licence to haul uninsured.
//
// The board returns an empty list rather than an error, and /my-capacity says
// why, which is what lets the screens explain themselves. A driver is their
// carrier's account: they see exactly what the carrier sees.

const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const { connect, closeDatabase, clearDatabase } = require("./setup");
const { seed, clearedToBid, TEST_LOCATION_ID } = require("./helpers/tenantTestContext");
const { withTenant } = require("../utils/tenantContext");

const Load = require("../models/Load");
const FleetOwner = require("../models/FleetOwner");
const User = require("../models/User");
const CarrierOnboarding = require("../models/CarrierOnboarding");

const CARRIER_USER_ID = new mongoose.Types.ObjectId();
const DRIVER_USER_ID = new mongoose.Types.ObjectId();

jest.mock("../middleware/auth", () =>
  require("./helpers/tenantTestContext").authMock({ defaultRole: "staff" }),
);

const { getLoads, getMyCapacity } = require("../controllers/loadController");
const { placeOrUpdateBid } = require("../controllers/bidController");

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  const as = req.headers.role || "fleetOwner";
  req.user = {
    _id: as === "driver" ? DRIVER_USER_ID : CARRIER_USER_ID,
    role: as,
    parentAccount: as === "driver" ? CARRIER_USER_ID : undefined,
  };
  next();
});
const scoped = (handler) => (req, res) =>
  withTenant({ locationId: TEST_LOCATION_ID }, () => handler(req, res));

app.get("/api/loads", scoped(getLoads));
app.get("/api/loads/my-capacity", scoped(getMyCapacity));
app.post("/api/loads/:loadId/bids", scoped(placeOrUpdateBid));

let carrier;

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

beforeEach(async () => {
  carrier = await seed(() =>
    FleetOwner.create({ userId: CARRIER_USER_ID, carrierName: "Swift Haulage" }),
  );

  await User.create({
    _id: DRIVER_USER_ID,
    firstName: "Dev",
    email: "driver@swift.com",
    password: "password123",
    role: "driver",
    parentAccount: CARRIER_USER_ID,
  });

  await seed(() =>
    Load.create({
      loadId: "LD 9001",
      createdBy: "staff",
      creatorId: new mongoose.Types.ObjectId(),
      customer: new mongoose.Types.ObjectId(),
      truckType: "Container",
      material: "Boxes",
      amount: 1000,
      status: "VERIFIED",
      bidStatus: "OPEN",
      transportStatus: "NEW_LOAD",
      bidStartTime: new Date(Date.now() - 60000),
      bidEndTime: new Date(Date.now() + 3600000),
    }),
  );
});

/** The onboarding file in whatever state a case needs. */
const fileWith = (over) =>
  seed(() =>
    CarrierOnboarding.findOneAndUpdate(
      { fleetOwner: carrier._id },
      { $set: over },
      { upsert: true, new: true },
    ),
  );

const board = (role = "fleetOwner") =>
  request(app).get("/api/loads").set("role", role);

const capacity = () => request(app).get("/api/loads/my-capacity").set("role", "fleetOwner");

const bid = () =>
  request(app)
    .post("/api/loads/LD 9001/bids")
    .set("role", "fleetOwner")
    .send({ amount: 900 });

describe("Before the office has approved the carrier", () => {
  it("shows no loads, and says why", async () => {
    await fileWith({ status: "UNDER_REVIEW" });

    const res = await board();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);

    const why = await capacity();
    expect(why.body.biddingBlocked.code).toBe("ONBOARDING_NOT_APPROVED");
  });

  it("refuses a bid placed anyway", async () => {
    await fileWith({ status: "UNDER_REVIEW" });

    const res = await bid();
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("ONBOARDING_NOT_APPROVED");
  });

  it("shows nothing to a carrier with no onboarding file at all", async () => {
    expect((await board()).body).toEqual([]);
    expect((await capacity()).body.biddingBlocked.code).toBe("ONBOARDING_NOT_APPROVED");
  });

  it("shows nothing to their driver either", async () => {
    await fileWith({ status: "UNDER_REVIEW" });
    expect((await board("driver")).body).toEqual([]);
  });
});

describe("Approved, but no insurance on file", () => {
  // The office can approve a file with insurance outstanding. That is a
  // decision about paperwork, not permission to haul uninsured.
  beforeEach(() => fileWith({ status: "APPROVED", insurance: { policies: [] } }));

  it("still shows no loads", async () => {
    expect((await board()).body).toEqual([]);
    expect((await capacity()).body.biddingBlocked.code).toBe("INSURANCE_NOT_ON_FILE");
  });

  it("still refuses a bid", async () => {
    const res = await bid();
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("INSURANCE_NOT_ON_FILE");
  });
});

describe("Approved with insurance on file", () => {
  beforeEach(() => clearedToBid(carrier._id));

  it("shows the board to the carrier and to their driver", async () => {
    const carrierBoard = await board();
    expect(carrierBoard.body).toHaveLength(1);
    expect(carrierBoard.body[0].loadId).toBe("LD 9001");

    expect((await board("driver")).body).toHaveLength(1);

    const why = await capacity();
    expect(why.body.biddingBlocked).toBeNull();
  });

  it("takes a bid", async () => {
    const res = await bid();
    expect(res.statusCode).toBe(201);
  });
});
