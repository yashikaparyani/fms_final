// One-off migration: move a single-location database onto the multi-location
// model by creating one branch and filing every existing record under it.
//
//   node scripts/migrateToLocations.js "Head Office" HO
//
// Idempotent — records that already carry a locationId are left alone, so a
// re-run after an interruption picks up where it stopped.
//
// What it does NOT do: renumber existing IDs. Loads created before the change
// keep their bare LD-0001; only new ones get the HO-LD-0002 form. Rewriting
// historical IDs would break every reference already in somebody's inbox.

require("dotenv").config();
const mongoose = require("mongoose");
const { runUnscoped } = require("../utils/tenantContext");

const Branch = require("../models/Branch");
const User = require("../models/User");
const Counter = require("../models/Counter.model.js");

// Every tenant-scoped collection. Keep in step with the models carrying
// tenantScope — a model missing here keeps null locationIds and disappears from
// the UI, because the scoped queries will never match it.
const TENANT_MODELS = [
  "Load",
  "Customer",
  "FleetOwner",
  "Company",
  "ShippingLine",
  "ChassisCompany",
  "DeliveryPartner",
  "TrackingEvent",
  "Notification",
  "Bid",
  "Address",
];

const MODEL_PATHS = {
  Load: "../models/Load",
  Customer: "../models/Customer",
  FleetOwner: "../models/FleetOwner",
  Company: "../models/Company",
  ShippingLine: "../models/ShippingLine",
  ChassisCompany: "../models/ChassisCompany",
  DeliveryPartner: "../models/StreetTurnPartner",
  TrackingEvent: "../models/TrackingEvent",
  Notification: "../models/Notification",
  Bid: "../models/bidSchema",
  Address: "../models/common/Address",
};

const run = async () => {
  const name = process.argv[2] || "Head Office";
  const code = (process.argv[3] || "HO").toUpperCase();

  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGO_URI is not set — nothing to connect to.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`Connected. Migrating everything into "${name}" (${code}).`);

  // 1. The branch itself — reuse it if the migration already ran.
  let branch = await Branch.findOne({ code });
  if (!branch) {
    branch = await Branch.create({ name, code });
    console.log(`Created location ${branch.code} — ${branch.name}`);
  } else {
    console.log(`Reusing existing location ${branch.code} — ${branch.name}`);
  }

  // 2. Stamp every tenant collection. Unscoped, since by definition none of
  //    these rows can be found by a scoped query yet.
  await runUnscoped(async () => {
    for (const modelName of TENANT_MODELS) {
      const Model = require(MODEL_PATHS[modelName]);
      const result = await Model.updateMany(
        { $or: [{ locationId: { $exists: false } }, { locationId: null }] },
        { $set: { locationId: branch._id } },
      );
      console.log(`  ${modelName}: ${result.modifiedCount} record(s) filed.`);
    }
  });

  // 3. Give every existing user access to the branch, so nobody is locked out
  //    on the next sign-in. Admins are skipped: they reach all branches by role.
  const users = await User.updateMany(
    { role: { $ne: "admin" }, $or: [{ locations: { $size: 0 } }, { locations: { $exists: false } }] },
    { $set: { locations: [branch._id], defaultLocation: branch._id } },
  );
  console.log(`  Users: ${users.modifiedCount} granted access.`);

  // 4. Seed the per-branch counters from the old global ones, so the first new
  //    load is HO-LD-<next> rather than restarting at 1 and colliding in
  //    conversation with an existing LD-0001.
  for (const entity of ["load", "fleetOwner"]) {
    const globalCounter = await Counter.findById(entity);
    if (!globalCounter) continue;

    const key = `${entity}:${branch.code}`;
    const existing = await Counter.findById(key);
    if (existing) {
      console.log(`  Counter ${key} already at ${existing.seq}, left alone.`);
      continue;
    }

    await Counter.create({ _id: key, seq: globalCounter.seq });
    console.log(`  Counter ${key} seeded at ${globalCounter.seq}.`);
  }

  console.log("\nMigration complete.");
  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error("Migration failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
