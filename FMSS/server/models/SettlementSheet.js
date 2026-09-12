const mongoose = require("mongoose");
const tenantScope = require("../plugins/tenantScope");

// ─── Settlement sheet ─────────────────────────────────────────────────────────
// The two figures a driver's settlement sheet carries that are not on any
// invoice: what was deducted from the run, and the cheque it was paid by.
//
// ── Why they are not on the bills ────────────────────────────────────────────
// A deduction is not a line on any one load. It is taken off the whole run —
// an advance being recovered, an escrow contribution, damage being recouped —
// and pushing it onto one of the four loads on the sheet would make that load's
// settlement wrong so the total could be right. The cheque number has the same
// shape: it pays the sheet, not a load.
//
// ── Why the sheet is a document at all ───────────────────────────────────────
// Because these figures have to survive a reprint. A driver rings in March
// asking what was taken off in January, and "whatever the report recomputes
// today" is not an answer. So the run — this driver, these dates — is a record,
// and the sheet prints the same way every time it is opened.
//
// Everything else on the sheet is still derived: the loads, the amounts, what
// has been paid. Only what somebody typed is stored.
// ─────────────────────────────────────────────────────────────────────────────

const settlementSheetSchema = new mongoose.Schema(
  {
    // Who the run is for. Snapshotted like an invoice's party, so a driver who
    // leaves does not empty out last year's sheets.
    party: {
      kind: {
        type: String,
        enum: ["CARRIER", "DRIVER"],
        required: true,
      },
      id: { type: mongoose.Schema.Types.ObjectId, index: true },
      name: { type: String, trim: true },
      code: { type: String, trim: true },
    },

    // The run's window. Calendar dates at UTC midnight — see utils/dates.js —
    // because the sheet header prints them and they must read as the same two
    // days to everybody.
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },

    // Taken off the run as a whole. Positive: it is an amount deducted, not a
    // signed adjustment, because "-50" and "50" meaning the same thing is how a
    // deduction eventually gets added on instead.
    deduction: { type: Number, default: 0, min: 0 },
    deductionNote: { type: String, trim: true },

    // The cheque the run was paid by. Free text rather than a payment
    // reference: the sheet is often written up before the payments are entered,
    // and refusing to record the number until then would just mean it is never
    // recorded.
    checkNumber: { type: String, trim: true },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// One sheet per payee per window. Without this, two clerks opening the same run
// write two sheets and the second one silently wins on read.
settlementSheetSchema.index(
  { "party.id": 1, fromDate: 1, toDate: 1 },
  { unique: true },
);

// Per-location data — scoping is enforced centrally, see plugins/tenantScope.js.
settlementSheetSchema.plugin(tenantScope, { modelName: "SettlementSheet" });

module.exports = mongoose.model("SettlementSheet", settlementSheetSchema);
