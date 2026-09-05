const { money } = require("../config/chargeTypes");

// ─── The ledger a load already has, before anybody itemises it ────────────────
// A load carries its money in two places, and only one of them is the ledger.
//
//   load.amount                  — what the customer pays. Required on every
//                                  load, set at creation, long predating the
//                                  accounting section.
//   assignments[].carrierRate    — what each carrier on a split load is paid.
//   load.vendorRate              — what the single carrier is paid.
//   load.winningBid.amount       — what the carrier bid, when nobody has since
//                                  overridden it with a rate.
//
// The accounting screens read `accounting.receivables.lines` and
// `accounting.payables.lines`. A load created before that section existed — or
// one nobody has opened the accounting screen for yet — has those empty, and
// every figure downstream reports $0 for a load that plainly has a value.
//
// ── Derived, not migrated ────────────────────────────────────────────────────
// This synthesises the obvious line rather than writing it to the database,
// deliberately:
//
//   * A migration has to be remembered and re-run. Every load created through
//     the load form, the bid award or an import arrives in exactly this state,
//     so a one-time backfill fixes today and is wrong again next week.
//   * Writing lines on read would mean a GET mutates data, and a staff member
//     who cleared a ledger to start over would find it silently repopulated.
//   * The moment somebody saves a real ledger, these disappear on their own —
//     the stored lines win, with no precedence rule to get wrong.
//
// So this is what the load says it is worth until somebody says otherwise. Every
// derived line is flagged `derived: true`, so the screen can say where the
// figure came from rather than implying somebody typed it.
// ─────────────────────────────────────────────────────────────────────────────

const DERIVED_NOTE = {
  receivable: "From the load's base amount",
  payable: "From the agreed carrier rate",
};

const positive = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? money(number) : 0;
};

/**
 * What the customer is billed, itemised if anybody has, derived if not.
 *
 * Only the base charge is ever derived. Accessorials are things that happened —
 * detention, a chassis split — and inventing them from a total nobody broke down
 * would be making up facts about the job.
 */
const receivableLinesFor = (load) => {
  const stored = load?.accounting?.receivables?.lines;
  if (stored?.length) return stored;

  const amount = positive(load?.amount);
  if (!amount) return [];

  return [
    {
      chargeType: "linehaul",
      amount,
      note: DERIVED_NOTE.receivable,
      derived: true,
    },
  ];
};

/**
 * What the carriers are paid, itemised if anybody has, derived if not.
 *
 * On a split load this produces one line per leg, each naming its carrier — the
 * same shape the payables editor writes — so a derived ledger splits into
 * per-carrier bills exactly like a real one.
 *
 * The single-carrier fallbacks are tried in order of how deliberate they are:
 * a rate set by staff beats the figure a carrier happened to bid, because the
 * bid is what was offered and the rate is what was agreed.
 */
const payableLinesFor = (load) => {
  const stored = load?.accounting?.payables?.lines;
  if (stored?.length) return stored;

  const legs = load?.assignments || [];

  if (legs.length) {
    return legs
      .map((leg) => ({
        chargeType: "linehaul",
        amount: positive(leg.carrierRate),
        note: DERIVED_NOTE.payable,
        fleetOwnerId: leg.fleetOwnerId,
        derived: true,
      }))
      // A leg nobody has priced contributes nothing rather than a $0 line —
      // an empty row on a bill reads as "we owe you nothing", which is a
      // different claim from "we have not priced this yet".
      .filter((line) => line.amount > 0);
  }

  const amount = positive(load?.vendorRate) || positive(load?.winningBid?.amount);
  if (!amount) return [];

  return [
    {
      chargeType: "linehaul",
      amount,
      note: positive(load?.vendorRate)
        ? DERIVED_NOTE.payable
        : "From the winning bid",
      fleetOwnerId: load?.assignedFleetOwner?.fleetOwnerId,
      derived: true,
    },
  ];
};

/** Both sides at once, for the callers that need them together. */
const linesFor = (load) => ({
  receivable: receivableLinesFor(load),
  payable: payableLinesFor(load),
});

/**
 * Whether a side is showing derived figures rather than a real ledger.
 *
 * The screens use this to label the numbers. A user needs to know the difference
 * between "somebody costed this load" and "this is the headline amount with
 * nothing broken out", because only the second one still needs doing.
 */
const isDerived = (load, side) => {
  const stored =
    side === "receivable"
      ? load?.accounting?.receivables?.lines
      : load?.accounting?.payables?.lines;

  if (stored?.length) return false;

  return (
    (side === "receivable" ? receivableLinesFor(load) : payableLinesFor(load)).length > 0
  );
};

module.exports = {
  receivableLinesFor,
  payableLinesFor,
  linesFor,
  isDerived,
  DERIVED_NOTE,
};
