/**
 * One-off migration: fold the old delivery modality onto the Drop / Pick pair.
 *
 *   deliveryType "ROUNDED"  → "SINGLE",  singleType → "Drop"
 *   singleType   "Delivery" → "Drop"     (a delivery is a drop-off)
 *   singleType   "Pick Up"  → "Pick"
 *
 * A rounded trip and a Drop are the same two-container move, which is why the
 * Rounded Trip option was removed from the load form.
 *
 * Safe to run more than once — every update is keyed on the old value, so a
 * second run matches nothing.
 *
 * Usage (from the server directory):
 *   node scripts/migrateLoadMoveTypes.js --dry-run   # report only, no writes
 *   node scripts/migrateLoadMoveTypes.js
 *
 * Reads MONGO_URI from the environment, same as the app.
 */
const mongoose = require("mongoose");
require("dotenv").config();

const Load = require("../models/Load");

const MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/fms?directConnection=true";

const dryRun = process.argv.includes("--dry-run");

(async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log(`Connected to ${MONGO_URI}`);
    if (dryRun) console.log("DRY RUN — nothing will be written.\n");

    // A rounded trip becomes a Drop. Its stored singleType was ignored by the
    // old form (the dropdown was hidden), so it is overwritten rather than read.
    const roundedFilter = { deliveryType: "ROUNDED" };
    // Loads already marked SINGLE keep their own type, only renamed.
    const deliveryFilter = { deliveryType: { $ne: "ROUNDED" }, singleType: "Delivery" };
    const pickUpFilter = { deliveryType: { $ne: "ROUNDED" }, singleType: "Pick Up" };

    const [rounded, delivery, pickUp] = await Promise.all([
      Load.countDocuments(roundedFilter),
      Load.countDocuments(deliveryFilter),
      Load.countDocuments(pickUpFilter),
    ]);

    console.log(`ROUNDED  → SINGLE + Drop : ${rounded}`);
    console.log(`Delivery → Drop          : ${delivery}`);
    console.log(`Pick Up  → Pick          : ${pickUp}`);

    // Heads-up: a Drop now requires two container and two chassis numbers in
    // the load form, so these loads will ask for the missing numbers the next
    // time somebody edits them.
    // Both halves are $or clauses, so they have to be combined under $and —
    // two $or keys in one object would silently drop the first.
    const dropsMissingNumbers = await Load.countDocuments({
      $and: [
        { $or: [roundedFilter, deliveryFilter] },
        {
          $or: [
            { containerNo: { $in: [null, ""] } },
            { containerNo2: { $in: [null, ""] } },
            { chassisNo: { $in: [null, ""] } },
            { chassisNo2: { $in: [null, ""] } },
          ],
        },
      ],
    });

    if (dropsMissingNumbers) {
      console.log(
        `\n⚠  ${dropsMissingNumbers} load(s) become a Drop without a full set of` +
          ` container/chassis numbers.\n   They stay readable, but the edit form` +
          ` will require the missing numbers before it saves.`,
      );
    }

    if (dryRun) {
      await mongoose.disconnect();
      return;
    }

    const results = await Promise.all([
      Load.updateMany(roundedFilter, {
        $set: { deliveryType: "SINGLE", singleType: "Drop" },
      }),
      Load.updateMany(deliveryFilter, { $set: { singleType: "Drop" } }),
      Load.updateMany(pickUpFilter, { $set: { singleType: "Pick" } }),
    ]);

    const modified = results.reduce((sum, r) => sum + (r.modifiedCount || 0), 0);
    console.log(`\nDone — ${modified} load(s) updated.`);

    await mongoose.disconnect();
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
})();
