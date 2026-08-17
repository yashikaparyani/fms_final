const request = require("supertest");
const express = require("express");
const { connect, closeDatabase, clearDatabase } = require("./setupReplSet");
const Branch = require("../models/Branch");
const authRoutes = require("../routes/authRoutes");
const User = require("../models/User");

const app = express();
app.use(express.json());
app.use("/api/auth", authRoutes);

// Connect to memory DB before tests
beforeAll(async () => await connect());

// Clear DB after each test
afterEach(async () => await clearDatabase());

// A public signup has no tenant context to inherit, so it names a branch — and
// infers it when only one is active. See resolveSignupBranch.
beforeEach(async () => {
  await Branch.create({ name: "Head Office", code: "HO" });
});

// Close DB after all tests
afterAll(async () => await closeDatabase());

describe("Auth API", () => {
  describe("POST /api/auth/customer/register", () => {
    it("should register a new client user successfully", async () => {
      const res = await request(app).post("/api/auth/customer/register").send({
        firstName: "John",
        lastName: "Doe",
        email: "john@test.com",
        password: "password123",
      });

      expect(res.statusCode).toEqual(201);
      expect(res.body).toHaveProperty("api_token");
      expect(res.body.user).toHaveProperty("email", "john@test.com");
      expect(res.body.user).toHaveProperty("role", "client"); // Default role
    });

    it("should fail if user already exists", async () => {
      await User.create({
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@test.com",
        password: "password123",
        role: "client"
      });

      const res = await request(app).post("/api/auth/customer/register").send({
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@test.com",
        password: "password123",
      });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toEqual("User already exists");
    });
  });

  describe("POST /api/auth/login", () => {
    it("should login successfully with valid credentials", async () => {
      // Create user first
      await request(app).post("/api/auth/customer/register").send({
        firstName: "Mark",
        lastName: "Smith",
        email: "mark@test.com",
        password: "password123",
      });

      const res = await request(app).post("/api/auth/login").send({
        email: "mark@test.com",
        password: "password123",
      });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("api_token");
      expect(res.body.user.email).toEqual("mark@test.com");
    });

    it("should fail login with invalid password", async () => {
      await request(app).post("/api/auth/customer/register").send({
        firstName: "Mark",
        lastName: "Smith",
        email: "mark2@test.com",
        password: "password123",
      });

      const res = await request(app).post("/api/auth/login").send({
        email: "mark2@test.com",
        password: "wrongpassword",
      });

      expect(res.statusCode).toEqual(401);
      expect(res.body.message).toEqual("Invalid credentials");
    });
  });

  describe("GET /api/auth/me", () => {
    it("should get user profile with valid token", async () => {
      // Register and get token
      const regRes = await request(app).post("/api/auth/customer/register").send({
        firstName: "Alice",
        lastName: "Wonderland",
        email: "alice@test.com",
        password: "password123",
      });

      const token = regRes.body.api_token;

      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.email).toEqual("alice@test.com");
    });

    it("should fail without token", async () => {
      const res = await request(app).get("/api/auth/me");
      expect(res.statusCode).toEqual(401);
      expect(res.body.message).toEqual("Not authorized, no token");
    });
  });
});
