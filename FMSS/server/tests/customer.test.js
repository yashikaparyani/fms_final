const request = require("supertest");
const express = require("express");
const { connect, closeDatabase, clearDatabase } = require("./setup");
const User = require("../models/User");

// Mock auth middleware before importing routes
jest.mock("../middleware/auth", () => {
  const mongoose = require("mongoose");
  return {
    protect: (req, res, next) => {
      req.user = { _id: new mongoose.Types.ObjectId(), role: req.headers.role || "staff" };
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

const customerRoutes = require("../routes/customerRoutes");

const app = express();
app.use(express.json());
app.use("/api/customers", customerRoutes);

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe("Customer API", () => {

  describe("POST /api/customers", () => {
    it("should create a new customer", async () => {
      const res = await request(app)
        .post("/api/customers")
        .set("role", "staff")
        .send({
          firstName: "John",
          lastName: "Customer",
          email: "john.customer@test.com"
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.customer).toHaveProperty("firstName", "John");
      expect(res.body.customer).toHaveProperty("role", "client");
      expect(res.body).toHaveProperty("password");
      expect(res.body.credentialsGenerated).toBe(true);
    });

    it("should fail if email already exists", async () => {
      await User.create({
        firstName: "Existing",
        lastName: "User",
        email: "existing@test.com",
        password: "password123",
        role: "client"
      });

      const res = await request(app)
        .post("/api/customers")
        .set("role", "staff")
        .send({
          firstName: "Another",
          lastName: "User",
          email: "existing@test.com"
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toContain("already exists");
    });
  });

  describe("GET /api/customers", () => {
    it("should return only client users", async () => {
      await User.create({
        firstName: "Client",
        lastName: "One",
        email: "client1@test.com",
        password: "password123",
        role: "client"
      });
      await User.create({
        firstName: "Client",
        lastName: "Two",
        email: "client2@test.com",
        password: "password123",
        role: "client"
      });
      await User.create({
        firstName: "Staff",
        lastName: "User",
        email: "staff@test.com",
        password: "password123",
        role: "staff"
      });

      const res = await request(app)
        .get("/api/customers")
        .set("role", "staff");

      expect(res.statusCode).toEqual(200);
      expect(res.body.length).toEqual(2);
      expect(res.body.every(c => c.role === "client")).toBe(true);
    });
  });

  describe("GET /api/customers/:id", () => {
    it("should return a specific customer", async () => {
      const customer = await User.create({
        firstName: "Specific",
        lastName: "Customer",
        email: "specific@test.com",
        password: "password123",
        role: "client"
      });

      const res = await request(app)
        .get(`/api/customers/${customer._id}`)
        .set("role", "staff");

      expect(res.statusCode).toEqual(200);
      expect(res.body.firstName).toEqual("Specific");
    });

    it("should return 404 for non-client user", async () => {
      const staffUser = await User.create({
        firstName: "Staff",
        lastName: "NotCustomer",
        email: "staffnotcustomer@test.com",
        password: "password123",
        role: "staff"
      });

      const res = await request(app)
        .get(`/api/customers/${staffUser._id}`)
        .set("role", "staff");

      expect(res.statusCode).toEqual(404);
    });
  });

  describe("PUT /api/customers/:id", () => {
    it("should update a customer", async () => {
      const customer = await User.create({
        firstName: "Original",
        lastName: "Name",
        email: "original@test.com",
        password: "password123",
        role: "client"
      });

      const res = await request(app)
        .put(`/api/customers/${customer._id}`)
        .set("role", "staff")
        .send({
          firstName: "Updated",
          lastName: "Customer"
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.firstName).toEqual("Updated");
    });
  });

  describe("DELETE /api/customers/:id", () => {
    it("should delete a customer", async () => {
      const customer = await User.create({
        firstName: "ToDelete",
        lastName: "Customer",
        email: "todelete@test.com",
        password: "password123",
        role: "client"
      });

      const res = await request(app)
        .delete(`/api/customers/${customer._id}`)
        .set("role", "staff");

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toEqual("Customer deleted");

      // Verify deletion
      const deleted = await User.findById(customer._id);
      expect(deleted).toBeNull();
    });
  });

  describe("POST /api/customers/:id/send-credentials", () => {
    it("should generate and return new credentials", async () => {
      const customer = await User.create({
        firstName: "Credential",
        lastName: "Test",
        email: "credtest@test.com",
        password: "oldpassword",
        role: "client"
      });

      const res = await request(app)
        .post(`/api/customers/${customer._id}/send-credentials`)
        .set("role", "staff");

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("email", "credtest@test.com");
      expect(res.body).toHaveProperty("password");
      expect(res.body.password.length).toBeGreaterThan(0);
    });
  });
});
