// Wipe the database, keeping only admin accounts.
//
//   node scripts/wipeKeepAdmins.js                          # report only, changes nothing
//   node scripts/wipeKeepAdmins.js --execute                # back up, then wipe
//   node scripts/wipeKeepAdmins.js --execute --keep branches,emailconfigs
//
// Every collection in the database is emptied except:
//   - users: documents with role "admin" are kept, everyone else is deleted
//   - any collection named in --keep (comma-separated collection names)
//
// Before deleting, --execute writes every collection to
// backups/wipe-<timestamp>/<collection>.json (EJSON), so the wipe can be undone.
//
// Note: an admin's access is "every active branch", so if no active branch is
// left the admin is locked out. Keep `branches`, or run bootstrapAccess.js
// with --location afterwards.

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { EJSON } = require("bson");

const argv = process.argv.slice(2);
const execute = argv.includes("--execute");
const keepFlag = argv.indexOf("--keep");
const keep = new Set(
  keepFlag === -1
    ? []
    : (argv[keepFlag + 1] || "").split(",").map((s) => s.trim()).filter(Boolean)
);

const ADMIN_FILTER = { role: "admin" };

const main = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  console.log(`Database: ${db.databaseName}`);

  const collections = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .filter((name) => !name.startsWith("system."))
    .sort();

  const admins = await db
    .collection("users")
    .find(ADMIN_FILTER, { projection: { name: 1, email: 1 } })
    .toArray();
  console.log(`\nAdmins that will be kept (${admins.length}):`);
  admins.forEach((a) => console.log(`  - ${a.email}  ${a.name || ""}`));
  if (admins.length === 0) {
    console.error("\nNo admin users found — refusing to continue.");
    process.exit(1);
  }

  const plan = [];
  for (const name of collections) {
    const coll = db.collection(name);
    const total = await coll.countDocuments();
    let filter = {};
    let action = "wipe";
    if (keep.has(name)) action = "keep";
    else if (name === "users") filter = { role: { $ne: "admin" } };
    const toDelete = action === "keep" ? 0 : await coll.countDocuments(filter);
    plan.push({ name, total, toDelete, filter, action });
  }

  console.log("\nCollection                     total   delete");
  for (const p of plan) {
    const label = p.action === "keep" ? "(kept)" : String(p.toDelete);
    console.log(`  ${p.name.padEnd(28)} ${String(p.total).padStart(6)}   ${label}`);
  }

  if (!execute) {
    console.log("\nReport only. Re-run with --execute to back up and delete.");
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(__dirname, "..", "backups", `wipe-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const p of plan) {
    const docs = await db.collection(p.name).find({}).toArray();
    fs.writeFileSync(
      path.join(dir, `${p.name}.json`),
      EJSON.stringify(docs, { relaxed: false })
    );
  }
  console.log(`\nBackup written to ${dir}`);

  for (const p of plan) {
    if (p.action === "keep" || p.toDelete === 0) continue;
    const { deletedCount } = await db.collection(p.name).deleteMany(p.filter);
    console.log(`  ${p.name}: deleted ${deletedCount}`);
  }
  console.log("\nDone.");
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
