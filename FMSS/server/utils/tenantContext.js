// ─── Tenant context ───────────────────────────────────────────────────────────
// Which location the current request is operating on, carried implicitly so the
// ~295 existing database calls do not each have to pass it.
//
// AsyncLocalStorage keeps a store per async execution chain: a value set at the
// start of a request is visible to every await inside that request and to
// nothing outside it. That is what lets the Mongoose plugin in
// plugins/tenantScope.js read the active location without a `req` in hand.
//
// The rule this exists to enforce: code that touches tenant data either runs
// inside a request context, or explicitly declares itself unscoped. There is no
// third option — see the plugin, which throws rather than guessing.
// ─────────────────────────────────────────────────────────────────────────────

const { AsyncLocalStorage } = require("node:async_hooks");

const storage = new AsyncLocalStorage();

/**
 * Run `fn` with an active tenant context.
 *
 * Deliberately a raw pass-through, because this is what the Express middleware
 * uses: wrapping `next` in an async function would trap a synchronous throw
 * from a downstream handler inside a promise, where Express's error handler
 * never sees it and the request hangs instead of 500-ing.
 *
 * The cost of staying raw: a caller that returns an *unawaited* Mongoose Query
 * gets it back unexecuted, and awaiting it later runs the hooks after this
 * context has closed. Inside a request that never happens — handlers await
 * their own queries. Programmatic callers should use `withTenant` below.
 *
 * @param {{locationId?: any, locationIds?: any[], unscoped?: boolean}} context
 */
const runWithTenant = (context, fn) => storage.run(context, fn);

/**
 * Promise-returning form of runWithTenant: awaits `fn` *inside* the context, so
 * a lazily-built Mongoose Query is executed while the context is still open.
 * Use this everywhere except Express middleware.
 */
const withTenant = (context, fn) => storage.run(context, async () => await fn());

/**
 * Run `fn` with tenant scoping switched off entirely — for work that is not
 * per-request and legitimately spans every location: the cron sweeps, seeds,
 * migrations, and the admin "all locations" reports.
 *
 * Every call is a deliberate hole in the isolation, so keep them few and keep
 * them obvious.
 */
const runUnscoped = (fn) => storage.run({ unscoped: true }, async () => await fn());

/** The active context, or null when running outside any. */
const getTenantContext = () => storage.getStore() || null;

/**
 * Pin an "all locations" request to the one location a record belongs to.
 *
 * An admin browsing with no single location picked can read every branch, but
 * creating anything is refused there — a new row has to be stamped with one
 * location. When they then open a particular carrier and add a driver or save
 * equipment, the right location is not in doubt: it is that carrier's. So the
 * rest of the request runs as if they had picked it.
 *
 * Only ever narrows, and only to a location already in the request's own
 * allowed set — it cannot reach a branch the user could not already see.
 * Outside "all locations" mode it does nothing.
 */
const narrowToLocation = (req, locationId) => {
  const store = storage.getStore();
  if (!store?.allLocations || !locationId) return false;

  const id = String(locationId);
  if (!(store.locationIds || []).map(String).includes(id)) return false;

  store.locationId = id;
  store.locationIds = [id];
  store.allLocations = false;

  if (req) {
    req.locationId = id;
    req.locationIds = [id];
    req.allLocations = false;
  }
  return true;
};

module.exports = {
  runWithTenant,
  withTenant,
  runUnscoped,
  getTenantContext,
  narrowToLocation,
};
