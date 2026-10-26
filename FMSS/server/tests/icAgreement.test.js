// The standalone IC agreement form and its admin panel.
//
// Anyone filling the form can save it; only the addresses in IC_ADMIN_EMAILS,
// signed in by emailed code, can read the submissions back. The submissions hold
// EINs, license numbers and signatures, so the cases that matter most are the
// ones where somebody who should not get in tries to.

const request = require("supertest");
const express = require("express");
const { connect, closeDatabase, clearDatabase } = require("./setup");

jest.mock("../utils/mailer", () => ({
  sendEmail: jest.fn().mockResolvedValue({ sent: true }),
}));
const { sendEmail } = require("../utils/mailer");

const IcAgreement = require("../models/IcAgreement");
const icAgreementRoutes = require("../routes/icAgreementRoutes");
const authRoutes = require("../routes/authRoutes");

const ADMIN = "onboard@empiretpt.com";
const SIG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

// Each test comes from its own address, so the per-IP rate limits on these
// public routes count one test's requests and not the whole file's.
let clientIp = 0;
const app = express();
app.set("trust proxy", true);
app.use((req, _res, next) => {
  req.headers["x-forwarded-for"] = `10.0.0.${clientIp}`;
  next();
});
app.use("/api/ic-agreements", express.json({ limit: "3mb" }));
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/ic-agreements", icAgreementRoutes);

const submission = (overrides = {}) => ({
  name: "Acme Hauling LLC",
  signerName: "John Doe",
  ein: "12-3456789",
  dl: "DL1234567",
  city: "Long Beach",
  state: "CA",
  effDate: "2026-10-26",
  effTime: "09:00",
  sameExec: true,
  equipment: [["2020 Freightliner Cascadia", "1FUJGLDR0LL123456"]],
  rates: [["0-10", "$100", "$80", "$60"]],
  sigModes: { contractor: "draw", carrier: "type" },
  sigs: { contractor: SIG },
  ...overrides,
});

/** The code the mocked mailer was last asked to send. */
const lastMailedCode = () => sendEmail.mock.calls.at(-1)[0].text.match(/\d{6}/)[0];

const signIn = async () => {
  await request(app).post("/api/auth/ic-admin/send-otp").send({ email: ADMIN });
  const res = await request(app)
    .post("/api/auth/ic-admin/verify-otp")
    .send({ email: ADMIN, code: lastMailedCode() });
  return res.body.token;
};

const savedEnv = { ...process.env };

beforeAll(connect);
afterAll(closeDatabase);
beforeEach(() => {
  clientIp += 1;
  process.env.IC_ADMIN_EMAILS = ADMIN;
  process.env.NODE_ENV = "production";
  sendEmail.mockClear();
  sendEmail.mockResolvedValue({ sent: true });
});
afterEach(async () => {
  process.env = { ...savedEnv };
  await clearDatabase();
});

describe("Saving the form", () => {
  it("is open to anyone, and keeps what was filled in", async () => {
    const res = await request(app).post("/api/ic-agreements").send(submission());

    expect(res.statusCode).toBe(201);
    expect(res.body.id).toMatch(/^ICA-/);

    const saved = await IcAgreement.findOne({ agreementId: res.body.id }).lean();
    expect(saved.name).toBe("Acme Hauling LLC");
    expect(saved.ein).toBe("12-3456789");
    expect(saved.equipment).toEqual([["2020 Freightliner Cascadia", "1FUJGLDR0LL123456"]]);
    expect(saved.sigs.contractor).toBe(SIG);
    expect(saved.sigModes.carrier).toBe("type");
  });

  it("needs the contractor's name", async () => {
    const res = await request(app).post("/api/ic-agreements").send(submission({ name: "  " }));
    expect(res.statusCode).toBe(400);
  });

  it("drops a signature that is not a PNG image", async () => {
    // It is rendered as an <img src>, so a javascript: or HTML payload must not
    // get through as one.
    const res = await request(app)
      .post("/api/ic-agreements")
      .send(submission({ sigs: { contractor: "javascript:alert(1)", carrier: "data:text/html,<script>" } }));

    const saved = await IcAgreement.findOne({ agreementId: res.body.id }).lean();
    expect(saved.sigs?.contractor).toBeUndefined();
    expect(saved.sigs?.carrier).toBeUndefined();
  });

  it("ignores fields the form does not have", async () => {
    const res = await request(app)
      .post("/api/ic-agreements")
      .send(submission({ agreementId: "ICA-HIJACK", submittedIp: "1.2.3.4" }));

    expect(res.body.id).not.toBe("ICA-HIJACK");
    const saved = await IcAgreement.findOne({ agreementId: res.body.id }).lean();
    expect(saved.submittedIp).not.toBe("1.2.3.4");
  });
});

describe("Reading submissions back", () => {
  it("is refused without a session", async () => {
    await request(app).post("/api/ic-agreements").send(submission());

    expect((await request(app).get("/api/ic-agreements")).statusCode).toBe(401);
    expect(
      (await request(app).get("/api/ic-agreements").set("Authorization", "Bearer made-up")).statusCode,
    ).toBe(401);
  });

  it("lists them for a signed-in admin, without the signature images", async () => {
    await request(app).post("/api/ic-agreements").send(submission());
    const token = await signIn();

    const res = await request(app).get("/api/ic-agreements").set("Authorization", `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.agreements).toHaveLength(1);
    expect(res.body.agreements[0].sigs).toBeUndefined();
    expect(res.body.agreements[0].hasSig).toEqual({ contractor: true, carrier: false });
  });

  it("returns one agreement in full, signature included", async () => {
    const { body } = await request(app).post("/api/ic-agreements").send(submission());
    const token = await signIn();

    const res = await request(app).get(`/api/ic-agreements/${body.id}`).set("Authorization", `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.agreement.sigs.contractor).toBe(SIG);
  });

  it("lets an admin delete one", async () => {
    const { body } = await request(app).post("/api/ic-agreements").send(submission());
    const token = await signIn();

    const res = await request(app).delete(`/api/ic-agreements/${body.id}`).set("Authorization", `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(await IcAgreement.countDocuments()).toBe(0);
  });

  it("stops working once the address is taken off the list", async () => {
    const token = await signIn();
    process.env.IC_ADMIN_EMAILS = "someone-else@empiretpt.com";

    const res = await request(app).get("/api/ic-agreements").set("Authorization", `Bearer ${token}`);
    expect(res.statusCode).toBe(401);
  });

  it("stops working after logout", async () => {
    const token = await signIn();
    await request(app).post("/api/auth/ic-admin/logout").set("Authorization", `Bearer ${token}`);

    const res = await request(app).get("/api/ic-agreements").set("Authorization", `Bearer ${token}`);
    expect(res.statusCode).toBe(401);
  });
});

describe("Signing in by emailed code", () => {
  it("mails a code to a listed address", async () => {
    const res = await request(app).post("/api/auth/ic-admin/send-otp").send({ email: ADMIN });

    expect(res.statusCode).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe(ADMIN);
    expect(res.body.devOtp).toBeUndefined();
  });

  it("mails nothing to an unlisted address, and does not say so", async () => {
    const listed = await request(app).post("/api/auth/ic-admin/send-otp").send({ email: ADMIN });
    const unlisted = await request(app).post("/api/auth/ic-admin/send-otp").send({ email: "admin@fms.com" });

    expect(unlisted.statusCode).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(unlisted.body.message.replace("admin@fms.com", "X")).toBe(listed.body.message.replace(ADMIN, "X"));
  });

  it("on production, never hands the code back when the mail fails", async () => {
    sendEmail.mockResolvedValue({ sent: false, reason: "SEND_FAILED" });

    const res = await request(app).post("/api/auth/ic-admin/send-otp").send({ email: ADMIN });

    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toMatch(/\d{6}/);
  });

  it("does not accept the test code on production", async () => {
    await request(app).post("/api/auth/ic-admin/send-otp").send({ email: ADMIN });

    const res = await request(app).post("/api/auth/ic-admin/verify-otp").send({ email: ADMIN, code: "123456" });

    // Unless the mailed code happens to be 123456, which the next line rules out.
    if (lastMailedCode() !== "123456") expect(res.statusCode).toBe(400);
  });

  it("accepts the test code off production", async () => {
    process.env.NODE_ENV = "development";

    const res = await request(app).post("/api/auth/ic-admin/verify-otp").send({ email: ADMIN, code: "123456" });

    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it("does not accept the test code for an unlisted address, even off production", async () => {
    process.env.NODE_ENV = "development";

    const res = await request(app)
      .post("/api/auth/ic-admin/verify-otp")
      .send({ email: "admin@fms.com", code: "123456" });

    expect(res.statusCode).toBe(400);
  });

  it("works once, and voids the code after five wrong guesses", async () => {
    await request(app).post("/api/auth/ic-admin/send-otp").send({ email: ADMIN });
    const code = lastMailedCode();
    const wrong = code === "000000" ? "111111" : "000000";

    for (let i = 0; i < 5; i += 1) {
      await request(app).post("/api/auth/ic-admin/verify-otp").send({ email: ADMIN, code: wrong });
    }
    const late = await request(app).post("/api/auth/ic-admin/verify-otp").send({ email: ADMIN, code });
    expect(late.statusCode).toBe(400);
  });

  it("cannot be replayed", async () => {
    await request(app).post("/api/auth/ic-admin/send-otp").send({ email: ADMIN });
    const code = lastMailedCode();

    const first = await request(app).post("/api/auth/ic-admin/verify-otp").send({ email: ADMIN, code });
    const second = await request(app).post("/api/auth/ic-admin/verify-otp").send({ email: ADMIN, code });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(400);
  });
});
