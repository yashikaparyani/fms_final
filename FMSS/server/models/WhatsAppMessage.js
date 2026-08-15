const mongoose = require("mongoose");
const tenantScope = require("../plugins/tenantScope");
const { TEMPLATE_KEYS } = require("../config/whatsappTemplates");

// ─── WhatsApp outbox ──────────────────────────────────────────────────────────
// Every message is written here first and sent by the queue worker, never inline
// with the request that caused it. Three reasons, all learned the hard way with
// outbound messaging:
//
//   1. Meta rate-limits per number, and a burst that trips the quality rating
//      costs sending capacity for days. A queue is where the throttle lives.
//   2. A status update should not fail because Meta is slow. Enqueueing takes a
//      millisecond; delivery is somebody else's problem.
//   3. "Did the driver get told?" is a real question during a dispute. The row
//      survives with its status, its error and Meta's own message id.
//
// Tenant-scoped: a location's operators should see their own traffic, not every
// branch's.
// ─────────────────────────────────────────────────────────────────────────────

const STATUSES = [
  "QUEUED",
  "SENDING",
  "SENT", // handed to Meta
  "DELIVERED", // Meta says it reached the handset
  "READ",
  "FAILED",
  "SKIPPED", // opted out, no number, or a duplicate
  "SIMULATED", // test mode — rendered and logged, never sent
];

const whatsAppMessageSchema = new mongoose.Schema(
  {
    // E.164 digits, no punctuation. Normalised on the way in so the same person
    // is not two rows because somebody typed a space.
    //
    // Not required: a recipient with no usable number still gets a row, marked
    // SKIPPED. "Why was this driver never told?" needs an answer on the screen,
    // and refusing to save the evidence is not one.
    to: { type: String, default: "", trim: true, index: true },

    // Who this is, for the panel's history. Free-form because a recipient can be
    // a driver, a carrier contact, a customer or a staff member.
    recipientName: { type: String, trim: true },
    recipientRole: {
      type: String,
      enum: ["client", "fleetOwner", "driver", "staff", "admin", "other"],
      default: "other",
    },
    recipientRef: { type: mongoose.Schema.Types.ObjectId },

    templateKey: { type: String, enum: TEMPLATE_KEYS, required: true },
    // Snapshotted rather than looked up at send time: a template renamed in Meta
    // later must not silently change what a historical row claims was sent.
    templateName: { type: String, trim: true },
    language: { type: String, default: "en", trim: true },

    variables: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    // What the recipient would read. Stored so the history is legible without
    // re-rendering against a template that may since have changed.
    preview: { type: String, trim: true },

    load: { type: mongoose.Schema.Types.ObjectId, ref: "Load" },
    loadId: { type: String, trim: true, index: true },

    status: { type: String, enum: STATUSES, default: "QUEUED", index: true },

    // Meta's id, for matching delivery webhooks back to this row.
    providerMessageId: { type: String, trim: true, index: true },

    attempts: { type: Number, default: 0 },
    lastError: { type: String, trim: true },
    // Set on a retryable failure; the worker ignores rows until this passes.
    nextAttemptAt: { type: Date },

    sentAt: Date,
    deliveredAt: Date,
    readAt: Date,

    // A broadcast's rows share this, so the panel can report "38 of 40 delivered"
    // rather than making the operator count.
    batchId: { type: String, trim: true, index: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// The worker's query: due, not finished, oldest first.
whatsAppMessageSchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });

whatsAppMessageSchema.plugin(tenantScope, { modelName: "WhatsAppMessage" });

module.exports = mongoose.model("WhatsAppMessage", whatsAppMessageSchema);
