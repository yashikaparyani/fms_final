// Repair the "N/A" placeholder that used to be written into customer names.
//
//   node scripts/backfillDisplayNames.js           # report only, changes nothing
//   node scripts/backfillDisplayNames.js --apply   # write the repairs
//
// Staff who added a customer without typing a contact name had the literal
// string "N/A" stored in both name fields. Anything that built a name by joining
// the two then read "N/A N/A" — the customer under every load ID on the
// accounting screen, the title on every customer card, and the greeting in the
// first email we sent them.
//
// The write paths are fixed (controllers/authController.js no longer stores the
// placeholder, controllers/loadController.js stamps the business name onto a
// load), and every read path treats it as absent. This repairs the records that
// were written before all that, so the data is right and not merely hidden.
//
// Idempotent — safe to run repeatedly, and safe to run while the app is up.

require("dotenv").config();
const mongoose = require("mongoose");
const { runUnscoped } = require("../utils/tenantContext");
const { customerDisplayName, realName } = require("../utils/displayName");

const User = require("../models/User");
const Customer = require("../models/Customer");
const Load = require("../models/Load");

// Matched case-insensitively and with surrounding space trimmed, because these
// were typed by hand in a few different shapes over the months.
const PLACEHOLDER = /^\s*(n\/a|na|null|undefined|-{1,2}|none)(\s+(n\/a|na|null|undefined|-{1,2}|none))*\s*$/i;

const isPlaceholder = (value) => PLACEHOLDER.test(String(value ?? ""));

const main = async () => {
  const apply = process.argv.includes("--apply");

  await mongoose.connect(process.env.MONGO_URI);

  await runUnscoped(async () => {
    // ── Users ────────────────────────────────────────────────────────────────
    const users = await User.find({ role: "client" })
      .select("firstName lastName email")
      .lean();

    const brokenUsers = users.filter(
      (u) => isPlaceholder(u.firstName) || isPlaceholder(u.lastName),
    );

    // One query rather than one per user: this runs against production.
    const profiles = await Customer.find({ user: { $in: brokenUsers.map((u) => u._id) } })
      .select("user customerName")
      .lean();

    const profileByUser = new Map(profiles.map((p) => [String(p.user), p]));

    console.log(`Users:  ${brokenUsers.length} of ${users.length} carry a placeholder name`);

    for (const user of brokenUsers) {
      const name = customerDisplayName({
        profile: profileByUser.get(String(user._id)),
        user,
      });

      // The first name carries the whole display name; the last is cleared
      // rather than left holding "N/A", since nothing splits it back apart.
      const update = {
        firstName: name,
        lastName: isPlaceholder(user.lastName) ? "" : user.lastName,
      };

      console.log(
        `   ${user.email}: "${user.firstName} ${user.lastName}" -> "${update.firstName}"`,
      );

      if (apply) await User.updateOne({ _id: user._id }, { $set: update });
    }

    // ── Loads ────────────────────────────────────────────────────────────────
    // `customerName` is frozen onto the load at booking, so fixing the user does
    // not fix the loads already on the board.
    const loads = await Load.find({}).select("loadId customerName customer").lean();

    const brokenLoads = loads.filter((l) => isPlaceholder(l.customerName));

    console.log(`\nLoads:  ${brokenLoads.length} of ${loads.length} carry a placeholder customer`);

    const loadUserIds = [...new Set(brokenLoads.map((l) => String(l.customer)).filter(Boolean))];

    const [loadUsers, loadProfiles] = await Promise.all([
      User.find({ _id: { $in: loadUserIds } }).select("firstName lastName email").lean(),
      Customer.find({ user: { $in: loadUserIds } }).select("user customerName").lean(),
    ]);

    const userById = new Map(loadUsers.map((u) => [String(u._id), u]));
    const loadProfileByUser = new Map(loadProfiles.map((p) => [String(p.user), p]));

    for (const load of brokenLoads) {
      const key = String(load.customer);
      const name = customerDisplayName({
        profile: loadProfileByUser.get(key),
        user: userById.get(key),
      });

      if (!name) {
        console.log(`   ${load.loadId}: no name to recover, leaving as-is`);
        continue;
      }

      console.log(`   ${load.loadId}: "${load.customerName}" -> "${name}"`);

      if (apply) await Load.updateOne({ _id: load._id }, { $set: { customerName: name } });
    }

    // ── Customer profiles ────────────────────────────────────────────────────
    const allProfiles = await Customer.find({}).select("customerName user").lean();
    const brokenProfiles = allProfiles.filter((p) => isPlaceholder(p.customerName));

    console.log(
      `\nProfiles: ${brokenProfiles.length} of ${allProfiles.length} carry a placeholder customerName`,
    );

    for (const profile of brokenProfiles) {
      const user = userById.get(String(profile.user));
      const name = realName(String(user?.email || "").split("@")[0]);
      if (!name) continue;

      console.log(`   ${profile._id}: "${profile.customerName}" -> "${name}"`);
      if (apply) await Customer.updateOne({ _id: profile._id }, { $set: { customerName: name } });
    }
  });

  console.log(
    apply ? "\nDone — repairs written." : "\nReport only. Re-run with --apply to write these.",
  );

  await mongoose.disconnect();
};

main().catch((error) => {
  console.error("backfillDisplayNames failed:", error.message);
  process.exit(1);
});
