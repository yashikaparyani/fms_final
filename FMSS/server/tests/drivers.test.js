// Driver sub-accounts: a carrier adds their own drivers, each optionally getting
// a login of their own, and those logins resolve back to the carrier that issued
// them — never to any other.

const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const { connect, closeDatabase, clearDatabase } = require("./setup");
const { getJwtSecret } = require("../utils/jwtSecret");
const { runUnscoped, withTenant } = require("../utils/tenantContext");
const { resetBranchCodeCache } = require("../utils/sequence");
const { carrierUserIdFor } = require("../utils/carrierAccount");

const User = require("../models/User");
const Branch = require("../models/Branch");
const Driver = require("../models/Driver");
const FleetOwner = require("../models/FleetOwner");
const driverRoutes = require("../routes/driverRoutes");

const app = express();
app.use(express.json());
app.use("/api/drivers", driverRoutes);

const tokenFor = (user) => jwt.sign({ id: user._id }, getJwtSecret());

beforeAll(async () => await connect());
afterEach(async () => {
  await clearDatabase();
  resetBranchCodeCache(); // codes are cached per process; the DB just went away
});
afterAll(async () => await closeDatabase());

let ny;
let chi;
let carrierUser;
let carrier;
let rivalUser;
let rival;

/** A request as `user`, pinned to `branch` via the header the client sends. */
const req = {
  get: (path, user, branch) =>
    request(app)
      .get(path)
      .set("Authorization", `Bearer ${tokenFor(user)}`)
      .set("x-location-id", String(branch._id)),
  post: (path, user, branch) =>
    request(app)
      .post(path)
      .set("Authorization", `Bearer ${tokenFor(user)}`)
      .set("x-location-id", String(branch._id)),
  put: (path, user, branch) =>
    request(app)
      .put(path)
      .set("Authorization", `Bearer ${tokenFor(user)}`)
      .set("x-location-id", String(branch._id)),
  delete: (path, user, branch) =>
    request(app)
      .delete(path)
      .set("Authorization", `Bearer ${tokenFor(user)}`)
      .set("x-location-id", String(branch._id)),
};

beforeEach(async () => {
  await runUnscoped(async () => {
    ny = await Branch.create({ name: "New York", code: "NY" });
    chi = await Branch.create({ name: "Chicago", code: "CHI" });
  });

  carrierUser = await User.create({
    firstName: "Swift Haulage",
    email: "swift@carrier.com",
    password: "password123",
    role: "fleetOwner",
    locations: [ny._id],
    defaultLocation: ny._id,
  });

  rivalUser = await User.create({
    firstName: "Rival Freight",
    email: "rival@carrier.com",
    password: "password123",
    role: "fleetOwner",
    locations: [ny._id],
    defaultLocation: ny._id,
  });

  await withTenant({ locationId: String(ny._id) }, async () => {
    carrier = await FleetOwner.create({
      userId: carrierUser._id,
      carrierName: "Swift Haulage",
    });
    rival = await FleetOwner.create({
      userId: rivalUser._id,
      carrierName: "Rival Freight",
    });
  });
});

describe("POST /api/drivers/bulk", () => {
  it("adds several drivers and issues a sub-account to each one with an email", async () => {
    const res = await req
      .post("/api/drivers/bulk", carrierUser, ny)
      .send({
        drivers: [
          { name: "Ravi Kumar", phone: "555-0101", email: "ravi@swift.com" },
          { name: "Meera Nair", phone: "555-0102", email: "meera@swift.com" },
          // No email: a real record, no login. The common case for a small
          // carrier, and it must not be an error.
          { name: "Old Hand", phone: "555-0103" },
        ],
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.createdCount).toBe(3);

    const withLogins = res.body.created.filter((c) => c.password);
    expect(withLogins).toHaveLength(2);

    const drivers = await withTenant({ locationId: String(ny._id) }, () =>
      Driver.find().sort({ name: 1 }),
    );
    expect(drivers).toHaveLength(3);

    const ravi = drivers.find((d) => d.name === "Ravi Kumar");
    expect(ravi.driverCode).toMatch(/^NY-DR-\d{4}$/);
    expect(ravi.userId).toBeTruthy();

    const account = await User.findById(ravi.userId);
    expect(account.role).toBe("driver");
    // The whole point: the sub-account points at the carrier's own user.
    expect(String(account.parentAccount)).toBe(String(carrierUser._id));
    expect(account.locations.map(String)).toEqual([String(ny._id)]);

    const noLogin = drivers.find((d) => d.name === "Old Hand");
    expect(noLogin.userId).toBeUndefined();
  });

  it("hashes the driver's password so the sub-account can sign in", async () => {
    const res = await req
      .post("/api/drivers/bulk", carrierUser, ny)
      .send({ drivers: [{ name: "Ravi", email: "ravi@swift.com" }] });

    const issued = res.body.created[0].password;
    const account = await User.findOne({ email: "ravi@swift.com" }).select("+password");

    expect(account.password).not.toBe(issued);
    expect(await bcrypt.compare(issued, account.password)).toBe(true);
  });

  it("keeps the good rows when one clashes, and reports the failures by row", async () => {
    await User.create({
      email: "taken@swift.com",
      password: "x",
      role: "client",
    });

    const res = await req
      .post("/api/drivers/bulk", carrierUser, ny)
      .send({
        drivers: [
          { name: "Fine", email: "fine@swift.com" },
          { name: "Clash", email: "taken@swift.com" },
          { name: "Twice", email: "dup@swift.com" },
          { name: "Again", email: "dup@swift.com" },
        ],
      });

    expect(res.statusCode).toBe(207);
    expect(res.body.createdCount).toBe(2);
    expect(res.body.failed.map((f) => f.index)).toEqual([1, 3]);

    // The clashing row must leave nothing behind — a Driver with no login where
    // one was asked for would read as success in the roster.
    const drivers = await withTenant({ locationId: String(ny._id) }, () =>
      Driver.find({ email: "taken@swift.com" }),
    );
    expect(drivers).toHaveLength(0);
  });

  it("refuses a driver login when the carrier has no portal account to hang it on", async () => {
    let orphan;
    await withTenant({ locationId: String(ny._id) }, async () => {
      orphan = await FleetOwner.create({ carrierName: "No Login Carrier" });
    });

    const staff = await User.create({
      email: "office@fms.com",
      password: "x",
      role: "staff",
      locations: [ny._id],
      defaultLocation: ny._id,
    });

    const res = await req
      .post("/api/drivers/bulk", staff, ny)
      .send({
        fleetOwnerId: String(orphan._id),
        drivers: [{ name: "Nobody", email: "nobody@swift.com" }],
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.failed[0].message).toMatch(/no portal account/i);
    expect(await User.findOne({ email: "nobody@swift.com" })).toBeNull();
  });

  it("keeps the licence state and class the form sends", async () => {
    // The mobile form's exact payload.
    const res = await req.post("/api/drivers/bulk", carrierUser, ny).send({
      drivers: [
        {
          name: "Amit",
          phone: "4154654448",
          email: "",
          licenseNumber: "E1990146",
          licenseState: "CA",
          licenseClass: "A",
          licenseExpiry: "2028-03-05",
        },
      ],
    });

    expect(res.statusCode).toBe(201);
    const driver = await withTenant({ locationId: String(ny._id) }, () =>
      Driver.findOne({ name: "Amit" }),
    );
    expect(driver.licenseState).toBe("CA");
    expect(driver.licenseClass).toBe("A");
  });

  it("brings back a removed driver, and their old login, when they are added again", async () => {
    const first = await req
      .post("/api/drivers/bulk", carrierUser, ny)
      .send({ drivers: [{ name: "Amit", email: "amit@swift.com" }] });
    const driverId = first.body.created[0].driver._id;

    await request(app)
      .delete(`/api/drivers/${driverId}`)
      .set("Authorization", `Bearer ${tokenFor(carrierUser)}`)
      .set("x-location-id", String(ny._id));

    const again = await req
      .post("/api/drivers/bulk", carrierUser, ny)
      .send({ drivers: [{ name: "Amit Chhina", email: "amit@swift.com" }] });

    expect(again.statusCode).toBe(201);
    expect(again.body.created[0].password).toBeTruthy();

    const drivers = await withTenant({ locationId: String(ny._id) }, () =>
      Driver.find({ email: "amit@swift.com" }),
    );
    expect(drivers).toHaveLength(1);
    expect(String(drivers[0]._id)).toBe(driverId);
    expect(drivers[0].active).toBe(true);
    expect(drivers[0].name).toBe("Amit Chhina");

    const account = await User.findOne({ email: "amit@swift.com" }).select("+password");
    expect(account.isActive).toBe(true);
    expect(await bcrypt.compare(again.body.created[0].password, account.password)).toBe(true);
  });

  it("still refuses an email already on the active roster", async () => {
    await req
      .post("/api/drivers/bulk", carrierUser, ny)
      .send({ drivers: [{ name: "Amit", email: "amit@swift.com" }] });

    const res = await req
      .post("/api/drivers/bulk", carrierUser, ny)
      .send({ drivers: [{ name: "Amit", email: "amit@swift.com" }] });

    expect(res.statusCode).toBe(400);
    expect(res.body.failed[0].message).toMatch(/already on this carrier's driver roster/);
  });

  it("adds an owner-operator under their own sign-in without a second login", async () => {
    const res = await req
      .post("/api/drivers/bulk", carrierUser, ny)
      .send({ drivers: [{ name: "Swift Owner", email: "swift@carrier.com" }] });

    expect(res.statusCode).toBe(201);
    expect(res.body.created[0].usesCarrierLogin).toBe(true);
    expect(res.body.created[0].password).toBeNull();

    const owner = await withTenant({ locationId: String(ny._id) }, () =>
      Driver.findOne({ email: "swift@carrier.com" }),
    );
    expect(owner.userId).toBeUndefined();
    expect(await User.countDocuments({ email: "swift@carrier.com" })).toBe(1);

    // Their next driver still gets a login of their own, under this carrier.
    const next = await req
      .post("/api/drivers/bulk", carrierUser, ny)
      .send({ drivers: [{ name: "Second Driver", email: "second@swift.com" }] });

    expect(next.statusCode).toBe(201);
    const account = await User.findOne({ email: "second@swift.com" });
    expect(account.role).toBe("driver");
    expect(String(account.parentAccount)).toBe(String(carrierUser._id));
  });

  it("puts the reason in the top-level message when nothing was added", async () => {
    // Installed mobile builds read only `message` on a failed add.
    await req
      .post("/api/drivers/bulk", carrierUser, ny)
      .send({ drivers: [{ name: "Amit", email: "amit@swift.com" }] });
    const res = await req
      .post("/api/drivers/bulk", carrierUser, ny)
      .send({ drivers: [{ name: "Amit", email: "amit@swift.com" }] });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(res.body.failed[0].message);
  });
});

describe("Roster isolation", () => {
  beforeEach(async () => {
    await req
      .post("/api/drivers/bulk", carrierUser, ny)
      .send({ drivers: [{ name: "Swift Driver", email: "sd@swift.com" }] });

    await req
      .post("/api/drivers/bulk", rivalUser, ny)
      .send({ drivers: [{ name: "Rival Driver", email: "rd@rival.com" }] });
  });

  it("shows a carrier only their own drivers", async () => {
    const res = await req.get("/api/drivers", carrierUser, ny);

    expect(res.statusCode).toBe(200);
    expect(res.body.map((d) => d.name)).toEqual(["Swift Driver"]);
  });

  it("stops a carrier touching another carrier's driver", async () => {
    const rivals = await withTenant({ locationId: String(ny._id) }, () =>
      Driver.find({ fleetOwner: rival._id }),
    );

    const res = await req
      .put(`/api/drivers/${rivals[0]._id}`, carrierUser, ny)
      .send({ name: "Poached" });

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toMatch(/not on your roster/i);
  });

  it("ignores a fleetOwnerId a carrier supplies for somebody else", async () => {
    // The carrier is read off the account, never off the request — so naming a
    // rival simply lands the driver on the caller's own roster.
    const res = await req
      .post("/api/drivers", carrierUser, ny)
      .send({ name: "Sneaky", fleetOwnerId: String(rival._id) });

    expect(res.statusCode).toBe(201);
    expect(String(res.body.driver.fleetOwner)).toBe(String(carrier._id));
  });

  it("keeps one location's drivers out of another's", async () => {
    const staffBothBranches = await User.create({
      email: "roving@fms.com",
      password: "x",
      role: "staff",
      locations: [ny._id, chi._id],
      defaultLocation: ny._id,
    });

    const chicagoView = await req.get("/api/drivers", staffBothBranches, chi);
    expect(chicagoView.body).toHaveLength(0);

    const newYorkView = await req.get("/api/drivers", staffBothBranches, ny);
    expect(newYorkView.body).toHaveLength(2);
  });
});

describe("A driver's own sub-account", () => {
  let driverAccount;

  beforeEach(async () => {
    await req
      .post("/api/drivers/bulk", carrierUser, ny)
      .send({ drivers: [{ name: "Ravi", email: "ravi@swift.com" }] });

    driverAccount = await User.findOne({ email: "ravi@swift.com" });
  });

  it("resolves to the carrier that issued it", () => {
    expect(String(carrierUserIdFor(driverAccount))).toBe(String(carrierUser._id));
  });

  it("can read the carrier's roster", async () => {
    const res = await req.get("/api/drivers", driverAccount, ny);

    expect(res.statusCode).toBe(200);
    expect(res.body.map((d) => d.name)).toEqual(["Ravi"]);
  });

  it("cannot add drivers to the roster", async () => {
    const res = await req
      .post("/api/drivers", driverAccount, ny)
      .send({ name: "Friend of mine" });

    expect(res.statusCode).toBe(403);
  });
});

describe("Taking a driver off the roster", () => {
  let driver;

  beforeEach(async () => {
    await req
      .post("/api/drivers/bulk", carrierUser, ny)
      .send({ drivers: [{ name: "Ravi", email: "ravi@swift.com" }] });

    [driver] = await withTenant({ locationId: String(ny._id) }, () => Driver.find());
  });

  it("disables their login at the same time", async () => {
    // Doing only one of the two is the gap that leaves a former driver still
    // updating loads from their phone.
    const res = await req.delete(`/api/drivers/${driver._id}`, carrierUser, ny);
    expect(res.statusCode).toBe(200);

    const account = await User.findById(driver.userId);
    expect(account.isActive).toBe(false);

    const stillHeldToken = tokenFor(account);
    const blocked = await request(app)
      .get("/api/drivers")
      .set("Authorization", `Bearer ${stillHeldToken}`)
      .set("x-location-id", String(ny._id));

    expect(blocked.statusCode).toBe(401);
  });

  it("re-enables the login when fresh credentials are issued", async () => {
    await req.delete(`/api/drivers/${driver._id}`, carrierUser, ny);

    const res = await req
      .post(`/api/drivers/${driver._id}/send-credentials`, carrierUser, ny)
      .send({ channel: "manual" });

    expect(res.statusCode).toBe(200);
    expect(res.body.password).toBeTruthy();

    const account = await User.findById(driver.userId);
    expect(account.isActive).toBe(true);
  });
});

describe("Giving an existing driver a login later", () => {
  it("creates the sub-account on the first credential issue", async () => {
    await req
      .post("/api/drivers", carrierUser, ny)
      .send({ name: "Old Hand", phone: "555-0103" });

    const [driver] = await withTenant({ locationId: String(ny._id) }, () =>
      Driver.find(),
    );
    expect(driver.userId).toBeUndefined();

    const res = await req
      .post(`/api/drivers/${driver._id}/send-credentials`, carrierUser, ny)
      .send({ channel: "manual", email: "oldhand@swift.com" });

    expect(res.statusCode).toBe(200);

    const account = await User.findOne({ email: "oldhand@swift.com" });
    expect(account.role).toBe("driver");
    expect(String(account.parentAccount)).toBe(String(carrierUser._id));
  });
});

describe("Admin edits a driver's full licence and details", () => {
  it("updates licence no., state, class, expiry, medical card and endorsements", async () => {
    const admin = await User.create({
      firstName: "Office",
      email: "admin@fms.com",
      password: "password123",
      role: "admin",
      locations: [ny._id],
      defaultLocation: ny._id,
    });

    // A driver on the carrier's roster, added by the carrier.
    await req
      .post("/api/drivers/bulk", carrierUser, ny)
      .send({ drivers: [{ name: "Ravi Kumar", phone: "555-0101" }] });
    const [driver] = await withTenant({ locationId: String(ny._id) }, () => Driver.find());

    const res = await req
      .put(`/api/drivers/${driver._id}`, admin, ny)
      .send({
        licenseNumber: "DL-99881",
        licenseState: "ca",
        licenseClass: "a",
        licenseExpiry: "2027-03-15",
        medicalCardExpiry: "2026-12-01",
        endorsements: ["H", "n", "bogus"],
      });

    expect(res.statusCode).toBe(200);

    const saved = await withTenant({ locationId: String(ny._id) }, () =>
      Driver.findById(driver._id),
    );
    expect(saved.licenseNumber).toBe("DL-99881");
    expect(saved.licenseState).toBe("CA"); // uppercased
    expect(saved.licenseClass).toBe("A"); // uppercased
    expect(saved.licenseExpiry.toISOString().slice(0, 10)).toBe("2027-03-15");
    expect(saved.medicalCardExpiry.toISOString().slice(0, 10)).toBe("2026-12-01");
    // "bogus" dropped, the rest kept and uppercased.
    expect(saved.endorsements).toEqual(["H", "N"]);
  });

  it("rejects an unknown licence class", async () => {
    const admin = await User.create({
      email: "admin2@fms.com",
      password: "password123",
      role: "admin",
      locations: [ny._id],
      defaultLocation: ny._id,
    });
    await req
      .post("/api/drivers/bulk", carrierUser, ny)
      .send({ drivers: [{ name: "Meera Nair" }] });
    const [driver] = await withTenant({ locationId: String(ny._id) }, () => Driver.find());

    const res = await req
      .put(`/api/drivers/${driver._id}`, admin, ny)
      .send({ licenseClass: "Z" });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/licence class/i);
  });
});
