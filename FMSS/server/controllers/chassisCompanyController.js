// controllers/chassisCompanyController.js
const ChassisCompany = require("../models/ChassisCompany");
const { createMasterController } = require("../utils/masterCrud");
const { calendarDate, today } = require("../utils/dates");

const money = (value) => Math.round(Number(value) * 100) / 100;

/**
 * The daily rent and the day it takes effect.
 *
 * A new company's first rate starts on the date given, or today. Changing the
 * rate on an existing company needs an effective date: without one there is no
 * telling which days of a load already on the road are charged the old rate and
 * which the new. The change is added to the rate history rather than written
 * over the old rate, so loads picked up before it keep costing what they did.
 *
 * Leaving the rent blank changes nothing.
 */
const applyDailyRent = (row, body, req, { isNew }) => {
  const raw = body.dailyRent;
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;

  const rent = Number(raw);
  if (!Number.isFinite(rent) || rent < 0) {
    return "Daily rent must be a number of 0 or more.";
  }

  const hadRate = row.dailyRent != null || (row.rateHistory || []).length > 0;
  const effectiveRaw = String(body.rateEffectiveDate || "").trim();

  // Saving the form again without touching the rate is not a rate change.
  if (!isNew && hadRate && money(rent) === money(row.dailyRent) && !effectiveRaw) {
    return null;
  }

  if (!isNew && hadRate && !effectiveRaw) {
    return "Give the date the new daily rent takes effect from.";
  }

  const effectiveDate = effectiveRaw ? calendarDate(effectiveRaw) : today();
  if (!effectiveDate) return "The effective date is not a valid date.";

  // One rate per day: entering a second rate for the same effective date
  // corrects the first rather than stacking two rates on one day.
  const history = (row.rateHistory || []).filter(
    (entry) => calendarDate(entry.effectiveDate)?.getTime() !== effectiveDate.getTime(),
  );
  history.push({
    dailyRent: money(rent),
    effectiveDate,
    changedBy: req.user?._id,
    changedAt: new Date(),
  });
  history.sort((a, b) => new Date(a.effectiveDate) - new Date(b.effectiveDate));

  row.rateHistory = history;
  row.dailyRent = money(rent);
  return null;
};

// email is optional here: a chassis company is selectable on a load whether or
// not anyone needs to be notified about it.
const {
  list: getChassisCompanies,
  create: createChassisCompany,
  update: updateChassisCompany,
  remove: deleteChassisCompany,
} = createMasterController({
  Model: ChassisCompany,
  label: "Chassis company",
  textFields: ["code", "email", "phone"],
  apply: applyDailyRent,
});

module.exports = {
  getChassisCompanies,
  createChassisCompany,
  updateChassisCompany,
  deleteChassisCompany,
};
