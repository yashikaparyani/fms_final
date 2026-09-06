// ─── What to call somebody ────────────────────────────────────────────────────
// One definition of "is this a real name", shared by everything that has to
// print one.
//
// ── Why placeholders exist at all ────────────────────────────────────────────
// A customer added by staff without a contact name used to have the literal
// string "N/A" written into both name fields (see controllers/authController.js,
// where that is now fixed). Anything that built a name by joining the two got
// "N/A N/A" — it was the customer under every load ID on the accounting screen,
// the title on every customer card, and the greeting in the first email we ever
// sent them.
//
// Fixing the write does nothing for the records already carrying it, and those
// records are in production. So the placeholder is treated as absent everywhere
// a name is read, and the fallback walks to something that is actually useful:
// the business name the account is known by, then the local part of the email.
// ─────────────────────────────────────────────────────────────────────────────

const PLACEHOLDERS = new Set(["n/a", "na", "null", "undefined", "-", "--", "none"]);

/** The first candidate that is a real name, or "" if none of them are. */
const realName = (...candidates) => {
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value && !PLACEHOLDERS.has(value.toLowerCase())) return value;
  }
  return "";
};

/** Joins first and last, dropping either if it is a placeholder. */
const fullName = (user) =>
  [realName(user?.firstName), realName(user?.lastName)].filter(Boolean).join(" ");

/**
 * What to call a customer on a document, a load or a screen.
 *
 * The business name wins over the contact's personal name: a load is booked by
 * "Mitsubishi Logistics America", not by whoever at Mitsubishi happened to fill
 * the form in, and every table in the app is read that way.
 */
const customerDisplayName = ({ profile, user, fallback = "" } = {}) =>
  realName(profile?.customerName) ||
  fullName(user) ||
  realName(String(user?.email || "").split("@")[0]) ||
  fallback;

module.exports = { realName, fullName, customerDisplayName };
