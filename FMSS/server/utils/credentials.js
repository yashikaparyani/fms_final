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

module.exports = { generatePassword, skippedManualEmailStatus, SAFE_CHARS };
