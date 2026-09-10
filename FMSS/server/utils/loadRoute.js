// ─── Where a load actually went ───────────────────────────────────────────────
// "Newark, NJ → Chicago, IL". One definition, because the route is the thing
// people recognise a job by long before they can recall its load number — the
// customer ringing about an invoice describes the move, not the reference — and
// three screens spelling it three different ways is three screens somebody has
// to translate between.
//
// City and state only. The full street address belongs on the documents that
// have to be delivered to it; on a heading it is noise that pushes the part
// being read off the end of the line.
// ─────────────────────────────────────────────────────────────────────────────

const trimmed = (value) => String(value ?? "").trim();

/** "City, ST" for one stop, or "" when the stop has neither. */
const placeOf = (stop) =>
  [trimmed(stop?.city), trimmed(stop?.state)].filter(Boolean).join(", ");

// `pickup`/`drop` are kept in sync with `pickups[0]`/`drops[0]` server-side, but
// a load edited through the multi-stop form carries the arrays as the source of
// truth — the same precedence the client's pickupDateOf uses.
const firstPickup = (load) => load?.pickups?.[0] || load?.pickup || null;
const firstDrop = (load) => load?.drops?.[0] || load?.drop || null;

/**
 * The load's route as two ends.
 *
 * Always an object with both keys, each possibly "" — a caller rendering it can
 * then ask `route.from` without guarding, and a load whose stops were never
 * filled in reads as blank rather than as "undefined".
 */
const routeOf = (load) => ({
  from: placeOf(firstPickup(load)),
  to: placeOf(firstDrop(load)),
});

/** The route on one line, or "" when neither end is known. */
const routeLabel = (load) => {
  const { from, to } = routeOf(load);
  if (from && to) return `${from} → ${to}`;
  return from || to || "";
};

module.exports = { placeOf, routeOf, routeLabel };
