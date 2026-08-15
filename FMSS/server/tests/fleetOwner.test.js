const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const { connect, closeDatabase, clearDatabase } = require("./setup");
const { seed } = require("./helpers/tenantTestContext");
const FleetOwner = require("../models/FleetOwner");
const User = require("../models/User");

// Mock auth middleware before importing routes. The shared mock also opens the
// tenant context the real `protect` opens — see helpers/tenantTestContext.js.
jest.mock("../middleware/auth", () =>
  require("./helpers/tenantTestContext").authMock({ defaultRole: "staff" }),
);

const fleetOwnerRoutes = require("../routes/fleetOwnerRoutes");

const app = express();
app.use(express.json());
app.use("/api/fleet-owners", fleetOwnerRoutes);

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe("Fleet Owner API", () => {

  describe("POST /api/fleet-owners", () => {
    it("should create a new fleet owner", async () => {
      const res = await request(app)
        .post("/api/fleet-owners")
        .set("role", "staff")
        .send({
          carrierName: "Test Carrier Inc",
          phone: "555-123-4567",
          mcLicense: "MC123456",
          dotLicense: "DOT789012",
          city: "Chicago",
          state: "IL",
          contactPersons: [
            { name: "John Doe", phone: "555-111-2222", email: "john@testcarrier.com", isPrimary: true }
          ]
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.fleetOwner).toHaveProperty("carrierName", "Test Carrier Inc");
      expect(res.body.fleetOwner).toHaveProperty("mcLicense", "MC123456");
    });

    it("should create fleet owner with user account when requested", async () => {
      const res = await request(app)
        .post("/api/fleet-owners")
        .set("role", "staff")
        .send({
          carrierName: "Test Carrier With Account",
          phone: "555-999-8888",
          contactPersons: [
            { name: "Jane Smith", phone: "555-333-4444", email: "jane@carrier.com", isPrimary: true }
          ],
          createUserAccount: true
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.userCreated).toBe(true);
      expect(res.body.credentialsGenerated).toBe(true);

      // Verify user was created
      const user = await seed(() => User.findOne({ email: "jane@carrier.com" }));
      expect(user).not.toBeNull();
      expect(user.role).toEqual("fleetOwner");
    });
  });

  describe("GET /api/fleet-owners", () => {
    it("should return all fleet owners", async () => {
      await seed(() => FleetOwner.create({
        carrierName: "Carrier A",
        phone: "111-111-1111"
      }));
      await seed(() => FleetOwner.create({
        carrierName: "Carrier B",
        phone: "222-222-2222"
      }));

      const res = await request(app)
        .get("/api/fleet-owners")
        .set("role", "staff");

      expect(res.statusCode).toEqual(200);
      expect(res.body.length).toEqual(2);
    });
  });

  describe("GET /api/fleet-owners/:id", () => {
    it("should return a specific fleet owner", async () => {
      const fleetOwner = await seed(() => FleetOwner.create({
        carrierName: "Specific Carrier",
        phone: "333-333-3333",
        mcLicense: "MC999"
      }));

      const res = await request(app)
        .get(`/api/fleet-owners/${fleetOwner._id}`)
        .set("role", "staff");

      expect(res.statusCode).toEqual(200);
      expect(res.body.carrierName).toEqual("Specific Carrier");
    });

    it("should return 404 for non-existent fleet owner", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/fleet-owners/${fakeId}`)
        .set("role", "staff");

      expect(res.statusCode).toEqual(404);
    });
  });

  describe("PUT /api/fleet-owners/:id", () => {
    it("should update a fleet owner", async () => {
      const fleetOwner = await seed(() => FleetOwner.create({
        carrierName: "Original Name",
        phone: "444-444-4444"
      }));

      const res = await request(app)
        .put(`/api/fleet-owners/${fleetOwner._id}`)
        .set("role", "staff")
        .send({
          carrierName: "Updated Name",
          mcLicense: "MC-UPDATED"
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.carrierName).toEqual("Updated Name");
      expect(res.body.mcLicense).toEqual("MC-UPDATED");
    });
  });

  describe("DELETE /api/fleet-owners/:id", () => {
    it("should delete a fleet owner", async () => {
      const fleetOwner = await seed(() => FleetOwner.create({
        carrierName: "To Be Deleted",
        phone: "555-555-5555"
      }));

      const res = await request(app)
        .delete(`/api/fleet-owners/${fleetOwner._id}`)
        .set("role", "staff");

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toEqual("Fleet owner deleted");

      // Verify deletion
      const deleted = await seed(() => FleetOwner.findById(fleetOwner._id));
      expect(deleted).toBeNull();
    });
  });

  describe("POST /api/fleet-owners/:id/send-credentials", () => {
    it("should generate and return credentials", async () => {
      const fleetOwner = await seed(() => FleetOwner.create({
        carrierName: "Credential Test Carrier",
        phone: "666-666-6666",
        contactPersons: [
          { name: "Test Contact", phone: "777-777-7777", email: "credentials@test.com", isPrimary: true }
        ]
      }));

      const res = await request(app)
        .post(`/api/fleet-owners/${fleetOwner._id}/send-credentials`)
        .set("role", "staff");

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("email", "credentials@test.com");
      expect(res.body).toHaveProperty("password");
      expect(res.body.password.length).toBeGreaterThan(0);
    });

    it("should fail if no email is available", async () => {
      const fleetOwner = await seed(() => FleetOwner.create({
        carrierName: "No Email Carrier",
        phone: "888-888-8888"
      }));

      const res = await request(app)
        .post(`/api/fleet-owners/${fleetOwner._id}/send-credentials`)
        .set("role", "staff");

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toContain("No email found");
    });
  });
});
