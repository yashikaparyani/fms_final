// ─── Per-location ID sequences ────────────────────────────────────────────────
// IDs carry their branch: NY-LD-0001, CHI-FO-0007. Each branch counts from 1 in
// its own counter, and the prefix keeps IDs globally unique so a cross-location
// report or export is never ambiguous about which branch a row came from.
//
// Counter documents are keyed "<entity>:<branch code>", e.g. "load:NY".
// ─────────────────────────────────────────────────────────────────────────────

const Counter = require("../models/Counter.model.js");

const PREFIX = {
  load: "LD",
  fleetOwner: "FO",
  driver: "DR",
};

// Branch codes never change once issued (see models/Branch.js), so caching the
// id → code mapping for the process lifetime is safe and saves a lookup on every
// single create.
const codeCache = new Map();

const branchCodeFor = async (locationId) => {
  if (!locationId) return null;

  const key = String(locationId);
  if (codeCache.has(key)) return codeCache.get(key);

  // Required lazily: models/Branch.js is loaded after this module in some entry
  // points, and a top-level require would capture it half-built.
  const Branch = require("../models/Branch");
  const branch = await Branch.findById(locationId).select("code").lean();
  if (!branch?.code) return null;

  codeCache.set(key, branch.code);
  return branch.code;
};

/**
 * Next ID for `entity` within a branch, e.g. nextSequence("load", id) → NY-LD-0001.
 *
 * Falls back to an unprefixed LD-0001 when the record has no location — which
 * only happens for data created before locations existed, or inside an unscoped
 * migration. Those keep working rather than crashing, and read as legacy at a
 * glance.
 */
const nextSequence = async (entity, locationId) => {
  const prefix = PREFIX[entity];
  if (!prefix) throw new Error(`No ID prefix registered for "${entity}"`);

  const code = await branchCodeFor(locationId);
  const counterKey = code ? `${entity}:${code}` : entity;

  const counter = await Counter.findByIdAndUpdate(
    counterKey,
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true },
  );

  const number = String(counter.seq).padStart(4, "0");
  return code ? `${code}-${prefix}-${number}` : `${prefix}-${number}`;
};

/** Test/migration helper — the cache would otherwise outlive a dropped database. */
const resetBranchCodeCache = () => codeCache.clear();

module.exports = { nextSequence, resetBranchCodeCache, PREFIX };
