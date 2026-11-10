// "Available at locations": which locations list a customer, carrier, stop
// company or other master record. See utils/availability.js.

const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");

const { connect, closeDatabase, clearDatabase } = require("./setup");
const { getJwtSecret } = require("../utils/jwtSecret");
const { runUnscoped } = require("../utils/tenantContext");
const { resetBranchCodeCache } = require("../utils/sequence");

const User = require("../models/User");
const Branch = require("../models/Branch");
const Company = require("../models/Company");
const FleetOwner = require("../models/FleetOwner");

const app = express();
app.use(express.json());
app.use("/api/companies", require("../routes/companyRoutes"));
app.use("/api/fleet-owners", require("../routes/fleetOwnerRoutes"));

const tokenFor = (user) => jwt.sign({ id: user._id }, getJwtSecret());
const as = (method, path, user, location) =>
  request(app)
    [method](path)
    .set("Authorization", `Bearer ${tokenFor(user)}`)
    .set("x-location-id", location === "all" ? "all" : String(location._id));

beforeAll(async () => await connect());
afterEach(async () => {
  await clearDatabase();
  resetBranchCodeCache();
});
afterAll(async () => await closeDatabase());

let ny;
let chi;
let la;
let roving; // works in New York and Chicago
let chicagoOnly;

beforeEach(async () => {
  await runUnscoped(async () => {
    ny = await Branch.create({ name: "New York", code: "NY" });
    chi = await Branch.create({ name: "Chicago", code: "CHI" });
    la = await Branch.create({ name: "Los Angeles", code: "LA" });
  });
  roving = await User.create({
    email: "roving@fms.com",
    password: "x",
    role: "staff",
    locations: [ny._id, chi._id],
    defaultLocation: ny._id,
  });
  chicagoOnly = await User.create({
    email: "chi@fms.com",
    password: "x",
    role: "staff",
    locations: [chi._id],
    defaultLocation: chi._id,
  });
});

const names = (res) => res.body.map((c) => c.name).sort();

describe("Available at locations", () => {
  it("defaults a new record to the location it was added in", async () => {
    const res = await as("post", "/api/companies", roving, ny).send({ name: "Port Newark" });
    expect(res.status).toBe(201);
    expect(res.body.availableAt.map(String)).toEqual([String(ny._id)]);

    expect(names(await as("get", "/api/companies", roving, ny))).toEqual(["Port Newark"]);
    expect(names(await as("get", "/api/companies", roving, chi))).toEqual([]);
  });

  it("lists a record at each location ticked", async () => {
    const res = await as("post", "/api/companies", roving, ny).send({
      name: "Rail Yard",
      availableAt: [String(ny._id), String(chi._id)],
    });
    expect(res.status).toBe(201);

    expect(names(await as("get", "/api/companies", roving, chi))).toEqual(["Rail Yard"]);
    expect(names(await as("get", "/api/companies", chicagoOnly, chi))).toEqual(["Rail Yard"]);
  });

  it("refuses a location the user does not work in", async () => {
    const res = await as("post", "/api/companies", roving, ny).send({
      name: "Faraway",
      availableAt: [String(la._id)],
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("LOCATION_FORBIDDEN");
  });

  it("needs a pick while viewing all locations", async () => {
    const none = await as("post", "/api/companies", roving, "all").send({ name: "Unplaced" });
    expect(none.status).toBe(400);

    const picked = await as("post", "/api/companies", roving, "all").send({
      name: "Placed",
      availableAt: [String(chi._id)],
    });
    expect(picked.status).toBe(201);
    expect(String(picked.body.locationId)).toBe(String(chi._id));
  });

  it("keeps the locations an editor cannot see", async () => {
    const created = await as("post", "/api/companies", roving, ny).send({
      name: "Shared Dock",
      availableAt: [String(ny._id), String(chi._id)],
    });

    // Chicago-only staff send back the full list they were shown, unchanged.
    const echoed = await as("put", `/api/companies/${created.body._id}`, chicagoOnly, chi).send({
      notes: "gate 4",
      availableAt: created.body.availableAt,
    });
    expect(echoed.status).toBe(200);
    expect(echoed.body.availableAt.map(String).sort()).toEqual(
      [String(ny._id), String(chi._id)].sort(),
    );

    // Unticking Chicago leaves New York, which they never saw a box for.
    const unticked = await as("put", `/api/companies/${created.body._id}`, chicagoOnly, chi).send({
      availableAt: [],
    });
    expect(unticked.status).toBe(200);
    expect(unticked.body.availableAt.map(String)).toEqual([String(ny._id)]);
  });

  it("gives a carrier's login the carrier's locations", async () => {
    const created = await as("post", "/api/fleet-owners", roving, ny).send({
      carrierName: "Two City Haul",
      availableAt: [String(ny._id), String(chi._id)],
      createUserAccount: true,
      contactPersons: [{ name: "Ann", email: "ann@twocity.com", isPrimary: true }],
    });
    expect(created.status).toBe(201);
    const login = await User.findOne({ email: "ann@twocity.com" }).lean();
    expect(login.locations.map(String).sort()).toEqual([String(ny._id), String(chi._id)].sort());

    const updated = await as("put", `/api/fleet-owners/${created.body.fleetOwner._id}`, roving, ny).send({
      availableAt: [String(chi._id)],
    });
    expect(updated.status).toBe(200);
    const after = await User.findById(login._id).lean();
    expect(after.locations.map(String)).toEqual([String(chi._id)]);
    expect(String(after.defaultLocation)).toBe(String(chi._id));

    const fo = await runUnscoped(() => FleetOwner.findById(created.body.fleetOwner._id).lean());
    expect(fo.availableAt.map(String)).toEqual([String(chi._id)]);
  });

  it("does not let the body set availability around the checks", async () => {
    const created = await runUnscoped(() =>
      Company.create({ name: "Direct", availableAt: [chi._id], locationId: chi._id }),
    );
    const res = await as("put", `/api/companies/${created._id}`, chicagoOnly, chi).send({
      availableAt: [String(la._id)],
    });
    expect(res.status).toBe(403);
  });
});
