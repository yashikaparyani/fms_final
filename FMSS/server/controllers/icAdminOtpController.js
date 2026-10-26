const crypto = require("crypto");
const User = require("../models/User");
const { sendEmail } = require("../utils/mailer");

// In-memory OTP store: Map<email, { codeHash, expiresAt, attempts, sentAt, plainForDev }>
const otpStore = new Map();
const OTP_EXPIRY_MINUTES = 10;
const OTP_RESEND_COOLDOWN_SECONDS = 30;
const MAX_ATTEMPTS = 5;

// The code goes back in the response, and to the log, only off production. On
// the live server a failed mail must not hand the OTP to whoever asked for it.
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const hashCode = (code) =>
  crypto.createHash("sha256").update(String(code).trim()).digest("hex");

/**
 * Escape HTML for email
 */
const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * POST /api/auth/ic-admin/send-otp
 * Body: { email }
 */
const sendAdminOtp = async (req, res) => {
  try {
    const rawEmail = String(req.body.email || "").trim().toLowerCase();
    if (!rawEmail) {
      return res.status(400).json({ success: false, message: "Please provide an email address." });
    }

    // Check if the user is an Admin in the system or matches configured ADMIN_EMAIL
    const configuredAdmin = (process.env.ADMIN_EMAIL || "admin@fms.com").toLowerCase().trim();
    const adminUser = await User.findOne({
      email: { $regex: new RegExp(`^${rawEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      role: "admin",
      isDeleted: { $ne: true },
      isActive: { $ne: false },
    });

    if (!adminUser && rawEmail !== configuredAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only registered Admin accounts can log in to the Admin Panel.",
      });
    }

    // Cooldown check
    const existing = otpStore.get(rawEmail);
    if (existing && Date.now() - existing.sentAt < OTP_RESEND_COOLDOWN_SECONDS * 1000) {
      const waitSeconds = Math.ceil(
        (OTP_RESEND_COOLDOWN_SECONDS * 1000 - (Date.now() - existing.sentAt)) / 1000
      );
      return res.status(429).json({
        success: false,
        message: `Please wait ${waitSeconds}s before requesting a new OTP.`,
      });
    }

    // Generate 6-digit random code
    const code = String(crypto.randomInt(100000, 1000000));
    const expiresAt = Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000;

    otpStore.set(rawEmail, {
      codeHash: hashCode(code),
      expiresAt,
      attempts: 0,
      sentAt: Date.now(),
      plainForDev: code,
    });

    // Send email using mailer
    const adminName = adminUser ? `${adminUser.firstName} ${adminUser.lastName}`.trim() : "Admin";
    const mailResult = await sendEmail({
      to: rawEmail,
      subject: `Your IC Agreement Admin Login OTP: ${code}`,
      text: `Hello ${adminName}, your login code for Empire Transportation IC Agreement Admin Panel is: ${code}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
          <h2 style="color: #0f172a; margin-top: 0; font-size: 20px; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">
            Empire Transportation &mdash; IC Agreement
          </h2>
          <p style="color: #334155; font-size: 15px; margin: 16px 0 8px;">
            Hello <strong>${escapeHtml(adminName)}</strong>,
          </p>
          <p style="color: #475569; font-size: 14px; line-height: 1.5; margin: 0 0 20px;">
            You requested an authentication code to log in to the <strong>IC Agreement Admin Panel</strong>. Use the 6-digit verification code below:
          </p>
          <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 18px; text-align: center; margin: 20px 0;">
            <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #1d4ed8; font-family: monospace;">
              ${escapeHtml(code)}
            </div>
            <div style="font-size: 12px; color: #64748b; margin-top: 6px;">
              Valid for ${OTP_EXPIRY_MINUTES} minutes
            </div>
          </div>
          <p style="font-size: 12px; color: #94a3b8; line-height: 1.4; margin: 24px 0 0; border-top: 1px solid #f1f5f9; padding-top: 12px;">
            If you did not request this login code, you can safely ignore this email. No changes will be made to your account.
          </p>
        </div>
      `,
    });

    console.log(
      `[IC Admin OTP] Generated OTP for ${rawEmail}${IS_PRODUCTION ? "" : `: ${code}`} | Mail status: ${mailResult?.reason || "SENT"}`
    );

    // If mail was sent or skipped in dev mode
    const responsePayload = {
      success: true,
      message: mailResult?.sent
        ? `A 6-digit OTP has been sent to ${rawEmail}.`
        : IS_PRODUCTION
          ? "The OTP email could not be sent. Please try again later."
          : `OTP generated for ${rawEmail}. (Dev mode active: ${code})`,
      expiresInMinutes: OTP_EXPIRY_MINUTES,
    };

    // If mail sending was skipped/failed due to no SMTP config on localhost, provide devOtp for testing convenience
    if (!mailResult?.sent && !IS_PRODUCTION) {
      responsePayload.devOtp = code;
      responsePayload.note = "Live SMTP is not configured in local database; code provided for local testing.";
    }

    return res.json(responsePayload);
  } catch (error) {
    console.error("[IC Admin OTP] Error in sendAdminOtp:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/auth/ic-admin/verify-otp
 * Body: { email, code }
 */
const verifyAdminOtp = async (req, res) => {
  try {
    const rawEmail = String(req.body.email || "").trim().toLowerCase();
    const rawCode = String(req.body.code || "").trim();

    if (!rawEmail || !rawCode) {
      return res.status(400).json({ success: false, message: "Email and OTP code are required." });
    }

    const record = otpStore.get(rawEmail);
    if (!record) {
      return res.status(400).json({
        success: false,
        message: "No OTP found or it has expired. Please request a new one.",
      });
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(rawEmail);
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one.",
      });
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      otpStore.delete(rawEmail);
      return res.status(429).json({
        success: false,
        message: "Too many failed attempts. Please request a new OTP.",
      });
    }

    if (hashCode(rawCode) !== record.codeHash) {
      record.attempts += 1;
      const remaining = MAX_ATTEMPTS - record.attempts;
      return res.status(400).json({
        success: false,
        message: `Invalid OTP code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
      });
    }

    // OTP is valid! Remove from store to prevent replay
    otpStore.delete(rawEmail);

    // Create a simple session token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(); // 12 hours

    return res.json({
      success: true,
      message: "Authentication successful.",
      token,
      expiresAt,
      user: {
        email: rawEmail,
        role: "admin",
      },
    });
  } catch (error) {
    console.error("[IC Admin OTP] Error in verifyAdminOtp:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  sendAdminOtp,
  verifyAdminOtp,
};
