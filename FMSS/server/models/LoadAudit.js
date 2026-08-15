const mongoose = require("mongoose");
const tenantScope = require("../plugins/tenantScope");

// ─── Load audit trail ─────────────────────────────────────────────────────────
// One document per thing that happened to a load: a field edited, a status
// moved, a carrier assigned, a note written, a follow-up raised.
//
// A separate collection rather than an array on the Load, for two reasons. The
// trail grows without bound — every edit, every note, over a load's whole life —
// and the Load document is read on every board query, every dispatch screen and
// every dashboard tile, so growing it costs on all of those. And an append-only
// log wants its own index (`load` + `createdAt`) that a subdocument array cannot
// have.
//
// Entries are never edited or deleted in the ordinary course. A note that was
// wrong is corrected by writing another one — a trail that can be rewritten is
// not evidence of anything, which defeats the point of keeping it.
// ─────────────────────────────────────────────────────────────────────────────

// What sort of thing happened. Kept coarse deliberately: this drives the filter
// chips and the icon on the timeline, and twenty categories would be a list
// nobody reads rather than a filter anybody uses.
const ENTRY_KINDS = [
  "CREATED",
  "FIELD_CHANGE", // an ordinary edit to the load's details
  "STATUS", // verification or transport status moved
  "ASSIGNMENT", // carrier assigned, released, re-bid
  "FINANCIAL", // receivables, payables, payroll
  "DOCUMENT", // paperwork uploaded or generated
  "NOTE", // somebody wrote something
  "FOLLOW_UP", // a note with something owed on it
  "COMMUNICATION", // an email or message sent out
  "SYSTEM", // the cron, an automatic award
];

// Who may read an entry.
//
// INTERNAL is the default for anything staff write, because the whole point of a
// dispatcher's note is that it is candid — "customer is difficult about
// detention, do not promise anything" is useful precisely because the customer
// will not read it. SHARED is the deliberate act of saying something to the
// client or carrier.
const VISIBILITIES = ["INTERNAL", "SHARED"];

const changeSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    // The human name — "Last Free Date", not "lastFreeDate". Resolved when the
    // entry is written rather than on read, so a later rename of a label does
    // not silently rewrite what the trail says happened.
    label: String,
    from: mongoose.Schema.Types.Mixed,
    to: mongoose.Schema.Types.Mixed,
  },
  { _id: false },
);

const loadAuditSchema = new mongoose.Schema(
  {
    load: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Load",
      required: true,
      index: true,
    },
    // Denormalised so the trail can be read, filtered and exported without
    // joining back to the load for its human-readable id.
    loadId: { type: String, required: true, index: true },

    kind: { type: String, enum: ENTRY_KINDS, required: true, index: true },

    // A stable machine key — "load.status_changed", "accounting.receivables_saved".
    // Filters and any future automation key off this rather than off the prose.
    action: { type: String, required: true },

    // One sentence, written at the time, in the past tense: "Moved to IN_TRANSIT",
    // "Assigned to Swift Haulage". Stored rather than generated on read so the
    // trail still reads correctly after the code that produced it changes.
    summary: { type: String, required: true },

    // Free text a person typed — the note itself, or the reason for a change.
    body: { type: String, trim: true },

    changes: [changeSchema],

    // ── Who ──────────────────────────────────────────────────────────────────
    // Name and role are denormalised alongside the ref: an audit trail has to
    // stay readable after somebody leaves and their account is deactivated, and
    // "changed by (deleted user)" is not accountability.
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    actorName: String,
    actorRole: String,

    visibility: {
      type: String,
      enum: VISIBILITIES,
      default: "INTERNAL",
      index: true,
    },

    // ── Follow-ups ───────────────────────────────────────────────────────────
    // A note with something owed on it. Present only on FOLLOW_UP entries; the
    // resolution is recorded in place rather than as a second entry, because
    // "is this still outstanding" has to be answerable without replaying the
    // whole trail.
    followUp: {
      dueAt: Date,
      assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      assignedToName: String,
      resolvedAt: Date,
      resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      resolvedByName: String,
      resolutionNote: String,
    },

    // Where it came from — web, the driver app, the cron. Useful when a status
    // is disputed and the question is whether a person or a job did it.
    source: {
      type: String,
      enum: ["web", "mobile", "system", "api"],
      default: "web",
    },

    // Recorded on anything a person did, so a disputed change can be answered
    // with where it came from.
    ip: String,
  },
  { timestamps: true },
);

// The timeline query: one load, newest first. Every read of this collection is
// this shape, so it gets the compound index.
loadAuditSchema.index({ load: 1, createdAt: -1 });

// The "what is outstanding" query, across loads.
loadAuditSchema.index({ kind: 1, "followUp.resolvedAt": 1, "followUp.dueAt": 1 });

// Per-location data — scoping is enforced centrally, see plugins/tenantScope.js.
loadAuditSchema.plugin(tenantScope, { modelName: "LoadAudit" });

loadAuditSchema.statics.ENTRY_KINDS = ENTRY_KINDS;
loadAuditSchema.statics.VISIBILITIES = VISIBILITIES;

module.exports = mongoose.model("LoadAudit", loadAuditSchema);
