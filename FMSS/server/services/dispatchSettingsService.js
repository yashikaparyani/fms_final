const { DispatchSettings, DEFAULTS } = require("../models/DispatchSettings");
const { runUnscoped } = require("../utils/tenantContext");

/**
 * What instant dispatch is set to for one branch.
 *
 * Three layers, most specific winning: the branch's own row, then the house
 * default row (`branch: null`), then the hard defaults in the model. A branch
 * row states only what it overrides, so raising the house rate moves every
 * branch that has not deliberately set its own.
 *
 * `undefined` is what "not set here" means — not `null`, and not `0`. A branch
 * that genuinely runs at 0% commission has to be able to say so, and `||`
 * chaining would silently promote that back to the house rate.
 *
 * Runs unscoped because this collection is keyed by `branch` rather than
 * carrying a locationId, and the house row belongs to no branch at all.
 */
const settingsFor = async (branchId) => {
  const [global, branch] = await runUnscoped(() =>
    Promise.all([
      DispatchSettings.findOne({ branch: null }).lean(),
      branchId ? DispatchSettings.findOne({ branch: branchId }).lean() : null,
    ]),
  );

  const pick = (key) => {
    if (branch && branch[key] !== undefined && branch[key] !== null) return branch[key];
    if (global && global[key] !== undefined && global[key] !== null) return global[key];
    return DEFAULTS[key];
  };

  return {
    commissionPercent: pick("commissionPercent"),
    searchRadiusMiles: pick("searchRadiusMiles"),
    positionMaxAgeHours: pick("positionMaxAgeHours"),
    offerWindowMinutes: pick("offerWindowMinutes"),
    instantDispatchEnabled: pick("instantDispatchEnabled"),
    // Which layer each branch is actually running on, so the settings screen
    // can say "inherited" rather than showing a number that looks set here.
    source: {
      branch: !!branch,
      global: !!global,
    },
  };
};

/**
 * Write one layer's settings.
 *
 * Upserts because the row for a branch does not exist until somebody changes
 * something, and an admin editing settings should not have to care whether
 * they are creating or updating.
 *
 * A field sent as null or "" is cleared rather than stored, which is how a
 * branch stops overriding and goes back to inheriting the house rate. Sending
 * nothing at all for a field leaves whatever is there alone.
 */
const NUMERIC_FIELDS = [
  "commissionPercent",
  "searchRadiusMiles",
  "positionMaxAgeHours",
  "offerWindowMinutes",
];

const saveSettings = async (branchId, payload = {}, userId) => {
  const set = {};
  const unset = {};

  NUMERIC_FIELDS.forEach((key) => {
    if (!(key in payload)) return;

    const raw = payload[key];
    if (raw === null || raw === "") {
      unset[key] = "";
      return;
    }

    const value = Number(raw);
    if (!Number.isFinite(value)) {
      throw Object.assign(new Error(`${key} must be a number.`), { status: 400 });
    }
    set[key] = value;
  });

  if ("instantDispatchEnabled" in payload) {
    if (payload.instantDispatchEnabled === null || payload.instantDispatchEnabled === "") {
      unset.instantDispatchEnabled = "";
    } else {
      set.instantDispatchEnabled = !!payload.instantDispatchEnabled;
    }
  }

  set.updatedBy = userId;

  const update = { $set: set };
  if (Object.keys(unset).length) update.$unset = unset;

  await runUnscoped(() =>
    DispatchSettings.findOneAndUpdate({ branch: branchId || null }, update, {
      upsert: true,
      new: true,
      // The schema's own min/max are the guard against a 200% commission, so
      // they have to run on an upsert too.
      runValidators: true,
      setDefaultsOnInsert: true,
    }),
  );

  return settingsFor(branchId);
};

module.exports = { settingsFor, saveSettings, DEFAULTS };
