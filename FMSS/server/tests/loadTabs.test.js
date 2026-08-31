// The Load Management tab split: All Transit shows work still moving, the Over
// tab shows the loads whose journey has ended, and an invoiceable load goes to
// Accounting instead of either. All three read the same ASSIGNED loads, so the
// only thing keeping one out of the others is this filter — if it ever stops
// agreeing with itself a load falls out of every tab and vanishes from the
// office view entirely.

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
        baseLoad({ loadId: "OVER-LIY", transportStatus: "LOADED_IN_YARD" }),
        baseLoad({ loadId: "OVER-DIW", transportStatus: "DROP_IN_WAREHOUSE" }),
        baseLoad({ loadId: "ACCT-INV", transportStatus: "INVOICED" }),
      ]),
    );
  });

  it("gives the Over tab exactly the finished loads, yard and warehouse included", async () => {
    const res = await request(app).get("/api/loads?completed=true");

    expect(res.statusCode).toEqual(200);
    expect(ids(res)).toEqual([
      "OVER-DEL",
      "OVER-DIW",
      "OVER-EIY",
      "OVER-LIY",
      "OVER-STR",
      "OVER-TER",
    ]);
  });

  it("keeps finished loads out of All Transit", async () => {
    const res = await request(app).get("/api/loads?status=ASSIGNED&completed=false");

    expect(res.statusCode).toEqual(200);
    expect(ids(res)).toEqual(["MOVING-1", "MOVING-2", "MOVING-3"]);
  });

  it("sends an invoiceable load to Accounting rather than Over", async () => {
    const res = await request(app).get("/api/loads?accounting=true");

    expect(res.statusCode).toEqual(200);
    expect(ids(res)).toEqual(["ACCT-INV"]);
  });

  it("keeps an invoiceable load out of All Transit and out of Over", async () => {
    const transit = await request(app).get("/api/loads?status=ASSIGNED&completed=false");
    const over = await request(app).get("/api/loads?completed=true");

    expect(ids(transit)).not.toContain("ACCT-INV");
    expect(ids(over)).not.toContain("ACCT-INV");
  });

  it("puts every load in exactly one destination, never none", async () => {
    const transit = await request(app).get("/api/loads?status=ASSIGNED&completed=false");
    const over = await request(app).get("/api/loads?completed=true");
    const accounting = await request(app).get("/api/loads?accounting=true");

    expect([...ids(transit), ...ids(over), ...ids(accounting)].sort()).toEqual([
      "ACCT-INV",
      "MOVING-1",
      "MOVING-2",
      "MOVING-3",
      "OVER-DEL",
      "OVER-DIW",
      "OVER-EIY",
      "OVER-LIY",
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

    expect(res.body.length).toEqual(10);
  });
});
