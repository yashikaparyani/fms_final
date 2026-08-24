/**
 * What the broker keeps, and what the carrier is shown.
 *
 * On an instant-dispatch load the customer names a price and the broker takes a
 * percentage of it. The carrier is offered, accepts, and is paid the remainder
 * — they never see the customer's figure, because what the customer pays is not
 * their business and showing it would invite them to argue the split on every
 * load.
 *
 * The rate is stamped onto the load at the moment the request goes out, not
 * read live. A load agreed at 20% stays a load agreed at 20% after somebody
 * raises the house rate to 25% — otherwise a rate change would silently rewrite
 * what a carrier already accepted, which is a different thing from a rate
 * change.
 *
 * Money is rounded to cents at the boundary rather than carried as floats
 * indefinitely: the payout is what somebody is actually paid, and 0.30000000004
 * is not a number that should reach an invoice.
 */

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

/**
 * Split a customer amount into the broker's cut and the carrier's payout.
 *
 * @param {number} customerAmount what the customer agreed to pay
 * @param {number} commissionPercent the rate to apply, 0–100
 */
const splitAmount = (customerAmount, commissionPercent) => {
  const gross = Number(customerAmount);
  const percent = Number(commissionPercent);

  if (!Number.isFinite(gross) || gross < 0) {
    throw Object.assign(new Error("The load amount is not a valid figure."), {
      status: 400,
    });
  }

  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw Object.assign(new Error("The commission rate is not a valid percentage."), {
      status: 400,
    });
  }

  const commissionAmount = round2((gross * percent) / 100);

  return {
    customerAmount: round2(gross),
    commissionPercent: percent,
    commissionAmount,
    // Derived by subtraction rather than by a second percentage calculation, so
    // the two halves always add back up to what the customer pays. Rounding
    // both independently is how a ledger ends up a cent out.
    carrierAmount: round2(gross - commissionAmount),
  };
};

/**
 * The figure a given viewer is allowed to see on an instant-dispatch load.
 *
 * The office and the customer see the customer's amount, because between them
 * that is what was agreed. A carrier or a driver sees the payout.
 *
 * Returns null when the load is not on instant dispatch, so callers fall
 * through to whatever the ordinary bidding flow already shows.
 */
const visibleAmountFor = (load, role) => {
  const commission = load?.commission;
  if (!commission || commission.carrierAmount === undefined) return null;

  return ["fleetOwner", "driver"].includes(role)
    ? commission.carrierAmount
    : commission.customerAmount;
};

module.exports = { splitAmount, visibleAmountFor, round2 };
