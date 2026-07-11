const request = require("supertest");
const express = require("express");
const { connect, closeDatabase, clearDatabase } = require("./setup");
const ShippingLine = require("../models/ShippingLine");

// Mock auth middleware before importing routes. The caller's role is driven by
// the `role` header so each test can act as admin / staff / client.
jest.mock("../middleware/auth", () => {
  const mongoose = require("mongoose");
  return {
    protect: (req, res, next) => {
      req.user = { _id: new mongoose.Types.ObjectId(), role: req.headers.role || "admin" };
      next();
    },
    authorizeRoles: (...roles) => (req, res, next) => {
      if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ message: "Not authorized" });
      }
      next();
    }
  };
});

const shippingLineRoutes = require("../routes/shippingLineRoutes");

const app = express();
app.use(express.json());
app.use("/api/shipping-lines", shippingLineRoutes);

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe("Shipping Line API", () => {

  describe("POST /api/shipping-lines", () => {
    it("should create a shipping line as admin", async () => {
      const res = await request(app)
        .post("/api/shipping-lines")
        .set("role", "admin")
        .send({ name: "Maersk", code: "maeu" });

      expect(res.statusCode).toEqual(201);
      expect(res.body).toHaveProperty("name", "Maersk");
      expect(res.body).toHaveProperty("code", "MAEU"); // uppercased by the schema
      expect(res.body).toHaveProperty("isActive", true);
    });

    it("should trim the name and reject a blank one", async () => {
      const res = await request(app)
        .post("/api/shipping-lines")
        .set("role", "admin")
        .send({ name: "   " });

      expect(res.statusCode).toEqual(400);
    });

    it("should reject a duplicate name case-insensitively", async () => {
      await ShippingLine.create({ name: "Maersk" });

      const res = await request(app)
        .post("/api/shipping-lines")
        .set("role", "admin")
        .send({ name: "maersk" });

      expect(res.statusCode).toEqual(409);
    });

    it("should forbid staff from creating a shipping line", async () => {
      const res = await request(app)
        .post("/api/shipping-lines")
        .set("role", "staff")
        .send({ name: "MSC" });

      expect(res.statusCode).toEqual(403);
    });
  });

  describe("GET /api/shipping-lines", () => {
    beforeEach(async () => {
      await ShippingLine.create([
        { name: "MSC", isActive: true },
        { name: "Evergreen", isActive: false },
        { name: "Maersk", isActive: true },
      ]);
    });

    it("should return every line sorted alphabetically, ignoring case", async () => {
      const res = await request(app).get("/api/shipping-lines").set("role", "admin");

      expect(res.statusCode).toEqual(200);
      expect(res.body.map((l) => l.name)).toEqual(["Evergreen", "Maersk", "MSC"]);
    });

    it("should return only active lines when active=true", async () => {
      const res = await request(app)
        .get("/api/shipping-lines?active=true")
        .set("role", "admin");

      expect(res.statusCode).toEqual(200);
      expect(res.body.map((l) => l.name).sort()).toEqual(["MSC", "Maersk"]);
    });

    it("should let staff and clients read the list for the load form dropdown", async () => {
      for (const role of ["staff", "client"]) {
        const res = await request(app).get("/api/shipping-lines").set("role", role);
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveLength(3);
      }
    });

    it("should forbid a fleet owner from reading the list", async () => {
      const res = await request(app).get("/api/shipping-lines").set("role", "fleetOwner");
      expect(res.statusCode).toEqual(403);
    });
  });

  describe("PUT /api/shipping-lines/:id", () => {
    it("should update name, code and active flag", async () => {
      const line = await ShippingLine.create({ name: "Maersk" });

      const res = await request(app)
        .put(`/api/shipping-lines/${line._id}`)
        .set("role", "admin")
        .send({ name: "Maersk Line", code: "MAEU", isActive: false });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("name", "Maersk Line");
      expect(res.body).toHaveProperty("code", "MAEU");
      expect(res.body).toHaveProperty("isActive", false);
    });

    it("should allow saving a line without changing its own name", async () => {
      const line = await ShippingLine.create({ name: "Maersk" });

      const res = await request(app)
        .put(`/api/shipping-lines/${line._id}`)
        .set("role", "admin")
        .send({ name: "Maersk", code: "MAEU" });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("code", "MAEU");
    });

    it("should reject renaming onto another line's name", async () => {
      await ShippingLine.create({ name: "MSC" });
      const line = await ShippingLine.create({ name: "Maersk" });

      const res = await request(app)
        .put(`/api/shipping-lines/${line._id}`)
        .set("role", "admin")
        .send({ name: "msc" });

      expect(res.statusCode).toEqual(409);
    });

    it("should forbid staff from updating", async () => {
      const line = await ShippingLine.create({ name: "Maersk" });

      const res = await request(app)
        .put(`/api/shipping-lines/${line._id}`)
        .set("role", "staff")
        .send({ name: "Maersk Line" });

      expect(res.statusCode).toEqual(403);
    });
  });

  describe("DELETE /api/shipping-lines/:id", () => {
    it("should delete a shipping line as admin", async () => {
      const line = await ShippingLine.create({ name: "Maersk" });

      const res = await request(app)
        .delete(`/api/shipping-lines/${line._id}`)
        .set("role", "admin");

      expect(res.statusCode).toEqual(200);
      expect(await ShippingLine.countDocuments()).toEqual(0);
    });

    it("should 404 for an unknown id", async () => {
      const res = await request(app)
        .delete("/api/shipping-lines/507f1f77bcf86cd799439011")
        .set("role", "admin");

      expect(res.statusCode).toEqual(404);
    });

    it("should forbid staff from deleting", async () => {
      const line = await ShippingLine.create({ name: "Maersk" });

      const res = await request(app)
        .delete(`/api/shipping-lines/${line._id}`)
        .set("role", "staff");

      expect(res.statusCode).toEqual(403);
    });
  });
});
