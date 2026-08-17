const request = require("supertest");
const express = require("express");
const { connect, closeDatabase, clearDatabase } = require("./setupReplSet");
const Branch = require("../models/Branch");
const { seed } = require("./helpers/tenantTestContext");
const User = require("../models/User");
const Customer = require("../models/Customer");

// Mock auth middleware before importing routes
jest.mock("../middleware/auth", () =>
  require("./helpers/tenantTestContext").authMock({ defaultRole: "staff" }),
);

const customerRoutes = require("../routes/customerRoutes");

const app = express();
app.use(express.json());
app.use("/api/customers", customerRoutes);
// Customer creation moved to the auth router when it grew a transaction and a
// location; POST /api/customers is no longer mounted.
app.use("/api/auth", require("../routes/authRoutes"));

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
beforeEach(async () => {
  await Branch.create({ name: "Head Office", code: "HO" });
});
afterAll(async () => await closeDatabase());

describe("Customer API", () => {

  describe("POST /api/auth/staff/create-customer", () => {
    it("should create a new customer", async () => {
      const res = await request(app)
        .post("/api/auth/staff/create-customer")
        .set("role", "staff")
        .send({
          firstName: "John",
          lastName: "Customer",
          email: "john.customer@test.com",
          phone: "555-0100"
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.user).toHaveProperty("firstName", "John");
      expect(res.body.user).toHaveProperty("role", "client");
      expect(res.body).toHaveProperty("tempPassword");
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
        .post("/api/auth/staff/create-customer")
        .set("role", "staff")
        .send({
          firstName: "Another",
          lastName: "User",
          email: "existing@test.com",
          phone: "555-0101"
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
      // The endpoint filters to clients and does not echo `role` back, so the
      // check is that the staff account is absent rather than that every row
      // carries a field the response no longer has.
      const emails = res.body.map((c) => c.email);
      expect(emails).toEqual(
        expect.arrayContaining(["client1@test.com", "client2@test.com"]),
      );
      expect(emails).not.toContain("staff@test.com");
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
      await seed(() =>
        Customer.create({ user: customer._id, customerName: "Original Name" }),
      );

      const res = await request(app)
        .put(`/api/customers/${customer._id}`)
        .set("role", "staff")
        .send({
          firstName: "Updated",
          lastName: "Customer"
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.user.firstName).toEqual("Updated");
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
      await seed(() =>
        Customer.create({ user: customer._id, customerName: "To Delete" }),
      );

      const res = await request(app)
        .delete(`/api/customers/${customer._id}`)
        .set("role", "staff");

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toEqual("Customer deleted successfully");

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
