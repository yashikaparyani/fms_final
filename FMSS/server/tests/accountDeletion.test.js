// Deleting your own account.
//
// Customers, carriers and drivers can delete themselves; staff and admins
// cannot. Deletion anonymizes — the login stops working and personal details are
// wiped — but the records the account took part in stay put.

const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const { connect, closeDatabase, clearDatabase } = require("./setup");
const { getJwtSecret } = require("../utils/jwtSecret");
const { runUnscoped, withTenant } = require("../utils/tenantContext");
const { resetBranchCodeCache } = require("../utils/sequence");

const User = require("../models/User");
const Branch = require("../models/Branch");
const Customer = require("../models/Customer");
const FleetOwner = require("../models/FleetOwner");
const Driver = require("../models/Driver");
const Load = require("../models/Load");

const authRoutes = require("../routes/authRoutes");

const app = express();
app.use(express.json());
app.use("/api/auth", authRoutes);

const tokenFor = (user) => jwt.sign({ id: user._id }, getJwtSecret());

let ny;

const call = (method, path, user) => {
  const req = request(app)[method](path);
  if (user) req.set("Authorization", `Bearer ${tokenFor(user)}`);
  req.set("x-location-id", String(ny._id));
  return req;
};

const deleteAs = (user, body = { password: "password123", confirm: "DELETE" }) =>
  call("post", "/api/auth/delete-account", user).send(body);

const makeUser = (over) =>
  User.create({
    password: "password123",
    locations: [ny._id],
    defaultLocation: ny._id,
    ...over,
  });

const inNy = (fn) => withTenant({ locationId: String(ny._id) }, fn);

beforeAll(async () => await connect());
beforeEach(async () => {
  await runUnscoped(async () => {
    ny = await Branch.create({ name: "New York", code: "NY" });
  });
});
afterEach(async () => {
  await clearDatabase();
  resetBranchCodeCache();
});
afterAll(async () => await closeDatabase());

describe("Deleting your own account", () => {
  it("anonymizes a customer and shuts their login", async () => {
    const user = await makeUser({ firstName: "Acme", email: "ops@acme.com", role: "client", phone: "555" });
    await inNy(() =>
      Customer.create({
        user: user._id,
        customerName: "Acme Imports",
        emails: { podEmail: "pod@acme.com" },
      }),
    );

    const res = await deleteAs(user);
    expect(res.statusCode).toBe(200);

    const after = await User.findById(user._id).lean();
    expect(after.isDeleted).toBe(true);
    expect(after.isActive).toBe(false);
    expect(after.email).not.toMatch(/acme/);
    expect(after.phone).toBeUndefined();
    expect(after.deletedAt).toBeTruthy();

    const customer = await runUnscoped(() => Customer.findOne({ user: user._id }).lean());
    expect(customer.customerName).toBe("Deleted customer");
    expect(customer.emails?.podEmail).toBeUndefined();
    expect(customer.active).toBe(false);

    // The old token no longer works.
    const me = await call("get", "/api/auth/me", user);
    expect(me.statusCode).toBe(401);
  });

  it("takes a carrier's drivers with it", async () => {
    const owner = await makeUser({ firstName: "Swift", email: "swift@carrier.com", role: "fleetOwner" });
    const driverLogin = await makeUser({
      firstName: "Dan",
      email: "dan@carrier.com",
      role: "driver",
      parentAccount: owner._id,
    });

    let carrier;
    await inNy(async () => {
      carrier = await FleetOwner.create({ userId: owner._id, carrierName: "Swift Haulage", taxId: "12-345" });
      await Driver.create({
        fleetOwner: carrier._id,
        userId: driverLogin._id,
        name: "Dan Driver",
        phone: "555-1",
        licenseNumber: "D123",
      });
    });

    const res = await deleteAs(owner);
    expect(res.statusCode).toBe(200);

    const [fo, driver, login] = await runUnscoped(() =>
      Promise.all([
        FleetOwner.findById(carrier._id).lean(),
        Driver.findOne({ fleetOwner: carrier._id }).lean(),
        User.findById(driverLogin._id).lean(),
      ]),
    );
    expect(fo.status).toBe("INACTIVE");
    expect(fo.taxId).toBeUndefined();
    expect(driver.name).toBe("Deleted driver");
    expect(driver.licenseNumber).toBeUndefined();
    expect(login.isDeleted).toBe(true);
  });

  it("refuses while a load is still on the road", async () => {
    const owner = await makeUser({ email: "busy@carrier.com", role: "fleetOwner" });
    await inNy(async () => {
      const carrier = await FleetOwner.create({ userId: owner._id, carrierName: "Busy" });
      await Load.create({
        loadId: "LD 0001",
        createdBy: "staff",
        creatorId: new mongoose.Types.ObjectId(),
        customer: new mongoose.Types.ObjectId(),
        truckType: "Container",
        material: "Boxes",
        amount: 1000,
        status: "ASSIGNED",
        bidStatus: "CLOSED",
        transportStatus: "IN_TRANSIT",
        assignedFleetOwner: { fleetOwnerId: carrier._id, fleetOwnerName: "Busy" },
      });
    });

    const res = await deleteAs(owner);
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toMatch(/LD 0001/);
    expect((await User.findById(owner._id).lean()).isDeleted).toBe(false);
  });

  it("needs the password and the word DELETE", async () => {
    const user = await makeUser({ email: "c@x.com", role: "client" });

    expect((await deleteAs(user, { password: "password123" })).statusCode).toBe(400);
    expect((await deleteAs(user, { password: "wrong", confirm: "DELETE" })).statusCode).toBe(401);
    expect((await User.findById(user._id).lean()).isDeleted).toBe(false);
  });

  it("is not open to staff or admins", async () => {
    const staff = await makeUser({ email: "office@fms.com", role: "staff" });
    const admin = await makeUser({ email: "boss@fms.com", role: "admin" });

    expect((await deleteAs(staff)).statusCode).toBe(403);
    expect((await deleteAs(admin)).statusCode).toBe(403);
  });
});
