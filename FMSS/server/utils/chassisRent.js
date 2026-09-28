// utils/chassisRent.js
//
// What a load owes its chassis company in rent.
//
// Rent runs per calendar day from the load's pickup date, and stops on the day
// it was delivered — or runs up to today while it is still out. Both ends count:
// a chassis picked up and returned on the same day is one day's rent.
//
// Each day is charged the rate that was in force on that day, read from the
// company's rate history. A rate edited mid-load therefore splits the load: the
// days before the effective date at the old rate, the days from it at the new.
// Days before the company's first recorded rate are charged that first rate —
// the rate was set up after the fact, not free before it.

const { calendarDate, addDays, daysBetween, today } = require("./dates");

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

/** A company's rates, oldest first, as { dailyRent, effectiveDate } at UTC midnight. */
const ratesOf = (company) => {
  const history = (company?.rateHistory || [])
    .map((entry) => ({
      dailyRent: Number(entry.dailyRent) || 0,
      effectiveDate: calendarDate(entry.effectiveDate),
    }))
    .filter((entry) => entry.effectiveDate)
    .sort((a, b) => a.effectiveDate - b.effectiveDate);

  // A company given a rate before history was kept.
  if (!history.length && company?.dailyRent != null) {
    return [{ dailyRent: Number(company.dailyRent) || 0, effectiveDate: null }];
  }
  return history;
};

/** The daily rent in force on one calendar day. Null when the company has no rate. */
const rateOn = (company, day) => {
  const rates = ratesOf(company);
  if (!rates.length) return null;

  const date = calendarDate(day);
  let current = rates[0];
  for (const entry of rates) {
    if (!entry.effectiveDate || entry.effectiveDate <= date) current = entry;
  }
  return current.dailyRent;
};

/** The load's first pickup date — the day the chassis goes out. */
const pickupDateOf = (load) =>
  load?.pickups?.[0]?.pickupDate || load?.pickup?.pickupDate || null;

/**
 * Chassis rent for one load.
 *
 * Returns null when there is nothing to work out — no chassis company on the
 * load, no rate on the company, or no pickup date to count from. Otherwise:
 *
 *   { company, from, to, running, days, amount, dailyRent, breakdown }
 *
 * `breakdown` has one entry per rate the load crossed, so a rate change shows
 * as "3 days @ $30, 2 days @ $35" rather than an unexplained total.
 */
const chassisRentFor = (load, company) => {
  if (!company || !ratesOf(company).length) return null;

  const from = calendarDate(pickupDateOf(load));
  if (!from) return null;

  const running = !load?.deliveredAt;
  const to = calendarDate(load?.deliveredAt || today());
  if (!to || to < from) {
    return {
      company: company.name,
      from,
      to: from,
      running,
      days: 0,
      amount: 0,
      dailyRent: rateOn(company, from),
      breakdown: [],
    };
  }

  const days = daysBetween(from, to) + 1;
  const breakdown = [];

  for (let i = 0; i < days; i += 1) {
    const rate = rateOn(company, addDays(from, i));
    const last = breakdown[breakdown.length - 1];
    if (last && last.dailyRent === rate) {
      last.days += 1;
    } else {
      breakdown.push({ dailyRent: rate, days: 1, from: addDays(from, i) });
    }
  }

  breakdown.forEach((part) => {
    part.amount = money(part.dailyRent * part.days);
  });

  return {
    company: company.name,
    from,
    to,
    running,
    days,
    amount: money(breakdown.reduce((sum, part) => sum + part.amount, 0)),
    // The rate the load is on now, for the one-line summary.
    dailyRent: breakdown[breakdown.length - 1]?.dailyRent ?? null,
    breakdown,
  };
};

module.exports = { ratesOf, rateOn, chassisRentFor, pickupDateOf };
