// The Load Management tab split: All Transit shows work still moving, the Over
// tab shows the loads whose journey has ended. Both read the same ASSIGNED
// loads, so the only thing keeping one out of the other is this filter — if it
// ever stops agreeing with itself a load falls out of both tabs and vanishes
// from the office view entirely.

const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const { connect, closeDatabase, clearDatabase } = require("./setup");
const { seed, TEST_LOCATION_ID } = require("./helpers/tenantTestContext");
const { withTenant } = require("../utils/tenantContext");
const Load = require("../models/Load");

const STAFF_ID = new mongoose.Types.ObjectId();

jest.mock("../middleware/auth", () =>
  require("./helpers/tenantTestContext").authMock({ defaultRole: "staff" }),
);

const { getLoads } = require("../controllers/loadController");

const app = express();
app.use(express.json());
app.use(
  "/api/loads",
  (req, res, next) => {
    req.user = { _id: STAFF_ID, role: req.headers.role || "staff" };
    next();
  },
  (req, res) =>
    withTenant({ locationId: TEST_LOCATION_ID }, () => getLoads(req, res)),
);

const baseLoad = (over = {}) => ({
  createdBy: "staff",
  creatorId: STAFF_ID,
  customer: new mongoose.Types.ObjectId(),
  truckType: "Flatbed",
  material: "Steel",
  amount: 1000,
  status: "ASSIGNED",
  ...over,
});

const ids = (res) => res.body.map((l) => l.loadId).sort();

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe("GET /api/loads — All Transit vs Over", () => {
  beforeEach(async () => {
    await seed(() =>
      Load.create([
        baseLoad({ loadId: "MOVING-1", transportStatus: "IN_TRANSIT" }),
        baseLoad({ loadId: "MOVING-2", transportStatus: "PICKED_UP" }),
        baseLoad({ loadId: "MOVING-3", transportStatus: "REACHED_DESTINATION" }),
        baseLoad({ loadId: "OVER-DEL", transportStatus: "DELIVERED" }),
        baseLoad({ loadId: "OVER-TER", transportStatus: "TERMINATED" }),
        baseLoad({ loadId: "OVER-STR", transportStatus: "STREET_TURN" }),
        baseLoad({ loadId: "OVER-EIY", transportStatus: "EMPTY_IN_YARD" }),
      ]),
    );
  });

  it("gives the Over tab exactly the finished loads", async () => {
    const res = await request(app).get("/api/loads?completed=true");

    expect(res.statusCode).toEqual(200);
    expect(ids(res)).toEqual(["OVER-DEL", "OVER-EIY", "OVER-STR", "OVER-TER"]);
  });

  it("keeps finished loads out of All Transit", async () => {
    const res = await request(app).get("/api/loads?status=ASSIGNED&completed=false");

    expect(res.statusCode).toEqual(200);
    expect(ids(res)).toEqual(["MOVING-1", "MOVING-2", "MOVING-3"]);
  });

  it("puts every load in one tab or the other, never neither", async () => {
    const transit = await request(app).get("/api/loads?status=ASSIGNED&completed=false");
    const over = await request(app).get("/api/loads?completed=true");

    expect([...ids(transit), ...ids(over)].sort()).toEqual([
      "MOVING-1",
      "MOVING-2",
      "MOVING-3",
      "OVER-DEL",
      "OVER-EIY",
      "OVER-STR",
      "OVER-TER",
    ]);
  });

  it("lets the status dropdown filter inside a tab", async () => {
    // Filtering for Delivered has to return the delivered load rather than
    // being cancelled out by the tab it was opened from.
    const res = await request(app).get(
      "/api/loads?status=ASSIGNED&completed=false&transportStatus=DELIVERED",
    );

    expect(ids(res)).toEqual(["OVER-DEL"]);
  });

  it("leaves an unfiltered call untouched", async () => {
    const res = await request(app).get("/api/loads?status=ASSIGNED");

    expect(res.body.length).toEqual(7);
  });
});
