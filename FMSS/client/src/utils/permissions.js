// ─── Client-side permission checks ────────────────────────────────────────────
// These hide nav entries and buttons. They are a courtesy to the user — not a
// security boundary. Every route re-checks on the server
// (server/middleware/permissions.js), so a user who edits their localStorage
// gets a 403, not access.
//
// The keys match server/config/permissions.js exactly. Kept as a flat list of
// strings for the same reason: adding a module is one line on each side.
// ─────────────────────────────────────────────────────────────────────────────

/** The signed-in user, from Redux if it is there and localStorage if it is not. */
export const currentUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user")) || null;
  } catch {
    return null;
  }
};

/**
 * Whether `user` may do `key` ("loads.edit").
 *
 * Admins pass everything by role. The portal roles — client, fleetOwner,
 * driver — are bounded by their own screens rather than by this list, so they
 * pass too: a carrier's own pages must not disappear because nobody ticked a
 * box for them.
 */
export const can = (user, key) => {
  if (!user || !key) return false;
  if (user.role === "admin") return true;
  if (["client", "fleetOwner", "driver"].includes(user.role)) return true;
  return (user.permissions || []).includes(key);
};

/** True when the user may do at least one of `keys`. */
export const canAny = (user, keys = []) =>
  keys.length === 0 || keys.some((key) => can(user, key));

/** True when the user may do all of `keys`. */
export const canAll = (user, keys = []) => keys.every((key) => can(user, key));

/** "loads.edit" → "Loads" — for messages that name the module that was refused. */
export const moduleOf = (key) => String(key || "").split(".")[0];
