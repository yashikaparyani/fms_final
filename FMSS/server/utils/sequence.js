// ─── ID sequences ─────────────────────────────────────────────────────────────
// Most IDs carry their branch: CHI-FO-0007, NY-DR-0003. Each branch counts from
// 1 in its own counter, and the prefix keeps IDs globally unique so a
// cross-location report or export is never ambiguous about which branch a row
// came from. Counter documents are keyed "<entity>:<branch code>", e.g.
// "fleetOwner:NY".
//
// Loads and carriers are the exceptions — "LD 0014" and "SLINE 00001", with no
// branch code. The office reads and says both all day and the branch letters
// were noise in every one of those conversations. Dropping the code means the
// number itself has to be unique across the whole business, so those two count
// from a single counter (keyed just "load" / "fleetOwner") rather than one per
// branch: two branches each issuing their own 0001 would collide on the unique
// index and fail the create outright.
// ─────────────────────────────────────────────────────────────────────────────

const Counter = require("../models/Counter.model.js");

const PREFIX = {
  load: "LD",
  fleetOwner: "SLINE",
  driver: "DR",

  // ── Accounting ────────────────────────────────────────────────────────────
  // A load's own invoice IS its load number — "LD 0014" — and a carrier bill on
  // it is "LD 0014-AP1", so neither is numbered here; see
  // services/invoiceService.js. These three cover the documents that have no
  // load to take a number from.
  //
  // All branched. A payment reference is quoted back by a bank or a customer
  // weeks later, and knowing which office issued it is most of finding it.
  manualInvoice: "MI",
  receipt: "RCP", // money in
  payment: "PMT", // money out
};

// Entities numbered once across the business rather than once per branch. Both
// of these are read aloud and quoted constantly, so they carry no branch
// letters — which means the number itself has to be unique everywhere.
const UNBRANCHED = new Set(["load", "fleetOwner"]);

// What sits between the prefix and the number. A load reads "LD 0014" and a
// carrier "SLINE 12345"; a driver keeps the hyphen it has always had.
const SEPARATOR = { load: " ", fleetOwner: " " };

// How many digits the number is padded to. Carrier codes are quoted on
// paperwork against a five-digit house series, so they are padded to five.
const PAD = { fleetOwner: 5 };
const DEFAULT_PAD = 4;

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
 * Next ID for `entity`, e.g. nextSequence("driver", id) → NY-DR-0001,
 * nextSequence("load", id) → LD 0001, nextSequence("fleetOwner") → SLINE 00001.
 *
 * A branched entity falls back to an unprefixed FO-0001 when the record has no
 * location — which only happens for data created before locations existed, or
 * inside an unscoped migration. Those keep working rather than crashing, and
 * read as legacy at a glance.
 */
const nextSequence = async (entity, locationId) => {
  const prefix = PREFIX[entity];
  if (!prefix) throw new Error(`No ID prefix registered for "${entity}"`);

  const code = UNBRANCHED.has(entity) ? null : await branchCodeFor(locationId);
  const counterKey = code ? `${entity}:${code}` : entity;

  const counter = await Counter.findByIdAndUpdate(
    counterKey,
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true },
  );

  const number = String(counter.seq).padStart(PAD[entity] || DEFAULT_PAD, "0");
  const separator = SEPARATOR[entity] || "-";
  return code
    ? `${code}-${prefix}${separator}${number}`
    : `${prefix}${separator}${number}`;
};

/** Test/migration helper — the cache would otherwise outlive a dropped database. */
const resetBranchCodeCache = () => codeCache.clear();

module.exports = { nextSequence, resetBranchCodeCache, PREFIX };
