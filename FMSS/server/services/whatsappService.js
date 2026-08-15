const WhatsAppConfig = require("../models/WhatsAppConfig");
const WhatsAppMessage = require("../models/WhatsAppMessage");
const WhatsAppOptOut = require("../models/WhatsAppOptOut");
const { runUnscoped } = require("../utils/tenantContext");
const {
  TEMPLATE_BY_KEY,
  buildParameters,
  renderPreview,
} = require("../config/whatsappTemplates");

// ─── WhatsApp sending ─────────────────────────────────────────────────────────
// Talks to Meta's official Cloud API over plain HTTPS — no SDK, because the one
// endpoint used here is a single POST and a dependency that wraps it is a
// dependency to keep patched.
//
// What this is NOT: whatsapp-web.js, Baileys, venom-bot or anything else that
// drives a real WhatsApp account through the web client. Those break Meta's
// terms and get the number permanently banned. The Cloud API is the only route
// that does not put the account at risk, which is the whole reason it was picked.
//
// Everything goes through `enqueue`. Nothing sends inline with a request.
// ─────────────────────────────────────────────────────────────────────────────

const GRAPH_HOST = "https://graph.facebook.com";

/**
 * Digits only, in the E.164 form Meta wants (country code, no +, no spaces).
 *
 * `defaultCountry` is applied to numbers that plainly lack one — a bare
 * ten-digit Indian mobile or US number typed into a form. Guessing is safer than
 * refusing here: the alternative is silently never messaging half the roster.
 */
const normalizePhone = (raw, defaultCountry = "91") => {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";

  // Already has a country code, or is long enough to plainly include one.
  if (digits.length > 10) return digits.replace(/^0+/, "");

  if (digits.length === 10) return `${defaultCountry}${digits}`;

  // Too short to be a real mobile — rejected rather than padded into somebody
  // else's number.
  return "";
};

/** True when this number has asked not to be messaged. */
const isOptedOut = async (phone) => {
  const row = await runUnscoped(() => WhatsAppOptOut.findOne({ phone }).lean());
  return Boolean(row);
};

/**
 * Put a message on the outbox.
 *
 * Never throws into the caller: a status update must not fail because the
 * messaging integration is misconfigured. Problems are recorded on the row.
 *
 * @returns the created row, or null when there was nothing sendable.
 */
const enqueue = async ({
  to,
  recipientName,
  recipientRole = "other",
  recipientRef,
  templateKey,
  variables = {},
  load,
  loadId,
  batchId,
  createdBy,
  locationId,
}) => {
  try {
    const template = TEMPLATE_BY_KEY.get(templateKey);
    if (!template) return null;

    const phone = normalizePhone(to);

    const base = {
      to: phone || String(to || "").replace(/\D/g, ""),
      recipientName,
      recipientRole,
      recipientRef,
      templateKey,
      templateName: template.name,
      language: template.language,
      variables,
      preview: renderPreview(templateKey, variables),
      load,
      loadId,
      batchId,
      createdBy,
      ...(locationId ? { locationId } : {}),
    };

    // Recorded as SKIPPED rather than dropped: "why did the driver not get the
    // message" needs an answer, and silence is not one.
    if (!phone) {
      return WhatsAppMessage.create({
        ...base,
        status: "SKIPPED",
        lastError: "No usable phone number for this recipient.",
      });
    }

    if (await isOptedOut(phone)) {
      return WhatsAppMessage.create({
        ...base,
        status: "SKIPPED",
        lastError: "This number has opted out of WhatsApp messages.",
      });
    }

    return WhatsAppMessage.create({ ...base, status: "QUEUED" });
  } catch (error) {
    console.error("WhatsApp enqueue failed:", error.message);
    return null;
  }
};

/** POST one template message to Meta. Resolves to a structured result. */
const postToMeta = async (config, message) => {
  const parameters = buildParameters(message.templateKey, message.variables || {});

  const body = {
    messaging_product: "whatsapp",
    to: message.to,
    type: "template",
    template: {
      name: message.templateName,
      language: { code: message.language || "en" },
      components: parameters?.length
        ? [{ type: "body", parameters }]
        : [],
    },
  };

  const url = `${GRAPH_HOST}/${config.apiVersion}/${config.phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = payload?.error || {};
    return {
      ok: false,
      // Meta's own codes decide whether another attempt is worth making: a bad
      // template name will fail identically forever, a rate limit will not.
      retryable: [4, 80007, 130429, 131048, 131056].includes(Number(error.code)) ||
        response.status >= 500,
      message: error.message
        ? `${error.message}${error.code ? ` (code ${error.code})` : ""}`
        : `Meta returned ${response.status}`,
    };
  }

  return { ok: true, providerMessageId: payload?.messages?.[0]?.id || "" };
};

const RETRY_BACKOFF_MINUTES = [1, 5, 20];
const MAX_ATTEMPTS = RETRY_BACKOFF_MINUTES.length + 1;

/**
 * Send what is due. Called on a timer — see utils/cron.js.
 *
 * Runs unscoped because the worker has no request and therefore no active
 * location, and the outbox spans every branch. It is one of the few places that
 * legitimately needs the whole table.
 */
const drainQueue = async ({ limit } = {}) =>
  runUnscoped(async () => {
    const config = await WhatsAppConfig.getGlobalConfig();

    if (!config.isEnabled) return { sent: 0, failed: 0, skipped: 0, reason: "disabled" };

    const configured = config.phoneNumberId && config.accessToken;
    if (!configured && !config.testMode) {
      return { sent: 0, failed: 0, skipped: 0, reason: "not configured" };
    }

    const now = new Date();
    const due = await WhatsAppMessage.find({
      status: "QUEUED",
      $or: [{ nextAttemptAt: { $lte: now } }, { nextAttemptAt: null }],
    })
      .sort({ createdAt: 1 })
      .limit(limit || config.perMinuteLimit)
      .exec();

    let sent = 0;
    let failed = 0;

    for (const message of due) {
      // Test mode renders and records without touching a real number, so the
      // whole path can be exercised before a number is verified.
      if (config.testMode || !configured) {
        message.status = "SIMULATED";
        message.sentAt = new Date();
        message.lastError = "";
        await message.save();
        sent += 1;
        continue;
      }

      message.status = "SENDING";
      message.attempts += 1;
      await message.save();

      let result;
      try {
        result = await postToMeta(config, message);
      } catch (error) {
        result = { ok: false, retryable: true, message: error.message };
      }

      if (result.ok) {
        message.status = "SENT";
        message.providerMessageId = result.providerMessageId;
        message.sentAt = new Date();
        message.lastError = "";
        sent += 1;
      } else if (result.retryable && message.attempts < MAX_ATTEMPTS) {
        const wait = RETRY_BACKOFF_MINUTES[message.attempts - 1] ?? 20;
        message.status = "QUEUED";
        message.nextAttemptAt = new Date(Date.now() + wait * 60 * 1000);
        message.lastError = result.message;
      } else {
        message.status = "FAILED";
        message.lastError = result.message;
        failed += 1;
      }

      await message.save();
    }

    return { sent, failed, skipped: 0, considered: due.length };
  });

module.exports = {
  normalizePhone,
  isOptedOut,
  enqueue,
  drainQueue,
};
