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
      expect(res.body.code).toEqual("INVALID_PASSWORD");
    });

    // The two are told apart on purpose — see the note in loginUser. Somebody
    // with two email addresses who picks the wrong one is the common case, and
    // "incorrect password" sends them off trying the same password again.
    // Sign-in lowercases what is typed, so an address saved with capitals was
    // an account nobody could reach — though its credentials had been emailed.
    describe("email case", () => {
      const User = require("../models/User");
      const bcrypt = require("bcryptjs");

      it("stores a new address lowercased, and signs in however it is typed", async () => {
        await User.create({ email: "  Ravi@SLine.COM ", password: "password123", role: "fleetOwner" });
        expect(await User.findOne({ email: "ravi@sline.com" })).not.toBeNull();

        for (const typed of ["ravi@sline.com", "Ravi@SLine.COM", " RAVI@SLINE.COM "]) {
          const res = await request(app).post("/api/auth/login").send({ email: typed, password: "password123" });
          expect(res.statusCode).toEqual(200);
        }
      });

      it("finds an older account saved with capitals", async () => {
        await User.collection.insertOne({
          email: "MSRAI1980@GMAIL.COM",
          password: await bcrypt.hash("secret123", 10),
          role: "client",
          isActive: true,
        });

        const ok = await request(app).post("/api/auth/login").send({ email: "msrai1980@gmail.com", password: "secret123" });
        expect(ok.statusCode).toEqual(200);

        const wrong = await request(app).post("/api/auth/login").send({ email: "msrai1980@gmail.com", password: "nope1234" });
        expect(wrong.statusCode).toEqual(401);
        expect(wrong.body.code).toEqual("INVALID_PASSWORD");
      });

      it("picks the one whose password matches when two older accounts differ only by case", async () => {
        await User.collection.insertMany([
          { email: "MSRAI1980@GMAIL.COM", password: await bcrypt.hash("clientpass", 10), role: "client", isActive: true },
          { email: "msrai1980@GMAIL.COM", password: await bcrypt.hash("carrierpass", 10), role: "fleetOwner", isActive: true },
        ]);

        const asCarrier = await request(app).post("/api/auth/login").send({ email: "msrai1980@gmail.com", password: "carrierpass" });
        expect(asCarrier.statusCode).toEqual(200);
        expect(asCarrier.body.user.role).toEqual("fleetOwner");

        const asClient = await request(app).post("/api/auth/login").send({ email: "MsRai1980@gmail.com", password: "clientpass" });
        expect(asClient.statusCode).toEqual(200);
        expect(asClient.body.user.role).toEqual("client");
      });
    });

    it("says so when the address has no account at all", async () => {
      const res = await request(app).post("/api/auth/login").send({
        email: "nobody@test.com",
        password: "password123",
      });

      expect(res.statusCode).toEqual(401);
      expect(res.body.code).toEqual("NO_ACCOUNT");
      expect(res.body.message).toMatch(/no account/i);
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
