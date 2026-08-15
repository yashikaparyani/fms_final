// Staff administration and the permission/location grid.
//
// Uses the real auth middleware and real tokens rather than a mocked `protect`:
// what is being tested here IS the authorisation, so stubbing it out would leave
// the interesting half untested.

const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const { connect, closeDatabase, clearDatabase } = require("./setup");
const { getJwtSecret } = require("../utils/jwtSecret");

const User = require("../models/User");
const Branch = require("../models/Branch");
const staffRoutes = require("../routes/staffRoutes");
const branchRoutes = require("../routes/branchRoutes");
const { sanitizePermissions, ALL_PERMISSIONS } = require("../config/permissions");

const app = express();
app.use(express.json());
app.use("/api/staff", staffRoutes);
app.use("/api/branches", branchRoutes);

const tokenFor = (user) => jwt.sign({ id: user._id }, getJwtSecret());

const auth = (user) => ["Authorization", `Bearer ${tokenFor(user)}`];

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

let admin;
let ny;
let chi;

beforeEach(async () => {
  ny = await Branch.create({ name: "New York", code: "NY" });
  chi = await Branch.create({ name: "Chicago", code: "CHI" });

  admin = await User.create({
    firstName: "Root",
    lastName: "Admin",
    email: "root@fms.com",
    password: "password123",
    role: "admin",
  });
});

describe("Permission catalog", () => {
  it("serves the modules, templates and assignable locations together", async () => {
    const res = await request(app)
      .get("/api/staff/permission-catalog")
      .set(...auth(admin));

    expect(res.statusCode).toBe(200);
    expect(res.body.modules.length).toBeGreaterThan(0);
    expect(res.body.templates.length).toBeGreaterThan(0);
    expect(res.body.locations.map((l) => l.code).sort()).toEqual(["CHI", "NY"]);
  });

  it("drops permission keys this build does not know about", () => {
    expect(sanitizePermissions(["loads.view", "nonsense.explode", "loads.view"])).toEqual(
      ["loads.view"],
    );
  });
});

describe("POST /api/staff/bulk", () => {
  it("creates several accounts with the shared locations and template", async () => {
    const res = await request(app)
      .post("/api/staff/bulk")
      .set(...auth(admin))
      .send({
        members: [
          { firstName: "Ann", email: "ann@fms.com" },
          { firstName: "Bob", email: "bob@fms.com" },
          { firstName: "Cal", email: "cal@fms.com" },
        ],
        locations: [String(ny._id)],
        template: "dispatcher",
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.createdCount).toBe(3);
    expect(res.body.failedCount).toBe(0);

    const ann = await User.findOne({ email: "ann@fms.com" });
    expect(ann.role).toBe("staff");
    expect(ann.permissions).toContain("loads.create");
    expect(ann.permissions).not.toContain("staff.create");
    expect(ann.locations.map(String)).toEqual([String(ny._id)]);
    expect(String(ann.defaultLocation)).toBe(String(ny._id));
  });

  it("hashes the generated password so the new account can actually sign in", async () => {
    const res = await request(app)
      .post("/api/staff/bulk")
      .set(...auth(admin))
      .send({
        members: [{ firstName: "Dee", email: "dee@fms.com" }],
        locations: [String(ny._id)],
        template: "viewer",
      });

    const issued = res.body.created[0].password;
    expect(issued).toBeTruthy();

    const stored = await User.findOne({ email: "dee@fms.com" }).select("+password");
    expect(stored.password).not.toBe(issued); // not sitting there in the clear
    expect(await bcrypt.compare(issued, stored.password)).toBe(true);
  });

  it("keeps the good rows when one fails, and says which failed", async () => {
    await User.create({
      email: "taken@fms.com",
      password: "x",
      role: "client",
    });

    const res = await request(app)
      .post("/api/staff/bulk")
      .set(...auth(admin))
      .send({
        members: [
          { firstName: "Good", email: "good@fms.com" },
          { firstName: "Clash", email: "taken@fms.com" },
          { firstName: "Dup", email: "dup@fms.com" },
          { firstName: "DupAgain", email: "dup@fms.com" },
        ],
        locations: [String(ny._id)],
      });

    expect(res.statusCode).toBe(207);
    expect(res.body.createdCount).toBe(2); // good + the first dup
    expect(res.body.failedCount).toBe(2);

    // Failures are addressed by row so the form can show them in place.
    expect(res.body.failed.map((f) => f.index).sort()).toEqual([1, 3]);
    expect(res.body.failed[0].message).toMatch(/already exists/i);
    expect(res.body.failed[1].message).toMatch(/more than once/i);

    expect(await User.findOne({ email: "good@fms.com" })).toBeTruthy();
  });

  it("refuses a location that does not exist", async () => {
    const res = await request(app)
      .post("/api/staff/bulk")
      .set(...auth(admin))
      .send({
        members: [{ email: "eve@fms.com" }],
        locations: ["507f1f77bcf86cd799439011"],
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.failed[0].message).toMatch(/does not exist/i);
    expect(await User.findOne({ email: "eve@fms.com" })).toBeNull();
  });

  it("refuses a deactivated location rather than silently dropping it", async () => {
    chi.active = false;
    await chi.save();

    const res = await request(app)
      .post("/api/staff/bulk")
      .set(...auth(admin))
      .send({
        members: [{ email: "fay@fms.com" }],
        locations: [String(chi._id)],
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.failed[0].message).toMatch(/deactivated location/i);
  });
});

describe("PUT /api/staff/access — the who-sees-what grid", () => {
  let ann;
  let bob;

  beforeEach(async () => {
    ann = await User.create({
      email: "ann@fms.com",
      password: "x",
      role: "staff",
      locations: [ny._id],
      defaultLocation: ny._id,
    });
    bob = await User.create({
      email: "bob@fms.com",
      password: "x",
      role: "staff",
      locations: [ny._id],
    });
  });

  it("saves several rows in one request", async () => {
    const res = await request(app)
      .put("/api/staff/access")
      .set(...auth(admin))
      .send({
        assignments: [
          { userId: String(ann._id), locations: [String(ny._id), String(chi._id)] },
          { userId: String(bob._id), locations: [String(chi._id)] },
        ],
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.updatedCount).toBe(2);

    const savedAnn = await User.findById(ann._id);
    expect(savedAnn.locations.map(String).sort()).toEqual(
      [String(ny._id), String(chi._id)].sort(),
    );

    const savedBob = await User.findById(bob._id);
    expect(savedBob.locations.map(String)).toEqual([String(chi._id)]);
    // Bob's sign-in location had to move with him — NY is no longer his.
    expect(String(savedBob.defaultLocation)).toBe(String(chi._id));
  });

  it("re-points a default location that falls outside the new set", async () => {
    await request(app)
      .put(`/api/staff/${ann._id}/access`)
      .set(...auth(admin))
      .send({ locations: [String(chi._id)] });

    const saved = await User.findById(ann._id);
    expect(String(saved.defaultLocation)).toBe(String(chi._id));
  });

  it("refuses to scope an admin to particular locations", async () => {
    const other = await User.create({
      email: "other-admin@fms.com",
      password: "x",
      role: "admin",
    });

    const res = await request(app)
      .put(`/api/staff/${other._id}/access`)
      .set(...auth(admin))
      .send({ locations: [String(ny._id)] });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/reaches every location/i);
  });

  it("stores only permission keys the catalog knows about", async () => {
    await request(app)
      .put(`/api/staff/${ann._id}/access`)
      .set(...auth(admin))
      .send({ permissions: ["loads.view", "made.up", "reports.view"] });

    const saved = await User.findById(ann._id);
    expect(saved.permissions.sort()).toEqual(["loads.view", "reports.view"]);
  });
});

describe("Authorisation", () => {
  it("keeps staff out of staff administration entirely", async () => {
    // Even holding every permission there is: the route is admin-only by role,
    // and the permission gate sits on top of that rather than replacing it.
    const staff = await User.create({
      email: "nosy@fms.com",
      password: "x",
      role: "staff",
      locations: [ny._id],
      permissions: ALL_PERMISSIONS,
    });

    const res = await request(app)
      .get("/api/staff")
      .set(...auth(staff));

    expect(res.statusCode).toBe(403);
  });

  it("rejects a request with no token", async () => {
    const res = await request(app).get("/api/staff");
    expect(res.statusCode).toBe(401);
  });

  it("stops a removed account from using a token issued before removal", async () => {
    const doomed = await User.create({
      email: "doomed@fms.com",
      password: "x",
      role: "admin",
    });
    const stillHeldToken = tokenFor(doomed);

    await request(app)
      .delete(`/api/staff/${doomed._id}`)
      .set(...auth(admin))
      .expect(200);

    const res = await request(app)
      .get("/api/staff")
      .set("Authorization", `Bearer ${stillHeldToken}`);

    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe("ACCOUNT_DEACTIVATED");
  });

  it("will not let an admin remove their own account", async () => {
    const res = await request(app)
      .delete(`/api/staff/${admin._id}`)
      .set(...auth(admin));

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/your own account/i);
  });

  it("will not let an admin deactivate themselves", async () => {
    const res = await request(app)
      .put(`/api/staff/${admin._id}`)
      .set(...auth(admin))
      .send({ isActive: false });

    expect(res.statusCode).toBe(400);
  });
});

describe("Bootstrap", () => {
  it("lets an admin reach the Locations screen when no branch exists yet", async () => {
    // The deadlock this guards against: an admin's locations are "every active
    // branch", so a fresh install gives them an empty set — and the screen that
    // creates the first branch sits behind the same middleware.
    await Branch.deleteMany({});

    const list = await request(app)
      .get("/api/branches")
      .set(...auth(admin));
    expect(list.statusCode).toBe(200);

    const created = await request(app)
      .post("/api/branches")
      .set(...auth(admin))
      .send({ name: "Head Office", code: "HO" });
    expect(created.statusCode).toBe(201);
  });

  it("serves an empty board rather than a stack trace on a fresh install", async () => {
    // The regression this guards: letting the admin past the 403 but leaving
    // every tenant-scoped query throwing just moves the dead end one screen
    // later, from "no location assigned" to a raw internal error.
    await Branch.deleteMany({});

    const app2 = express();
    app2.use(express.json());
    app2.use("/api/loads", require("../routes/loadRoutes"));

    const res = await request(app2)
      .get("/api/loads")
      .set("Authorization", `Bearer ${tokenFor(admin)}`);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body) ? res.body : res.body.data).toEqual([]);
  });

  it("still refuses a staff member with no location", async () => {
    const stranded = await User.create({
      email: "stranded@fms.com",
      password: "x",
      role: "staff",
      permissions: ["locations.view"],
    });

    const res = await request(app)
      .get("/api/branches")
      .set(...auth(stranded));

    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("NO_LOCATION");
  });
});
