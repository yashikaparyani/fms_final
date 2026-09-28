// "Forgot password": a 6-digit code by email, then a new password with it.

const request = require("supertest");
const express = require("express");
const bcrypt = require("bcryptjs");

jest.mock("../services/emailService", () => ({
  ...jest.requireActual("../services/emailService"),
  sendPasswordResetCode: jest.fn(async () => ({ sent: true })),
}));

const { connect, closeDatabase, clearDatabase } = require("./setup");
const { sendPasswordResetCode } = require("../services/emailService");
const User = require("../models/User");
const authRoutes = require("../routes/authRoutes");

const app = express();
app.use(express.json());
app.use("/api/auth", authRoutes);

const post = (path, body) => request(app).post(`/api/auth${path}`).send(body);

/** The code the last "email" carried. */
const lastCode = () => sendPasswordResetCode.mock.calls.at(-1)[0].code;

beforeAll(async () => await connect());
beforeEach(async () => {
  sendPasswordResetCode.mockClear();
  await User.create({ email: "driver@carrier.com", password: "oldpass1", role: "driver" });
});
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe("Forgot password", () => {
  it("emails a code and lets the new password in", async () => {
    const asked = await post("/forgot-password", { email: " Driver@Carrier.com " });
    expect(asked.statusCode).toBe(200);
    expect(lastCode()).toMatch(/^\d{6}$/);

    const reset = await post("/reset-password", {
      email: "driver@carrier.com",
      code: lastCode(),
      newPassword: "newpass9",
    });
    expect(reset.statusCode).toBe(200);

    const user = await User.findOne({ email: "driver@carrier.com" }).select("+password");
    expect(await bcrypt.compare("newpass9", user.password)).toBe(true);

    // The code is single-use.
    const again = await post("/reset-password", {
      email: "driver@carrier.com",
      code: lastCode(),
      newPassword: "another1",
    });
    expect(again.statusCode).toBe(400);
  });

  it("stops after five wrong codes", async () => {
    await post("/forgot-password", { email: "driver@carrier.com" });
    const good = lastCode();
    const wrong = good === "000000" ? "111111" : "000000";

    for (let i = 0; i < 5; i += 1) {
      await post("/reset-password", { email: "driver@carrier.com", code: wrong, newPassword: "newpass9" });
    }

    const res = await post("/reset-password", {
      email: "driver@carrier.com",
      code: good,
      newPassword: "newpass9",
    });
    expect(res.statusCode).toBe(400);
  });

  it("refuses an expired code", async () => {
    await post("/forgot-password", { email: "driver@carrier.com" });
    await User.updateOne(
      { email: "driver@carrier.com" },
      { $set: { "passwordReset.expiresAt": new Date(Date.now() - 1000) } },
    );

    const res = await post("/reset-password", {
      email: "driver@carrier.com",
      code: lastCode(),
      newPassword: "newpass9",
    });
    expect(res.statusCode).toBe(400);
  });

  it("will not resend within a minute", async () => {
    expect((await post("/forgot-password", { email: "driver@carrier.com" })).statusCode).toBe(200);
    expect((await post("/forgot-password", { email: "driver@carrier.com" })).statusCode).toBe(429);
  });

  it("says so when there is no such account", async () => {
    expect((await post("/forgot-password", { email: "nobody@x.com" })).statusCode).toBe(404);
  });

  it("lets a new code be asked for straight away if the email failed", async () => {
    sendPasswordResetCode.mockResolvedValueOnce({ sent: false });
    expect((await post("/forgot-password", { email: "driver@carrier.com" })).statusCode).toBe(502);
    expect((await post("/forgot-password", { email: "driver@carrier.com" })).statusCode).toBe(200);
  });
});
