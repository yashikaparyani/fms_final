// ─── What to call the signed-in person ────────────────────────────────────────
// Every screen that greets somebody or draws their avatar asks the same
// question, and used to answer it with `user.firstName` alone.
//
// That answer is wrong twice over. A customer added by staff without a contact
// name had the literal string "N/A" written into their user record (see the
// note in controllers/authController.js), so their own dashboard greeted them
// "Welcome back, N/A" and their avatar read "NN". And a customer who genuinely
// has no personal name still has a company name and an email address, either of
// which is a better thing to call them than nothing at all.
//
// So: placeholders are treated as absent, and the fallback walks from the most
// personal name to the least until it finds something real.
//
// The placeholder list is not defensive padding — these are the values that are
// actually in the data, written by older code paths. New records no longer get
// them, but the accounts created before that fix still exist.
// ─────────────────────────────────────────────────────────────────────────────

const PLACEHOLDERS = new Set(["n/a", "na", "null", "undefined", "-", "--", "none"]);

/** The first candidate that is a real name, or "" if none of them are. */
export const realName = (...candidates) => {
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value && !PLACEHOLDERS.has(value.toLowerCase())) return value;
  }
  return "";
};

/**
 * The full name to show for a user, falling back through the company name to
 * the local part of their email — "yashika.paryani@…" reads as "yashika.paryani",
 * which is still recognisably them.
 */
export const displayName = (user, fallback = "there") => {
  if (!user) return fallback;

  const full = [realName(user.firstName), realName(user.lastName)]
    .filter(Boolean)
    .join(" ");

  return (
    full ||
    realName(user.customerName, user.companyName, user.name) ||
    realName(String(user.email || "").split("@")[0]) ||
    fallback
  );
};

/** Just the first name, for a greeting. "" when there is nothing real to use. */
export const firstNameOf = (user) => {
  if (!user) return "";

  return (
    realName(user.firstName) ||
    realName(user.customerName, user.companyName, user.name) ||
    realName(String(user.email || "").split("@")[0])
  );
};

/**
 * One or two letters for an avatar.
 *
 * Taken from `displayName` rather than from firstName/lastName directly, so the
 * initials and the name beside them can never disagree — the "NN" avatar next to
 * a real name was exactly that disagreement.
 */
export const initialsOf = (user, fallback = "?") => {
  const name = displayName(user, "");
  if (!name) return fallback;

  const parts = name.split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0].slice(0, 2);

  return letters.toUpperCase();
};

export default displayName;
