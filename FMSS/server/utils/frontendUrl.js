// ─── The address links get built from ─────────────────────────────────────────
// Everything the system mails out carries a link back into the app: the
// insurance agency's submission page, carrier and staff credentials, load
// notifications. Those links are opened by somebody who is not on this machine,
// so they must point at the deployed site.
//
// This used to be three separate copies of `process.env.FRONTEND_URL ||
// "http://localhost:5173"`, one per file. Three copies of a default is how a
// default drifts, and the failure is silent in the worst way: the email sends
// successfully, reports success, and arrives with a link to the recipient's own
// computer. Nobody finds out until an insurance agent says the link is broken.
//
// So it lives in one place, and an unset value is announced at startup rather
// than discovered in somebody's inbox.
// ─────────────────────────────────────────────────────────────────────────────

const DEV_FALLBACK = "http://localhost:5173";

let warned = false;

/**
 * Base URL for anything that leaves the building, with no trailing slash —
 * callers append `/vendor-login` and similar, and a trailing slash would
 * produce a double.
 */
const frontendUrl = () => {
  const configured = String(process.env.FRONTEND_URL || "").trim();

  if (!configured) {
    // Once, not per email — a warning printed on every send is a warning nobody
    // reads.
    if (!warned) {
      warned = true;
      console.warn(
        "[frontendUrl] FRONTEND_URL is not set. Links in outgoing email will " +
          `point at ${DEV_FALLBACK}, which is correct for development and dead ` +
          "for anyone else. Set it to the public site address before sending " +
          "credentials or insurance requests from this server.",
      );
    }
    return DEV_FALLBACK;
  }

  return configured.replace(/\/+$/, "");
};

/** True when a real address is configured — for health checks and settings screens. */
const isConfigured = () => Boolean(String(process.env.FRONTEND_URL || "").trim());

module.exports = { frontendUrl, isConfigured, DEV_FALLBACK };
