const mongoose = require("mongoose");

// ─── Branch — the tenant ──────────────────────────────────────────────────────
// One operating location of the business. Every load, customer, carrier and
// address belongs to exactly one branch, and staff only ever see the branches
// they are a member of.
//
// Called "Branch" in code, shown as "Location" in the UI: `LocationMaster`
// already owns the word Location for the state/city/zip geography lookup, and
// two different things sharing a name is how the wrong one gets queried.
// ─────────────────────────────────────────────────────────────────────────────

const branchSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Location name is required"],
      trim: true,
    },

    // Goes into every ID this branch issues — NY-LD-0001, NY-FO-0001 — so it is
    // short, uppercase, and immutable once loads exist under it. Changing a code
    // later would orphan every ID already handed out.
    code: {
      type: String,
      required: [true, "Location code is required"],
      trim: true,
      uppercase: true,
      unique: true,
      minlength: [2, "Location code must be 2-5 characters"],
      maxlength: [5, "Location code must be 2-5 characters"],
      match: [/^[A-Z0-9]+$/, "Location code may only contain letters and numbers"],
    },

    address: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    zip: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    // Printed on the letterhead of every invoice this branch issues.
    website: { type: String, trim: true },

    // Deactivated rather than deleted — a branch's loads must stay readable.
    active: { type: Boolean, default: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Branch", branchSchema);
