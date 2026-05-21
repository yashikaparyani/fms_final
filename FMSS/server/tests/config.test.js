const request = require("supertest");
const express = require("express");
const EmailConfig = require("../models/EmailConfig");
const { connect, closeDatabase, clearDatabase } = require("./setup");

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

const configRoutes = require("../routes/configRoutes");

const app = express();
app.use(express.json());
app.use("/api/config", configRoutes);

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe("Email Configuration API", () => {

  beforeEach(async () => {
    await EmailConfig.deleteMany({});
  });

  describe("GET /api/config/email", () => {
    it("should return default config if none exists", async () => {
      const res = await request(app).get("/api/config/email").set("role", "staff");

      expect(res.statusCode).toEqual(200);
      expect(res.body.host).toBe("smtp.gmail.com");
      expect(res.body.isEmailEnabled).toBe(false);
      expect(res.body.hasPassword).toBe(false);
    });
  });

  describe("PUT /api/config/email", () => {
    it("should update email config and securely mask password", async () => {
      const updateData = {
        host: "smtp.mailtrap.io",
        port: 2525,
        email: "test@fms.com",
        password: "supersecretpassword",
        isEmailEnabled: true
      };

      const res = await request(app)
        .put("/api/config/email")
        .set("role", "admin")
        .send(updateData);

      expect(res.statusCode).toEqual(200);
      expect(res.body.host).toEqual("smtp.mailtrap.io");
      expect(res.body.port).toEqual(2525);
      expect(res.body.isEmailEnabled).toBe(true);
      expect(res.body.hasPassword).toBe(true);
      expect(res.body.password).toBeUndefined(); // Should not return plaintext password
    });
  });
});
