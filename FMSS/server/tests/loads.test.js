const request = require("supertest");
const express = require("express");
const { connect, closeDatabase, clearDatabase } = require("./setup");
const loadRoutes = require("../routes/loadRoutes");
const bidRoutes = require("../routes/bidRoutes");
const User = require("../models/User");
const Load = require("../models/Load");
const FleetOwner = require("../models/FleetOwner");

const app = express();
app.use(express.json());

// Dummy user injection middleware for testing protect & authorize
app.use((req, res, next) => {
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer TestUser")) {
     const role = req.headers.authorization.split(" ")[2]; // format: Bearer TestUser <role> <id>
     const id = req.headers.authorization.split(" ")[3];
     req.user = { _id: id, id, role };
     return next();
  }
  next();
});

const protect = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Not authorized" });
  }
  next();
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
       return res.status(403).json({ message: "Not authorized" });
    }
    next();
  };
};

// Overwrite auth middleware for testing
jest.mock("../middleware/auth", () => ({ protect, authorizeRoles: authorize }));

// Re-import routes after mock
const loadRoutesMocked = require("../routes/loadRoutes");
const bidRoutesMocked = require("../routes/bidRoutes");

app.use("/api/loads", loadRoutesMocked);
app.use("/api/loads/:loadId/bids", bidRoutesMocked);


beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe("Load & Bidding API", () => {

  let clientId, staffId, fleetOwnerId;

  beforeEach(async () => {
      // Mock some database users
      const client = await User.create({ firstName: "C", lastName: "C", email: "c@c.com", password: "123", role: "client" });
      const staff = await User.create({ firstName: "S", lastName: "S", email: "s@s.com", password: "123", role: "staff" });
      const fleetOwner = await User.create({ firstName: "F", lastName: "F", email: "f@f.com", password: "123", role: "fleetOwner" });

      clientId = client._id.toString();
      staffId = staff._id.toString();
      fleetOwnerId = fleetOwner._id.toString();
  });

  describe("Load Management", () => {
    it("should allow staff to create a verified load", async () => {
      const res = await request(app)
        .post("/api/loads")
        .set("Authorization", `Bearer TestUser staff ${staffId}`)
        .send({
          loadId: "LD1001",
          customer: "Test Customer",
          pickup: { city: "NY", state: "NY" },
          drop: { city: "LA", state: "CA" },
          truckType: "32 ft Container",
          material: "Boxes",
          amount: 1000,
          date: "2026-03-10"
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.status).toEqual("VERIFIED");
    });

    it("should reject creation if unauthenticated", async () => {
      const res = await request(app)
        .post("/api/loads")
        .send({
          loadId: "LD1002",
          customer: "Test Customer",
          pickup: { city: "NY", state: "NY" },
          drop: { city: "LA", state: "CA" },
          truckType: "32 ft Container",
          material: "Boxes",
          amount: 1000,
          date: "2026-03-10"
        });

      expect(res.statusCode).toEqual(401);
    });

    it("should allow getting all loads", async () => {
      await Load.create({
          loadId: "LD1001",
          customer: "Test Customer",
          pickup: { city: "NY", state: "NY" },
          drop: { city: "LA", state: "CA" },
          truckType: "32 ft Container",
          material: "Boxes",
          amount: 1000,
          date: "2026-03-10",
          createdBy: "staff",
          creatorId: staffId
      });

      // Staff can see all loads
      const res = await request(app)
        .get("/api/loads")
        .set("Authorization", `Bearer TestUser staff ${staffId}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].loadId).toEqual("LD1001");
    });
  });

  describe("Bidding Process", () => {
    let loadIdStr;

    beforeEach(async () => {
       const load = await Load.create({
          loadId: "LD9999",
          customer: "Test Customer",
          pickup: { city: "NY", state: "NY" },
          drop: { city: "LA", state: "CA" },
          truckType: "32 ft Container",
          material: "Boxes",
          amount: 1000,
          date: "2026-03-10",
          createdBy: "staff",
          creatorId: staffId,
          bidStatus: "OPEN"
      });
      loadIdStr = load.loadId;

      await FleetOwner.create({
        carrierName: "Test Fleet",
        phone: "111",
        userId: fleetOwnerId
      });
    });

    it("should allow a fleet owner to place a bid", async () => {
      const res = await request(app)
        .post(`/api/loads/${loadIdStr}/bids`)
        .set("Authorization", `Bearer TestUser fleetOwner ${fleetOwnerId}`)
        .send({ amount: 950 });

      expect(res.statusCode).toEqual(201);
      expect(res.body.bids.length).toBe(1);
      expect(res.body.bids[0].amount).toEqual(950);
    });

    it("should reject bid from client", async () => {
      const res = await request(app)
        .post(`/api/loads/${loadIdStr}/bids`)
        .set("Authorization", `Bearer TestUser client ${clientId}`)
        .send({ amount: 950 });

      expect(res.statusCode).toEqual(403);
    });
  });
});
