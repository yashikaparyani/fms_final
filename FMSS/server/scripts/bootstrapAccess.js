// Diagnose and repair the "Your account is not assigned to any location" wall.
//
//   node scripts/bootstrapAccess.js                       # report only, changes nothing
//   node scripts/bootstrapAccess.js you@company.com       # fix that account
//   node scripts/bootstrapAccess.js you@company.com --location "Head Office" HO
//
// There are three ways to end up locked out, and they need different fixes, so
// this reports what it found before it touches anything:
//
//   1. No active branch exists. Everyone is locked out, admins included, because
//      an admin's location set is "every active branch". Pass --location to
//      create one.
//   2. The account is role "staff" (the old seedStaff.js created admin@fms.com
//      as staff) and has no `locations`. Staff are scoped by their own list, so
//      an empty one means no access anywhere.
//   3. The account is an admin but every branch has been deactivated. Reactivate
//      one from the report below, or create a fresh one.
//
// Idempotent — safe to run repeatedly.

require("dotenv").config();
const mongoose = require("mongoose");
const { runUnscoped } = require("../utils/tenantContext");

const Branch = require("../models/Branch");
const User = require("../models/User");
const { TEMPLATES } = require("../config/permissions");

const parseArgs = () => {
  const argv = process.argv.slice(2);
  const email = argv.find((a) => a.includes("@")) || "";

  const flag = argv.indexOf("--location");
  const location =
    flag === -1
      ? null
      : {
          name: argv[flag + 1] || "Head Office",
          code: (argv[flag + 2] || "HO").toUpperCase(),
        };

  return { email: email.trim().toLowerCase(), location };
};

const run = async () => {
  const { email, location } = parseArgs();

  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGO_URI is not set — nothing to connect to.");
    process.exit(1);
  }

  await mongoose.connect(uri);

  // Branch and User are not tenant-scoped, but anything this script grows into
  // might be, and a script is exactly the cross-location case runUnscoped exists
  // for.
  await runUnscoped(async () => {
    // ── Report ────────────────────────────────────────────────────────────
    const branches = await Branch.find().sort({ name: 1 }).lean();
    const active = branches.filter((b) => b.active);

    console.log(`\nLocations: ${branches.length} total, ${active.length} active`);
    branches.forEach((b) =>
      console.log(
        `   ${b.active ? "●" : "○"} ${b.code.padEnd(6)} ${b.name}${b.active ? "" : "  (inactive)"}`,
      ),
    );
    if (!branches.length) console.log("   (none)");

    const admins = await User.find({ role: "admin", isDeleted: { $ne: true } })
      .select("email isActive")
      .lean();
    console.log(`\nAdmins: ${admins.length}`);
    admins.forEach((a) =>
      console.log(`   ${a.isActive === false ? "○" : "●"} ${a.email}`),
    );
    if (!admins.length) console.log("   (none — this is why nobody can get in)");

    // ── Ensure a location exists ──────────────────────────────────────────
    let branch = active[0];

    if (!branch && location) {
      const existing = await Branch.findOne({ code: location.code });
      if (existing) {
        existing.active = true;
        await existing.save();
        branch = existing;
        console.log(`\nReactivated ${existing.code} — ${existing.name}`);
      } else {
        branch = await Branch.create({ name: location.name, code: location.code });
        console.log(`\nCreated location ${branch.code} — ${branch.name}`);
      }
    }

    if (!branch) {
      console.log(
        "\nNo active location exists. Re-run with --location \"Head Office\" HO to create one.",
      );
      if (!email) return;
    }

    if (!email) {
      console.log("\nReport only — pass an email address to repair that account.");
      return;
    }

    // ── Repair the account ────────────────────────────────────────────────
    const user = await User.findOne({ email });

    if (!user) {
      console.log(`\nNo account found for ${email}.`);
      const candidates = await User.find({ role: { $in: ["admin", "staff"] } })
        .select("email role")
        .limit(20)
        .lean();
      console.log("Back-office accounts that do exist:");
      candidates.forEach((c) => console.log(`   ${c.role.padEnd(6)} ${c.email}`));
      return;
    }

    const before = {
      role: user.role,
      isActive: user.isActive,
      locations: (user.locations || []).length,
      permissions: (user.permissions || []).length,
    };

    // Promoting to admin is what makes the account self-sufficient: an admin
    // reaches every *active* branch by role, so they never depend on a list
    // somebody has to remember to update.
    user.role = "admin";
    user.isActive = true;
    user.isDeleted = false;
    user.isVerified = true;

    // Admins bypass the permission checks, but the list is filled in anyway so
    // the Permissions screen shows something coherent if they are ever demoted
    // to staff.
    if (!(user.permissions || []).length) {
      user.permissions = [...TEMPLATES.manager.permissions];
    }

    const allActive = await Branch.find({ active: true }).select("_id").lean();
    user.locations = allActive.map((b) => b._id);
    user.defaultLocation = branch?._id || allActive[0]?._id;

    await user.save();

    console.log(`\nRepaired ${user.email}`);
    console.log(
      `   role         ${before.role} → ${user.role}` +
        (before.role === user.role ? "  (unchanged)" : ""),
    );
    console.log(`   active       ${before.isActive} → ${user.isActive}`);
    console.log(`   locations    ${before.locations} → ${user.locations.length}`);
    console.log(
      `   permissions  ${before.permissions} → ${user.permissions.length}`,
    );
    console.log(
      `\nSign in at /admin-login. Note the password is unchanged — if you do not know it, ` +
        `create a new admin with this script and set one, or use the Staff screen once you are in.`,
    );
  });

  await mongoose.disconnect();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
