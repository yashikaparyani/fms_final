// One-off backfill: give every fleet owner created before `fleetOwnerCode`
// existed its permanent code.
//
//   node scripts/backfillFleetOwnerCodes.js
//
// Safe to run more than once — owners that already hold a code are skipped, and
// the shared counter is advanced past whatever codes are already in use so a
// later creation can never collide with one issued here.
//
// Oldest owner gets the lowest number, so the codes line up with the order the
// carriers actually joined.

require("dotenv").config();
const mongoose = require("mongoose");
const FleetOwner = require("../models/FleetOwner");
const Counter = require("../models/Counter.model.js");

const run = async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGO_URI is not set — nothing to connect to.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected.");

  const pending = await FleetOwner.find({
    $or: [{ fleetOwnerCode: { $exists: false } }, { fleetOwnerCode: null }],
  })
    .sort({ createdAt: 1, _id: 1 })
    .select("_id carrierName");

  if (!pending.length) {
    console.log("Every fleet owner already has a code. Nothing to do.");
    await mongoose.disconnect();
    return;
  }

  console.log(`${pending.length} fleet owner(s) need a code.`);

  // Start above the highest code already issued, so a re-run after a partial
  // pass cannot hand out a number that is already taken.
  const [highest] = await FleetOwner.find({ fleetOwnerCode: { $ne: null } })
    .sort({ fleetOwnerCode: -1 })
    .limit(1)
    .select("fleetOwnerCode");

  const highestSeq = highest?.fleetOwnerCode
    ? Number(String(highest.fleetOwnerCode).replace(/\D/g, "")) || 0
    : 0;

  const counter = await Counter.findById("fleetOwner");
  let seq = Math.max(highestSeq, counter?.seq || 0);

  let updated = 0;
  for (const owner of pending) {
    seq += 1;
    const code = `FO-${String(seq).padStart(4, "0")}`;
    await FleetOwner.updateOne({ _id: owner._id }, { $set: { fleetOwnerCode: code } });
    console.log(`  ${code}  ${owner.carrierName || "(no carrier name)"}`);
    updated += 1;
  }

  // Leave the counter where the next created owner picks up cleanly.
  await Counter.findByIdAndUpdate(
    "fleetOwner",
    { $set: { seq } },
    { upsert: true },
  );

  console.log(`Done — ${updated} fleet owner(s) coded. Counter now at ${seq}.`);
  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error("Backfill failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
