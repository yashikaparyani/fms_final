const crypto = require("crypto");
const mongoose = require("mongoose");

const WhatsAppConfig = require("../models/WhatsAppConfig");
const WhatsAppMessage = require("../models/WhatsAppMessage");
const WhatsAppOptOut = require("../models/WhatsAppOptOut");
const Driver = require("../models/Driver");
const FleetOwner = require("../models/FleetOwner");
const Customer = require("../models/Customer");
const Load = require("../models/Load");
const { runUnscoped } = require("../utils/tenantContext");
const { accountPersonFor } = require("../utils/carrierAccount");
const { catalog, TEMPLATE_BY_KEY, renderPreview } = require("../config/whatsappTemplates");
const { enqueue, drainQueue, normalizePhone } = require("../services/whatsappService");

// ─── /api/whatsapp ────────────────────────────────────────────────────────────
// Settings, the template catalog, the recipient book, and the panel that sends.
// ─────────────────────────────────────────────────────────────────────────────

const trimmed = (value) => String(value ?? "").trim();

// @desc    Current settings (never the token itself)
// @route   GET /api/whatsapp/config
// @access  Private (admin)
const getConfig = async (req, res) => {
  try {
    const config = await WhatsAppConfig.getGlobalConfig();

    res.json({
      apiVersion: config.apiVersion,
      phoneNumberId: config.phoneNumberId,
      businessAccountId: config.businessAccountId,
      isEnabled: config.isEnabled,
      testMode: config.testMode,
      perMinuteLimit: config.perMinuteLimit,
      // The secrets are reported as present or absent, never returned. A token
      // echoed back to the browser is a token in somebody's browser history.
      hasAccessToken: Boolean(config.accessToken),
      hasWebhookVerifyToken: Boolean(config.webhookVerifyToken),
      updatedAt: config.updatedAt,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update settings
// @route   PUT /api/whatsapp/config
// @access  Private (admin)
const updateConfig = async (req, res) => {
  try {
    const config = await WhatsAppConfig.getGlobalConfig();

    for (const field of ["apiVersion", "phoneNumberId", "businessAccountId"]) {
      if (req.body[field] !== undefined) config[field] = trimmed(req.body[field]);
    }

    // Blank means "leave it alone", so saving the form without retyping the
    // token does not wipe it.
    if (trimmed(req.body.accessToken)) config.accessToken = trimmed(req.body.accessToken);
    if (trimmed(req.body.webhookVerifyToken)) {
      config.webhookVerifyToken = trimmed(req.body.webhookVerifyToken);
    }

    if (req.body.testMode !== undefined) config.testMode = !!req.body.testMode;
    if (req.body.perMinuteLimit !== undefined) {
      config.perMinuteLimit = Number(req.body.perMinuteLimit) || 20;
    }

    if (req.body.isEnabled !== undefined) {
      const enabling = !!req.body.isEnabled;
      // Refused rather than accepted-and-broken: enabling with nothing to send
      // through queues messages that can only fail.
      if (enabling && !config.testMode && !(config.phoneNumberId && config.accessToken)) {
        return res.status(400).json({
          message:
            "Add the phone number id and access token before turning live sending on, or leave test mode enabled.",
        });
      }
      config.isEnabled = enabling;
    }

    config.updatedBy = req.user._id;
    await config.save();

    return getConfig(req, res);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    The approved template catalog
// @route   GET /api/whatsapp/templates
// @access  Private (staff, admin)
const getTemplates = async (req, res) => {
  res.json(catalog());
};

// @desc    Who can be messaged, grouped by kind
// @route   GET /api/whatsapp/recipients
// @access  Private (staff, admin)
//
// Built from the directory rather than typed in: a broadcast to "all drivers"
// has to mean the roster, not whatever numbers somebody pasted.
const getRecipients = async (req, res) => {
  try {
    const [drivers, carriers, customers] = await Promise.all([
      Driver.find({ active: { $ne: false } }).select("name phone driverCode").lean(),
      FleetOwner.find({ active: { $ne: false } })
        .select("carrierName phone fleetOwnerCode contactPersons")
        .lean(),
      Customer.find().select("customerName contact").lean(),
    ]);

    const optedOut = new Set(
      (await runUnscoped(() => WhatsAppOptOut.find().select("phone").lean())).map(
        (o) => o.phone,
      ),
    );

    const shape = (list) =>
      list
        .map((r) => ({ ...r, phone: normalizePhone(r.phone) }))
        .filter((r) => r.phone)
        .map((r) => ({ ...r, optedOut: optedOut.has(r.phone) }));

    res.json({
      drivers: shape(
        drivers.map((d) => ({
          id: d._id,
          name: d.name,
          phone: d.phone,
          code: d.driverCode,
        })),
      ),
      carriers: shape(
        carriers.map((c) => {
          const person = accountPersonFor(c);
          return {
            id: c._id,
            // The account person is who we talk to at a carrier — see
            // utils/carrierAccount.js.
            name: person?.name ? `${c.carrierName} · ${person.name}` : c.carrierName,
            phone: person?.phone || c.phone,
            code: c.fleetOwnerCode,
          };
        }),
      ),
      customers: shape(
        customers.map((c) => ({
          id: c._id,
          name: c.customerName,
          phone: c.contact?.phone,
        })),
      ),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Preview what a template renders to
// @route   POST /api/whatsapp/preview
// @access  Private (staff, admin)
const previewTemplate = async (req, res) => {
  const { templateKey, variables } = req.body;

  if (!TEMPLATE_BY_KEY.has(templateKey)) {
    return res.status(400).json({ message: "Unknown template." });
  }

  res.json({ preview: renderPreview(templateKey, variables || {}) });
};

// @desc    Send a template to one or many recipients
// @route   POST /api/whatsapp/send
// @access  Private (staff, admin)
//
// Queued, not sent inline — see services/whatsappService.js. The response says
// what was accepted, not what was delivered; delivery is reported on the row.
const sendMessages = async (req, res) => {
  try {
    const { templateKey, variables = {}, recipients = [], loadId } = req.body;

    const template = TEMPLATE_BY_KEY.get(templateKey);
    if (!template) {
      return res.status(400).json({ message: "Choose a template to send." });
    }

    if (!Array.isArray(recipients) || !recipients.length) {
      return res.status(400).json({ message: "Choose at least one recipient." });
    }

    if (recipients.length > 500) {
      return res.status(400).json({
        message: `${recipients.length} recipients in one send — split it into batches of 500 or fewer.`,
      });
    }

    // Every required variable must have a value. Meta rejects a template whose
    // parameter count is short, and a rejection per recipient is a lot of
    // failures for one blank field.
    const missing = template.variables.filter((name) => !trimmed(variables[name]));
    if (missing.length) {
      return res.status(400).json({
        message: `Fill in: ${missing.join(", ")}.`,
      });
    }

    let load = null;
    if (trimmed(loadId)) {
      load = await Load.findOne({ loadId: trimmed(loadId) }).select("_id loadId locationId").lean();
    }

    // One id across the batch so the panel can report on it as a whole.
    const batchId = crypto.randomUUID();

    const queued = [];
    for (const recipient of recipients) {
      const row = await enqueue({
        to: recipient.phone,
        recipientName: recipient.name,
        recipientRole: recipient.role || "other",
        recipientRef: mongoose.isValidObjectId(recipient.id) ? recipient.id : undefined,
        templateKey,
        variables,
        load: load?._id,
        loadId: load?.loadId,
        batchId,
        createdBy: req.user._id,
        locationId: load?.locationId || req.locationId,
      });
      if (row) queued.push(row);
    }

    const skipped = queued.filter((r) => r.status === "SKIPPED").length;

    res.status(201).json({
      message: skipped
        ? `${queued.length - skipped} message(s) queued, ${skipped} skipped (no number or opted out).`
        : `${queued.length} message(s) queued.`,
      batchId,
      queued: queued.length - skipped,
      skipped,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Outbox history
// @route   GET /api/whatsapp/messages
// @access  Private (staff, admin)
const getMessages = async (req, res) => {
  try {
    const query = {};
    if (req.query.status) query.status = req.query.status;
    if (trimmed(req.query.loadId)) query.loadId = trimmed(req.query.loadId);
    if (trimmed(req.query.batchId)) query.batchId = trimmed(req.query.batchId);

    const messages = await WhatsAppMessage.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(req.query.limit) || 100, 500))
      .lean();

    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Drain the queue now rather than waiting for the next tick
// @route   POST /api/whatsapp/flush
// @access  Private (admin)
const flushQueue = async (req, res) => {
  try {
    const result = await drainQueue({ limit: Number(req.body?.limit) || undefined });
    res.json({
      message:
        result.reason === "disabled"
          ? "WhatsApp sending is switched off."
          : `${result.sent || 0} sent, ${result.failed || 0} failed.`,
      ...result,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Record or lift an opt-out
// @route   POST /api/whatsapp/opt-out
// @access  Private (staff, admin)
const setOptOut = async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    if (!phone) return res.status(400).json({ message: "A valid phone number is required." });

    if (req.body.optIn) {
      await runUnscoped(() => WhatsAppOptOut.deleteOne({ phone }));
      return res.json({ message: `${phone} will receive messages again.` });
    }

    await runUnscoped(() =>
      WhatsAppOptOut.updateOne(
        { phone },
        {
          $set: {
            phone,
            source: "manual",
            note: trimmed(req.body.note),
            recordedBy: req.user._id,
            optedOutAt: new Date(),
          },
        },
        { upsert: true },
      ),
    );

    res.json({ message: `${phone} will no longer be messaged.` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getConfig,
  updateConfig,
  getTemplates,
  getRecipients,
  previewTemplate,
  sendMessages,
  getMessages,
  flushQueue,
  setOptOut,
};
