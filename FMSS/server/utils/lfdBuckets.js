// ─── Last Free Date buckets ──────────────────────────────────────────────────
// The dashboard groups LFD loads into three mutually exclusive categories:
//
//   expired  — the last free date has passed; the container is accruing demurrage
//   today    — the last free date is today; it has to move before the day ends
//   upcoming — the last free date is still ahead
//
// The filters live here rather than in the controllers so the dashboard tile and
// the list its drill-down opens are built from the same query. If the two were
// written separately they would drift, and a tile that disagrees with its own
// list is worse than no tile at all.

const LFD_BUCKETS = ["expired", "today", "upcoming"];

// Free time is a port-side clock: it only runs while the container is still
// sitting there. Once the move is finished the date is history, so completed
// work is excluded from every bucket.
const LFD_CLOSED_TRANSPORT_STATUSES = ["DELIVERED", "TERMINATED", "INVOICED"];

// Only verified loads are counted, matching the transport-status tiles beside
// them — an unverified load has no committed schedule to be late against.
const lfdBaseFilter = () => ({
  status: "VERIFIED",
  transportStatus: { $nin: LFD_CLOSED_TRANSPORT_STATUSES },
});

/**
 * Mongo filter for one bucket, given today's half-open [start, end) bounds in
 * the viewer's timezone. Returns null for an unknown bucket name.
 *
 * A range operator on `lastFreeDate` also drops loads that never had one, so a
 * load with no LFD lands in no bucket rather than silently counting as expired.
 */
const lfdFilter = (bucket, { start, end }) => {
  const lastFreeDate =
    bucket === "expired"
      ? { $lt: start }
      : bucket === "today"
        ? { $gte: start, $lt: end }
        : bucket === "upcoming"
          ? { $gte: end }
          : null;

  if (!lastFreeDate) return null;
  return { ...lfdBaseFilter(), lastFreeDate };
};

module.exports = { LFD_BUCKETS, LFD_CLOSED_TRANSPORT_STATUSES, lfdFilter };
