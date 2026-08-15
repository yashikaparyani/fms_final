// Re-render already-signed agreements onto the real fifteen-page documents.
//
//   node scripts/rebuildSignedAgreements.js                          # report
//   node scripts/rebuildSignedAgreements.js --apply                  # rewrite
//   node scripts/rebuildSignedAgreements.js --email a@b.com --apply  # one carrier
//
// Agreements signed before the move to overlaying the counterparty's own PDF
// carry a one-page execution record instead of the contract. The signature and
// everything it attests to are unchanged — what is rebuilt is only the paper it
// is printed on, from the values stored at signing.
//
// Nothing about the signature is re-derived: signedName, signedAt, the
// initials and the acknowledgements all come off the stored record, so the
// rebuilt document says exactly what the carrier agreed to and when. The old
// file is left on disk rather than deleted, so the previous rendering can still
// be produced if anyone asks what was downloaded before.

require("dotenv").config();
const fs = require("fs");
const mongoose = require("mongoose");
const { runUnscoped } = require("../utils/tenantContext");

const CarrierOnboarding = require("../models/CarrierOnboarding");
const FleetOwner = require("../models/FleetOwner");
const User = require("../models/User");
const { AGREEMENT_BY_KEY } = require("../config/carrierAgreements");
const { buildFilledAgreement } = require("../services/agreementOverlayService");

const run = async () => {
  const apply = process.argv.includes("--apply");
  const emailFlag = process.argv.indexOf("--email");
  const email = emailFlag === -1 ? null : String(process.argv[emailFlag + 1] || "").toLowerCase();

  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGO_URI is not set — nothing to connect to.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(apply ? "Applying changes.\n" : "Dry run — pass --apply to write.\n");

  await runUnscoped(async () => {
    let carrierFilter = {};

    if (email) {
      const user = await User.findOne({ email }).lean();
      if (!user) {
        console.error(`No user with email ${email}.`);
        process.exitCode = 1;
        return;
      }
      const carrier = await FleetOwner.findOne({ userId: user._id }).lean();
      if (!carrier) {
        console.error(`No carrier record linked to ${email}.`);
        process.exitCode = 1;
        return;
      }
      carrierFilter = { fleetOwner: carrier._id };
      console.log(`Carrier: ${carrier.carrierName} (${carrier.fleetOwnerCode})\n`);
    }

    const records = await CarrierOnboarding.find(carrierFilter);
    let rebuilt = 0;

    for (const onboarding of records) {
      const signedAgreements = (onboarding.agreements || []).filter((a) => a.signedAt);
      if (!signedAgreements.length) continue;

      const carrier = await FleetOwner.findById(onboarding.fleetOwner)
        .select("carrierName fleetOwnerCode")
        .lean();
      if (!carrier) continue;

      for (const signed of signedAgreements) {
        const title = AGREEMENT_BY_KEY.get(signed.key)?.title || signed.key;
        const before = signed.document?.filePath;
        const beforeSize = before && fs.existsSync(before) ? fs.statSync(before).size : 0;

        console.log(`  ${carrier.fleetOwnerCode || carrier.carrierName} — ${title}`);
        console.log(`      signed ${new Date(signed.signedAt).toISOString()} by ${signed.signedName}`);
        console.log(`      current: ${beforeSize ? `${beforeSize} bytes` : "missing"}`);

        if (!apply) {
          rebuilt += 1;
          continue;
        }

        const document = await buildFilledAgreement({
          agreementKey: signed.key,
          profile: onboarding.profile,
          signed,
          equipment: onboarding.equipment || [],
          carrierCode: carrier.fleetOwnerCode || String(carrier._id).slice(-6),
        });

        signed.document = {
          fileName: document.fileName,
          originalName: `${title}.pdf`,
          filePath: document.filePath,
          mimeType: "application/pdf",
          size: fs.statSync(document.filePath).size,
          uploadedAt: new Date(),
          // Keep whoever the record already credited; this is a re-render, not
          // a new act by whoever happened to run the script.
          uploadedBy: signed.document?.uploadedBy,
        };

        console.log(`      rebuilt: ${signed.document.size} bytes -> ${document.fileName}`);
        rebuilt += 1;
      }

      if (apply) {
        onboarding.markModified("agreements");
        await onboarding.save();
      }
    }

    console.log(`\n${rebuilt} agreement(s) ${apply ? "rebuilt" : "would be rebuilt"}.`);
  });

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error("Rebuild failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
