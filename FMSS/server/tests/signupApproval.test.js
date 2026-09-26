// Public sign-up → office approval. The approval path is what mints the account
// and, for a carrier, its FleetOwner record. It broke in production with
//   FleetOwner validation failed: addresses.0: Cast to [ObjectId] failed ...
// because the typed address was pushed straight into `addresses`, which holds
// Address *references*, not embedded address objects. These tests pin the fix:
// approval succeeds and the address is stored as a real Address document the
// reference resolves to.

const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");

const { connect, closeDatabase, clearDatabase } = require("./setupReplSet");
const { getJwtSecret } = require("../utils/jwtSecret");
const { runUnscoped } = require("../utils/tenantContext");

const Branch = require("../models/Branch");
const User = require("../models/User");
const FleetOwner = require("../models/FleetOwner");
const Address = require("../models/common/Address");

const signupRoutes = require("../routes/signupRoutes");

const app = express();
app.use(express.json());
app.use("/api/signups", signupRoutes);

const tokenFor = (user) => jwt.sign({ id: user._id }, getJwtSecret());

const call = (method, path, user, branch) => {
  const req = request(app)[method](path);
  if (user) req.set("Authorization", `Bearer ${tokenFor(user)}`);
  if (branch) req.set("x-location-id", String(branch._id));
  return req;
};

let branch;
let staff;

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

beforeEach(async () => {
  await runUnscoped(async () => {
    branch = await Branch.create({ name: "Head Office", code: "HO" });
  });

  staff = await User.create({
    email: "office@fms.com",
    password: "password123",
    role: "staff",
    locations: [branch._id],
    defaultLocation: branch._id,
    permissions: ["fleetOwners.view", "fleetOwners.edit"],
  });
});

const submitCarrier = () =>
  request(app).post("/api/signups").send({
    role: "fleetOwner",
    email: "dispatch@vinehaul.com",
    phone: "555-0101",
    carrierName: "Vine Haulage",
    mcLicense: "MC-9001",
    dotLicense: "DOT-7002",
    street: "8560 Vine Ln",
    city: "Tracy",
    state: "CA",
    zip: "94612",
    locationId: String(branch._id),
  });

describe("POST /api/signups/:id/approve — carrier", () => {
  it("approves a carrier and stores the address as an Address reference", async () => {
    const submit = await submitCarrier();
    expect(submit.statusCode).toBe(201);

    const approve = await call(
      "post",
      `/api/signups/${submit.body.request.id}/approve`,
      staff,
      branch,
    );

    // The bug returned 500 with the CastError here.
    expect(approve.statusCode).toBe(200);

    const carrier = await runUnscoped(() =>
      FleetOwner.findOne({ carrierName: "Vine Haulage" }).lean(),
    );
    expect(carrier).toBeTruthy();

    // The one thing the bug got wrong: addresses must hold ObjectId references,
    // not embedded objects.
    expect(carrier.addresses).toHaveLength(1);
    const ref = carrier.addresses[0];
    expect(mongooseObjectId(ref)).toBe(true);

    const address = await runUnscoped(() => Address.findById(ref).lean());
    expect(address).toMatchObject({
      street: "8560 Vine Ln",
      city: "Tracy",
      state: "CA",
      zip: "94612",
    });
  });
});

// Small local check that keeps the assertion readable — the stored ref should be
// an ObjectId, never a stringified address object.
const mongoose = require("mongoose");
function mongooseObjectId(value) {
  return value instanceof mongoose.Types.ObjectId;
}
