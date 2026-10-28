/**
 * Two things the phone app needs from every API response, and one thing support
 * needs from every carrier-side request.
 *
 * No caching. Express answers with an ETag and no Cache-Control, which leaves
 * iOS's URL cache free to decide for itself whether a stored answer is still
 * good. For a dashboard that is the wrong call: a carrier assigned a load an
 * hour ago must not be shown the empty list from this morning. `no-store` takes
 * the decision away from the device.
 *
 * A trail per carrier. The nginx log carries an IP and a user agent and nothing
 * else, so "TPS can't see his loads" meant working backwards from mobile-network
 * IPs to guess which requests were his. One line per carrier/driver request,
 * with who asked and what came back, answers "did his phone ask, and what did
 * we say" straight from `pm2 logs`. Staff and admin are left out — their browser
 * polls several endpoints every ten seconds and would drown the lines that
 * matter.
 */

const noStore = (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
};

const CARRIER_ROLES = new Set(["fleetOwner", "driver"]);

// Polled every 30s by every open app; logging it would be most of the output
// and says nothing the requests either side of it do not.
const QUIET_PATHS = new Set(["/api/notifications/unread-count"]);

const carrierRequestLog = (req, res, next) => {
  const started = Date.now();

  // On finish rather than now: `req.user` is set by `protect`, which runs
  // further down the chain than this.
  res.on("finish", () => {
    const user = req.user;
    if (!user || !CARRIER_ROLES.has(user.role)) return;

    const path = req.originalUrl.split("?")[0];
    if (QUIET_PATHS.has(path)) return;

    console.log(
      `[carrier-api] ${user.email || user._id} ${user.role} ` +
        `${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`,
    );
  });

  next();
};

module.exports = { noStore, carrierRequestLog };
