const { daysBetween, todayKey } = require("./dates");

// ─── How long a container has been parked ─────────────────────────────────────
// A box put down empty or loaded in the yard, or dropped at a warehouse, can sit
// there for days, weeks or months. Nobody needs a driver for it in that time,
// but the driver who put it there has done their work and is owed for it — and
// the office needs to see how long each one has been standing.
//
// Counted from when the load last ENTERED its current status, read off
// `transportStatusHistory` rather than `updatedAt`: a parked load still gets
// touched by unrelated edits, and updatedAt would reset its age every time
// somebody fixed a typo. updatedAt is only the fallback for a load older than
// the history.
// ─────────────────────────────────────────────────────────────────────────────

const YARD_STATUSES = ["EMPTY_IN_YARD", "LOADED_IN_YARD", "DROP_IN_WAREHOUSE"];

/** When the load last entered `status`, or null if the history never says. */
const enteredStatusAt = (load, status) => {
  const history = load?.transportStatusHistory || [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]?.status === status) return history[i].changedAt || null;
  }
  return null;
};

/**
 * `{ since, days }` for a load parked in the yard or at a warehouse, or null for
 * any other load. `days` is whole calendar days, so a box put down this morning
 * reads 0 and one put down yesterday reads 1.
 */
const yardAge = (load) => {
  if (!YARD_STATUSES.includes(load?.transportStatus)) return null;
  const since = enteredStatusAt(load, load.transportStatus) || load.updatedAt || null;
  if (!since) return null;
  return { since, days: Math.max(0, daysBetween(since, todayKey())) };
};

module.exports = { YARD_STATUSES, enteredStatusAt, yardAge };
