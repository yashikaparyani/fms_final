// Move street turn partners' short code into the SCAC field.
//
//   node scripts/backfillPartnerScac.js            # report
//   node scripts/backfillPartnerScac.js --apply    # write
//
// The partner master carried two near-identical fields: `code`, an internal
// short code, and `scac`, the Standard Carrier Alpha Code printed on the
// transfer agreement. Only `code` was ever on screen, so that is where people
// typed the SCAC — and `scac`, the one the agreement actually reads, stayed
// empty and printed blank.
//
// The form now edits `scac` directly (see client StreetTurnPartners.jsx). This
// carries the existing values across so partners entered before that change do
// not look like they lost their code.
//
// Only fills a blank `scac`. A partner who somehow has both keeps the one that
// was entered against the field the agreement uses — this is a backfill, not a
// reconciliation, and overwriting a real SCAC with an internal code would be
// the one genuinely destructive thing it could do.

require("dotenv").config();
const mongoose = require("mongoose");
const { runUnscoped } = require("../utils/tenantContext");

const StreetTurnPartner = require("../models/StreetTurnPartner");

const run = async () => {
  const apply = process.argv.includes("--apply");

  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGO_URI is not set — nothing to connect to.");
    process.exit(1);
  }

  await mongoose.connect(uri);

  try {
    await runUnscoped(async () => {
      const partners = await StreetTurnPartner.find({}).lean();

      const needing = partners.filter(
        (p) => String(p.code || "").trim() && !String(p.scac || "").trim(),
      );

      console.log(
        `${partners.length} partner(s); ${needing.length} with a code and no SCAC.`,
      );

      for (const partner of needing) {
        const code = String(partner.code).trim().toUpperCase();
        console.log(`  ${partner.name}: scac ← "${code}"`);

        if (apply) {
          await StreetTurnPartner.updateOne(
            { _id: partner._id },
            { $set: { scac: code } },
          );
        }
      }

      if (!apply && needing.length) {
        console.log("\nDry run. Re-run with --apply to write these.");
      }
    });
  } catch (error) {
    console.error("Backfill failed:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

run();
