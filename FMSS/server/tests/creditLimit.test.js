// A customer flagged over their credit limit must not have new loads raised
// against them — by anyone. The flag was previously stored but never read, so
// these tests pin the enforcement in place.

const request = require("supertest");
const express = require("express");
const { connect, closeDatabase, clearDatabase } = require("./setupReplSet");
const { withTenant, runUnscoped, runWithTenant } = require("../utils/tenantContext");
const { resetBranchCodeCache } = require("../utils/sequence");
const Branch = require("../models/Branch");
const User = require("../models/User");
const Customer = require("../models/Customer");
const Load = require("../models/Load");

// Holder the hoisted jest.mock factory can reach. Must be named mock* — jest
// forbids the factory from closing over anything else defined in this file.
const mockAuth = { user: null, locationId: null };

// Stand-in for the real auth chain. Note it opens the tenant context exactly as
// middleware/location.js does: without that, every scoped query in the
// controller would throw rather than run.
jest.mock("../middleware/auth", () => {
  const { runWithTenant: run } = require("../utils/tenantContext");
  return {
    protect: (req, res, next) => {
      if (!mockAuth.user) return res.status(401).json({ message: "Not authorized" });
      req.user = mockAuth.user;
      req.locationId = mockAuth.locationId;
      return run({ locationId: mockAuth.locationId }, next);
    },
    authenticate: (req, res, next) => next(),
    authorizeRoles:
      (...roles) =>
      (req, res, next) =>
        req.user && roles.includes(req.user.role)
          ? next()
          : res.status(403).json({ message: "Not authorized" }),
  };
});

const app = express();
app.use(express.json());
app.use("/api/loads", require("../routes/loadRoutes"));

beforeAll(async () => await connect());
afterEach(async () => {
  await clearDatabase();
  resetBranchCodeCache();
  mockAuth.user = null;
  mockAuth.locationId = null;
});
afterAll(async () => await closeDatabase());

let branch;
let staff;

beforeEach(async () => {
  branch = await Branch.create({ name: "New York", code: "NY" });
  staff = await User.create({
    firstName: "S",
    lastName: "S",
    email: "s@s.com",
    password: "123",
    role: "staff",
    locations: [branch._id],
    defaultLocation: branch._id,
  });

  mockAuth.user = staff;
  mockAuth.locationId = String(branch._id);
});

/** A customer User plus its Customer record, filed under the test branch. */
const makeCustomer = async (creditLimitExceeded) => {
  const user = await User.create({
    firstName: "Cred",
    lastName: "Limit",
    email: `c${Date.now()}${Math.round(creditLimitExceeded)}@x.com`,
    password: "123",
    role: "client",
    locations: [branch._id],
  });

  await withTenant({ locationId: String(branch._id) }, () =>
    Customer.create({
      user: user._id,
      customerName: "Acme Freight",
      preferences: { creditLimitExceeded },
    }),
  );

  return user;
};

const validLoad = (customerId) => ({
  customer: customerId.toString(),
  truckType: "Container",
  material: "Boxes",
  amount: 1000,
  singleType: "Pick",
  pickup: { city: "NY", state: "NY", address: "1 A St" },
  drop: { city: "LA", state: "CA", address: "2 B St" },
});

const countLoads = () => runUnscoped(() => Load.countDocuments());

describe("Credit limit enforcement on load creation", () => {
  it("blocks staff creating a load for a customer over their limit", async () => {
    const customer = await makeCustomer(true);

    const res = await request(app).post("/api/loads").send(validLoad(customer._id));

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toMatch(/credit limit/i);
    expect(await countLoads()).toBe(0);
  });

  it("blocks the client raising the load itself", async () => {
    const customer = await makeCustomer(true);
    mockAuth.user = { ...customer.toObject(), _id: customer._id, role: "client" };

    const res = await request(app).post("/api/loads").send(validLoad(customer._id));

    expect(res.statusCode).toBe(403);
    expect(await countLoads()).toBe(0);
  });

  it("names the customer in the refusal so staff know who to chase", async () => {
    const customer = await makeCustomer(true);

    const res = await request(app).post("/api/loads").send(validLoad(customer._id));

    expect(res.body.message).toContain("Acme Freight");
  });

  it("allows creation once the flag is clear", async () => {
    const customer = await makeCustomer(false);

    const res = await request(app).post("/api/loads").send(validLoad(customer._id));

    expect(res.statusCode).toBe(201);
    expect(await countLoads()).toBe(1);
  });

  it("allows creation for a customer with no preferences recorded", async () => {
    const user = await User.create({
      firstName: "No",
      lastName: "Prefs",
      email: "noprefs@x.com",
      password: "123",
      role: "client",
      locations: [branch._id],
    });
    await withTenant({ locationId: String(branch._id) }, () =>
      Customer.create({ user: user._id, customerName: "Bare Co" }),
    );

    const res = await request(app).post("/api/loads").send(validLoad(user._id));

    expect(res.statusCode).toBe(201);
  });

  it("files the new load under the creating staff member's location", async () => {
    const customer = await makeCustomer(false);

    await request(app).post("/api/loads").send(validLoad(customer._id));

    const [load] = await runUnscoped(() => Load.find());
    expect(String(load.locationId)).toBe(String(branch._id));
    // Load numbers carry no branch code — see utils/sequence.js.
    expect(load.loadId).toBe("LD 0001");
  });
});
