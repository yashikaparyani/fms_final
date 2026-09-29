// ─── Generated sign-in credentials ────────────────────────────────────────────
// Shared by every "create an account for somebody else" path — staff, drivers,
// customers, carriers — so the alphabet and length are decided once.
// ─────────────────────────────────────────────────────────────────────────────

// No I/l/1/O/0: these passwords get read off a screen, dictated over a phone and
// typed into a truck-cab keyboard, and an ambiguous character there costs a
// support call.
const SAFE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

const generatePassword = (length = 10) => {
  let password = "";
  for (let i = 0; i < length; i += 1) {
    password += SAFE_CHARS.charAt(Math.floor(Math.random() * SAFE_CHARS.length));
  }
  return password;
};

/**
 * The email-status shape used when credentials are handed over by hand
 * (WhatsApp, read out loud) rather than mailed — so callers can report on the
 * attempt uniformly whether or not an email was involved.
 */
const skippedManualEmailStatus = (channel) => ({
  requested: false,
  attempted: false,
  sent: false,
  skipped: true,
  reason: "MANUAL_CHANNEL",
  message: `Email not requested for ${channel} credential sharing.`,
});

// ─── One password per send ───────────────────────────────────────────────────
// Every "send credentials" press replaces the password. Pressed two or three
// times, the person gets two or three emails with different passwords and only
// the last one works — and nothing tells them which that is. So once a password
// has gone out, a repeat inside this window is refused unless the office
// confirms it means to replace it (`force`).
const CREDENTIAL_RESEND_WINDOW_MINUTES = 15;

/**
 * Reserve the right to issue `userId` a new password.
 *
 * A conditional update rather than read-then-write, so two presses landing in
 * the same instant cannot both pass: exactly one matches the filter.
 *
 * Returns `{ ok: true, previous }` — hand `previous` to releaseCredentialIssue
 * if nothing actually reached the person — or `{ ok: false, sentAt }`.
 */
const claimCredentialIssue = async (userId, { force = false } = {}) => {
  const User = require("../models/User");
  const now = new Date();
  const cutoff = new Date(now.getTime() - CREDENTIAL_RESEND_WINDOW_MINUTES * 60 * 1000);

  const filter = force
    ? { _id: userId }
    : {
        _id: userId,
        $or: [{ credentialsSentAt: null }, { credentialsSentAt: { $lt: cutoff } }],
      };

  const before = await User.findOneAndUpdate(
    filter,
    { $set: { credentialsSentAt: now } },
    { new: false, projection: { credentialsSentAt: 1 } },
  );

  if (before) return { ok: true, previous: before.credentialsSentAt || null };

  const current = await User.findById(userId).select("credentialsSentAt");
  return { ok: false, sentAt: current?.credentialsSentAt || null };
};

/** Undo a claim when the email failed, so a retry is not refused for nothing. */
const releaseCredentialIssue = async (userId, previous) => {
  const User = require("../models/User");
  await User.updateOne(
    { _id: userId },
    previous ? { $set: { credentialsSentAt: previous } } : { $unset: { credentialsSentAt: 1 } },
  );
};

/** The 409 a refused repeat answers with. The screens key off `code`. */
const recentlySentResponse = (res, { email, sentAt }) => {
  const minutes = sentAt
    ? Math.max(1, Math.round((Date.now() - new Date(sentAt).getTime()) / 60000))
    : null;

  return res.status(409).json({
    code: "CREDENTIALS_RECENTLY_SENT",
    email,
    sentAt,
    message:
      `Login details were already sent to ${email}` +
      (minutes ? ` ${minutes} minute${minutes === 1 ? "" : "s"} ago` : "") +
      ". That password still works — ask them to check their inbox and spam folder. " +
      "Sending again creates a new password and the earlier one stops working.",
  });
};

module.exports = {
  generatePassword,
  skippedManualEmailStatus,
  SAFE_CHARS,
  CREDENTIAL_RESEND_WINDOW_MINUTES,
  claimCredentialIssue,
  releaseCredentialIssue,
  recentlySentResponse,
};
