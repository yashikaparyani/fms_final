const { sendEmail } = require("../utils/mailer");
const icAdmin = require("../utils/icAdmin");

// ─── IC agreement admin panel sign-in ─────────────────────────────────────────
// Email + one-time code. Who may sign in, how codes and sessions are kept, and
// the off-production test code all live in utils/icAdmin.js.
// ─────────────────────────────────────────────────────────────────────────────

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Said for every address, listed or not, so the answer does not reveal which
// addresses are admins.
const SENT_MESSAGE = (email) =>
  `If ${email} is an IC admin address, a 6-digit code is on its way. It expires in ${icAdmin.OTP_EXPIRY_MINUTES} minutes.`;

const otpMail = (code) => ({
  subject: `Your IC Agreement Admin Login OTP: ${code}`,
  text:
    `Your login code for the Empire Transportation IC Agreement Admin Panel is: ${code}. ` +
    `It expires in ${icAdmin.OTP_EXPIRY_MINUTES} minutes.`,
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
      <h2 style="color: #0f172a; margin-top: 0; font-size: 20px; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">
        Empire Transportation &mdash; IC Agreement
      </h2>
      <p style="color: #475569; font-size: 14px; line-height: 1.5; margin: 16px 0 20px;">
        You requested a code to sign in to the <strong>IC Agreement Admin Panel</strong>. Use the 6-digit code below:
      </p>
      <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 18px; text-align: center; margin: 20px 0;">
        <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #1d4ed8; font-family: monospace;">
          ${escapeHtml(code)}
        </div>
        <div style="font-size: 12px; color: #64748b; margin-top: 6px;">
          Valid for ${icAdmin.OTP_EXPIRY_MINUTES} minutes
        </div>
      </div>
      <p style="font-size: 12px; color: #94a3b8; line-height: 1.4; margin: 24px 0 0; border-top: 1px solid #f1f5f9; padding-top: 12px;">
        If you did not request this code, you can ignore this email.
      </p>
    </div>
  `,
});

/**
 * POST /api/auth/ic-admin/send-otp
 * Body: { email }
 */
const sendAdminOtp = async (req, res) => {
  try {
    const email = icAdmin.normalizeEmail(req.body.email);
    if (!email) {
      return res.status(400).json({ success: false, message: "Please provide an email address." });
    }

    if (!icAdmin.isAllowedEmail(email)) {
      return res.json({ success: true, message: SENT_MESSAGE(email) });
    }

    const wait = await icAdmin.cooldownRemaining(email);
    if (wait > 0) {
      return res.status(429).json({
        success: false,
        message: `Please wait ${wait}s before requesting a new code.`,
      });
    }

    const code = await icAdmin.issueOtp(email);
    const mail = await sendEmail({ to: email, ...otpMail(code) });

    console.log(`[IC Admin OTP] Code issued for ${email} | Mail status: ${mail?.reason || "SENT"}`);

    if (!mail?.sent) {
      // Off production the code is handed back so the panel can be tried
      // without SMTP. On production it never leaves the server this way.
      if (!icAdmin.isProduction()) {
        return res.json({
          success: true,
          message: `Mail is not configured here. Use code ${code} (or ${icAdmin.TEST_OTP}).`,
          devOtp: code,
        });
      }
      return res.status(503).json({
        success: false,
        message: "The code could not be emailed. Please try again in a few minutes.",
      });
    }

    return res.json({ success: true, message: SENT_MESSAGE(email) });
  } catch (error) {
    console.error("[IC Admin OTP] sendAdminOtp failed:", error);
    return res.status(500).json({ success: false, message: "Could not send the code." });
  }
};

/**
 * POST /api/auth/ic-admin/verify-otp
 * Body: { email, code }
 */
const verifyAdminOtp = async (req, res) => {
  try {
    const email = icAdmin.normalizeEmail(req.body.email);
    const code = String(req.body.code || "").trim();

    if (!email || !code) {
      return res.status(400).json({ success: false, message: "Email and code are required." });
    }

    const result = await icAdmin.verifyOtp(email, code);
    if (!result.ok) {
      const message =
        result.reason === "EXPIRED"
          ? "That code has expired or was never sent. Request a new one."
          : result.reason === "LOCKED"
            ? "Too many wrong codes. Request a new one."
            : result.remaining
              ? `Wrong code. ${result.remaining} attempt${result.remaining === 1 ? "" : "s"} left.`
              : "Wrong code.";
      return res.status(400).json({ success: false, message });
    }

    const { token, expiresAt } = await icAdmin.createSession(email);
    return res.json({
      success: true,
      message: "Signed in.",
      token,
      expiresAt,
      user: { email, role: "icAdmin" },
    });
  } catch (error) {
    console.error("[IC Admin OTP] verifyAdminOtp failed:", error);
    return res.status(500).json({ success: false, message: "Could not verify the code." });
  }
};

/**
 * POST /api/auth/ic-admin/logout
 * Header: Authorization: Bearer <token>
 */
const logoutAdmin = async (req, res) => {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  await icAdmin.revokeSession(token);
  res.json({ success: true });
};

module.exports = {
  sendAdminOtp,
  verifyAdminOtp,
  logoutAdmin,
};
