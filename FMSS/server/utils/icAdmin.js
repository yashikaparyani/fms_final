const crypto = require("crypto");
const IcAdminOtp = require("../models/IcAdminOtp");
const IcAdminSession = require("../models/IcAdminSession");

// ─── IC agreement admin panel: who may sign in, and how ──────────────────────
// The panel lists every contractor's EIN, driver license and signatures, so it
// is not opened to FMSS admins at large. Only the addresses in IC_ADMIN_EMAILS
// (comma separated, in server/.env) can request a code. An unlisted address is
// never mailed, and is told the same thing a listed one is, so the endpoint
// does not confirm which addresses are admins.
//
// Off production, TEST_OTP is accepted for any listed address so the panel can
// be exercised without a mailbox. On production the only ways in are a code
// from the mailbox, or one issued from the shell by scripts/icAdminOtp.js.
// ─────────────────────────────────────────────────────────────────────────────

const OTP_EXPIRY_MINUTES = 10;
const OTP_RESEND_COOLDOWN_SECONDS = 30;
const MAX_ATTEMPTS = 5;
const SESSION_HOURS = 12;
const TEST_OTP = "123456";

const isProduction = () => process.env.NODE_ENV === "production";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const allowedEmails = () =>
  String(process.env.IC_ADMIN_EMAILS || "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);

const isAllowedEmail = (email) => allowedEmails().includes(normalizeEmail(email));

const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

const sameHash = (a, b) =>
  a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Seconds left before `email` may be sent another code, or 0. */
const cooldownRemaining = async (email) => {
  const existing = await IcAdminOtp.findOne({ email: normalizeEmail(email) }).lean();
  if (!existing) return 0;
  const elapsed = Date.now() - new Date(existing.sentAt).getTime();
  const left = OTP_RESEND_COOLDOWN_SECONDS * 1000 - elapsed;
  return left > 0 ? Math.ceil(left / 1000) : 0;
};

/** Replace any pending code for `email` with a fresh one and return it. */
const issueOtp = async (email) => {
  const code = String(crypto.randomInt(100000, 1000000));
  await IcAdminOtp.findOneAndUpdate(
    { email: normalizeEmail(email) },
    {
      codeHash: sha256(code),
      attempts: 0,
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000),
    },
    { upsert: true, setDefaultsOnInsert: true },
  );
  return code;
};

/**
 * Check a code. Resolves to { ok: true } or { ok: false, reason, remaining }.
 * A matched code is consumed; too many misses void it.
 */
const verifyOtp = async (email, code) => {
  const address = normalizeEmail(email);
  const entered = String(code || "").trim();

  if (!isAllowedEmail(address)) return { ok: false, reason: "INVALID" };
  if (!isProduction() && entered === TEST_OTP) return { ok: true };

  const record = await IcAdminOtp.findOne({ email: address });
  if (!record || record.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "EXPIRED" };
  }

  if (sameHash(sha256(entered), record.codeHash)) {
    await IcAdminOtp.deleteOne({ _id: record._id });
    return { ok: true };
  }

  record.attempts += 1;
  if (record.attempts >= MAX_ATTEMPTS) {
    await IcAdminOtp.deleteOne({ _id: record._id });
    return { ok: false, reason: "LOCKED" };
  }
  await record.save();
  return { ok: false, reason: "INVALID", remaining: MAX_ATTEMPTS - record.attempts };
};

const createSession = async (email) => {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await IcAdminSession.create({ tokenHash: sha256(token), email: normalizeEmail(email), expiresAt });
  return { token, expiresAt };
};

/**
 * The session a token belongs to, or null. An address taken off
 * IC_ADMIN_EMAILS loses access at once, not when its session runs out.
 */
const resolveSession = async (token) => {
  if (!token) return null;
  const session = await IcAdminSession.findOne({ tokenHash: sha256(token) }).lean();
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) return null;
  if (!isAllowedEmail(session.email)) return null;
  return session;
};

const revokeSession = (token) =>
  token ? IcAdminSession.deleteOne({ tokenHash: sha256(token) }) : Promise.resolve();

module.exports = {
  OTP_EXPIRY_MINUTES,
  TEST_OTP,
  isProduction,
  normalizeEmail,
  allowedEmails,
  isAllowedEmail,
  cooldownRemaining,
  issueOtp,
  verifyOtp,
  createSession,
  resolveSession,
  revokeSession,
};
