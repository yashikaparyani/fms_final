// Seed three sample California locations, so the header's location switcher has
// something to switch between.
//
//   node scripts/seedCaliforniaBranches.js
//
// Idempotent: a branch whose code already exists is left as it is (only
// reactivated if it had been deactivated), so re-running never duplicates a
// location or overwrites details somebody has since edited.
//
// Admins reach every active branch by role — see middleware/location.js — so
// nothing has to be granted to them here. Non-admin staff still need locations
// assigned explicitly, via the Staff screen or scripts/bootstrapAccess.js.

require("dotenv").config();
const mongoose = require("mongoose");
const { runUnscoped } = require("../utils/tenantContext");

const Branch = require("../models/Branch");

// The three drayage hubs a California operation actually runs out of: the two
// San Pedro Bay ports and the Bay Area.
const BRANCHES = [
  {
    name: "Los Angeles",
    code: "LA",
    address: "425 S Palos Verdes St",
    city: "Los Angeles",
    state: "CA",
    zip: "90731",
    phone: "310-555-0142",
    email: "la@example.com",
  },
  {
    name: "Long Beach",
    code: "LGB",
    address: "1521 Pier F Ave",
    city: "Long Beach",
    state: "CA",
    zip: "90802",
    phone: "562-555-0118",
    email: "lgb@example.com",
  },
  {
    name: "Oakland",
    code: "OAK",
    address: "1 Middle Harbor Rd",
    city: "Oakland",
    state: "CA",
    zip: "94607",
    phone: "510-555-0176",
    email: "oak@example.com",
  },
];

const run = async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGO_URI is not set — nothing to connect to.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`Connected to ${uri.replace(/\/\/[^@]*@/, "//***:***@")}\n`);

  // Branch is not tenant-scoped, but a script is exactly the cross-location
  // case runUnscoped exists for.
  await runUnscoped(async () => {
    for (const spec of BRANCHES) {
      const existing = await Branch.findOne({ code: spec.code });

      if (existing) {
        if (existing.active) {
          console.log(`  = ${spec.code.padEnd(4)} ${existing.name} — already exists, left alone.`);
        } else {
          existing.active = true;
          await existing.save();
          console.log(`  ↑ ${spec.code.padEnd(4)} ${existing.name} — reactivated.`);
        }
        continue;
      }

      const branch = await Branch.create(spec);
      console.log(`  + ${branch.code.padEnd(4)} ${branch.name} — created.`);
    }

    const active = await Branch.find({ active: true }).sort({ name: 1 }).lean();
    console.log(`\n${active.length} active location(s):`);
    active.forEach((b) =>
      console.log(`   ${b.code.padEnd(6)} ${b.name}${b.city ? ` · ${b.city}, ${b.state}` : ""}`),
    );

    // The switcher hides itself below two, which is the usual reason it does
    // not appear at all.
    console.log(
      active.length > 1
        ? "\nThe location switcher will show in the header for admins."
        : "\nOnly one active location — the switcher stays hidden until there are two.",
    );
  });

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error("Seeding failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
