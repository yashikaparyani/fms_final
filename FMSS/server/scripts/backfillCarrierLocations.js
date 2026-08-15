// Give carrier and driver accounts the location membership they need to sign in.
//
//   node scripts/backfillCarrierLocations.js                        # report only
//   node scripts/backfillCarrierLocations.js --apply                # write
//   node scripts/backfillCarrierLocations.js --location LA --apply  # + adopt
//
// `--location <CODE>` also files carriers that have NO location of their own —
// records predating the move to multiple locations. It is required rather than
// defaulted because putting a carrier in the wrong branch is not a cosmetic
// mistake: it decides whose work they appear in.
//
// Why this exists: a user with no `locations` fails resolveLocation on every
// request (403 NO_LOCATION in middleware/location.js), so the account
// authenticates and then cannot load a single screen. Carrier accounts created
// before the move to multiple locations — and any created by the fleet-owner
// path before it started stamping membership — are in exactly that state.
//
// The location is taken from the carrier's own FleetOwner record rather than
// guessed, so each account lands in the branch its work is actually filed under.
// Drivers inherit from the carrier they belong to.
//
// Idempotent: an account that already has locations is left alone.

require("dotenv").config();
const mongoose = require("mongoose");
const { runUnscoped } = require("../utils/tenantContext");

const User = require("../models/User");
const FleetOwner = require("../models/FleetOwner");
const Driver = require("../models/Driver");
const Branch = require("../models/Branch");

const run = async () => {
  const apply = process.argv.includes("--apply");
  const flag = process.argv.indexOf("--location");
  const wantedCode = flag === -1 ? null : String(process.argv[flag + 1] || "").toUpperCase();

  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGO_URI is not set — nothing to connect to.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(apply ? "Applying changes.\n" : "Dry run — pass --apply to write.\n");

  await runUnscoped(async () => {
    let adopt = null;
    if (wantedCode) {
      adopt = await Branch.findOne({ code: wantedCode, active: true }).lean();
      if (!adopt) {
        const codes = (await Branch.find({ active: true }).select("code name").lean())
          .map((b) => `${b.code} (${b.name})`)
          .join(", ");
        console.error(`No active location with code ${wantedCode}. Available: ${codes}`);
        process.exitCode = 1;
        return;
      }
      console.log(`Carriers with no location will be filed under ${adopt.code} — ${adopt.name}.\n`);
    }

    // Carrier records predating multi-location carry no locationId of their own,
    // so their users have nothing to inherit. Stamp the record first.
    if (adopt) {
      const orphanCarriers = await FleetOwner.find({
        $or: [{ locationId: null }, { locationId: { $exists: false } }],
      });
      for (const carrier of orphanCarriers) {
        console.log(`  carrier ${(carrier.carrierName || "?").padEnd(28)} -> ${adopt.code}`);
        if (apply) {
          carrier.locationId = adopt._id;
          await carrier.save();
        }
      }
      if (orphanCarriers.length) {
        console.log(
          `  ${orphanCarriers.length} carrier record(s) ${apply ? "filed" : "would be filed"}.\n`,
        );
      }
    }

    const stranded = await User.find({
      role: { $in: ["fleetOwner", "driver"] },
      isDeleted: { $ne: true },
      $or: [{ locations: { $size: 0 } }, { locations: { $exists: false } }],
    });

    if (!stranded.length) {
      console.log("Every carrier and driver account already has a location.");
      return;
    }

    let fixed = 0;
    const unresolved = [];

    for (const user of stranded) {
      let locationId = null;

      if (user.role === "fleetOwner") {
        const carrier = await FleetOwner.findOne({ userId: user._id }).select("locationId").lean();
        locationId = carrier?.locationId || null;
      } else {
        // A driver belongs to a carrier; the carrier's branch is the driver's.
        const driver = await Driver.findOne({ userId: user._id }).select("fleetOwner locationId").lean();
        locationId = driver?.locationId || null;
        if (!locationId && driver?.fleetOwner) {
          const carrier = await FleetOwner.findById(driver.fleetOwner).select("locationId").lean();
          locationId = carrier?.locationId || null;
        }
      }

      if (!locationId && adopt) locationId = adopt._id;

      if (!locationId) {
        unresolved.push(user);
        continue;
      }

      console.log(`  ${user.email.padEnd(32)} -> ${locationId}`);
      if (apply) {
        user.locations = [locationId];
        user.defaultLocation = locationId;
        await user.save();
      }
      fixed += 1;
    }

    console.log(`\n${fixed} account(s) ${apply ? "updated" : "would be updated"}.`);

    if (unresolved.length) {
      // Named rather than silently defaulted: putting somebody in an arbitrary
      // branch is how a carrier ends up seeing the wrong location's work.
      console.log(
        `\n${unresolved.length} account(s) have no carrier record to take a location from —` +
          ` assign these by hand from the Fleet Owners screen:`,
      );
      unresolved.forEach((u) => console.log(`  ${u.email} (${u.role})`));
    }
  });

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error("Backfill failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
