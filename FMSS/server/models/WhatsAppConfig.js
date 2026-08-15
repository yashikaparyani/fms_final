const mongoose = require("mongoose");

// ─── WhatsApp Cloud API settings ──────────────────────────────────────────────
// One row, edited from the settings screen — the same shape EmailConfig uses, so
// credentials live with the install rather than in a .env somebody has to redeploy
// to change.
//
// This talks to Meta's official Cloud API. It deliberately does NOT drive a real
// WhatsApp account through the web client the way whatsapp-web.js and Baileys do:
// those violate Meta's terms and get the number permanently banned, which is a
// far worse outcome than not having the integration.
// ─────────────────────────────────────────────────────────────────────────────

const whatsAppConfigSchema = new mongoose.Schema(
  {
    // Meta's Graph API version, e.g. "v21.0". Pinned rather than tracking latest:
    // a version bump can change response shapes, and that should be a decision.
    apiVersion: { type: String, default: "v21.0", trim: true },

    // The WhatsApp phone number the messages come from — Meta's numeric id for
    // it, not the phone number itself.
    phoneNumberId: { type: String, default: "", trim: true },

    // Long-lived system user token. Never returned to the browser — see the
    // controller, which reports only whether one is set.
    accessToken: { type: String, default: "", select: false },

    // Business account id, needed to read the template list back from Meta.
    businessAccountId: { type: String, default: "", trim: true },

    // Verifies inbound webhook calls are really from Meta.
    webhookVerifyToken: { type: String, default: "", select: false },

    isEnabled: { type: Boolean, default: false },

    // Nothing is sent to a real number while this is on — messages are queued,
    // marked SIMULATED and logged. Lets the whole flow be exercised before a
    // number is verified, and is the safe default.
    testMode: { type: Boolean, default: true },

    // Every send is checked against this. Meta throttles per number and a burst
    // that trips the quality rating costs sending capacity for days.
    perMinuteLimit: { type: Number, default: 20, min: 1, max: 600 },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

whatsAppConfigSchema.statics.getGlobalConfig = async function () {
  // `+accessToken` because the field is select:false — the sender needs it even
  // though no read path should ever hand it out.
  const existing = await this.findOne().select("+accessToken +webhookVerifyToken");
  if (existing) return existing;
  return this.create({});
};

module.exports = mongoose.model("WhatsAppConfig", whatsAppConfigSchema);
