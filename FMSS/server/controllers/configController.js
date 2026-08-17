const EmailConfig = require("../models/EmailConfig");
const templates = require("../services/emailTemplates");
const { sendEmail } = require("../utils/mailer");

// Sample data used to render each template for preview / test sends
const TEMPLATE_META = {
  customerCredentials: {
    label: "Customer Credentials",
    description: "Sent when a new customer account is created with their login details.",
    trigger: "New customer registered",
    sampleData: (frontendUrl) => ({
      customer: { firstName: "Jane", email: "jane.doe@example.com" },
      password: "SecurePass123!",
      frontendUrl,
    }),
  },
  fleetOwnerCredentials: {
    label: "Fleet Owner Credentials",
    description: "Sent when a new fleet owner is added to the system.",
    trigger: "New fleet owner created",
    sampleData: (frontendUrl) => ({
      carrierName: "Swift Logistics LLC",
      email: "fleet@swiftlogistics.com",
      password: "FleetPass456!",
      frontendUrl,
      includeBiddingAccess: true,
    }),
  },
  loadRequiresChanges: {
    label: "Load Requires Changes",
    description: "Sent to the customer when staff requests changes to a pending load.",
    trigger: "Staff clicks 'Request Changes'",
    sampleData: () => ({
      load: { loadId: "LD-2026-001" },
      client: { firstName: "John", email: "john@example.com" },
      changesNote: "Please update the pickup date to next Monday and confirm the commodity type.",
    }),
  },
  biddingNowOpen: {
    label: "Bidding Now Open",
    description: "Sent to all active fleet owners when bidding opens for a load.",
    trigger: "Load verified & bidding starts",
    sampleData: () => ({
      load: {
        loadId: "LD-2026-042",
        pickup: { city: "Chicago", state: "IL" },
        drop: { city: "Dallas", state: "TX" },
        bidEndTime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      },
    }),
  },
  bidWon: {
    label: "Bid Won",
    description: "Sent to the fleet owner whose bid was selected as the winner.",
    trigger: "Bid winner assigned",
    sampleData: () => ({
      load: {
        loadId: "LD-2026-042",
        pickup: { city: "Chicago", state: "IL" },
        drop: { city: "Dallas", state: "TX" },
      },
      fleetOwner: { carrierName: "Swift Logistics LLC" },
      winningBid: { amount: 4500 },
    }),
  },
};

const { frontendUrl: getFrontendUrl } = require("../utils/frontendUrl");

// @desc    Get email configuration
// @route   GET /api/config/email
// @access  Private (Admin/Staff)
const getEmailConfig = async (req, res) => {
  try {
    const config = await EmailConfig.getGlobalConfig();
    res.json({
      host: config.host,
      port: config.port,
      email: config.email,
      isEmailEnabled: config.isEmailEnabled,
      hasPassword: !!config.password,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update email configuration
// @route   PUT /api/config/email
// @access  Private (Admin/Staff)
const updateEmailConfig = async (req, res) => {
  try {
    const { host, port, email, password, isEmailEnabled } = req.body;
    const config = await EmailConfig.getGlobalConfig();

    if (host !== undefined) config.host = host;
    if (port !== undefined) config.port = port;
    if (email !== undefined) config.email = email;
    if (isEmailEnabled !== undefined) config.isEmailEnabled = isEmailEnabled;
    if (password) config.password = password;

    await config.save();
    res.json({
      host: config.host,
      port: config.port,
      email: config.email,
      isEmailEnabled: config.isEmailEnabled,
      hasPassword: !!config.password,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get list of all email templates with metadata
// @route   GET /api/config/email/templates
// @access  Private (Admin/Staff)
const getEmailTemplates = async (req, res) => {
  try {
    const list = Object.entries(TEMPLATE_META).map(([key, meta]) => ({
      key,
      label: meta.label,
      description: meta.description,
      trigger: meta.trigger,
    }));
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Preview a rendered email template (HTML + subject)
// @route   GET /api/config/email/preview/:templateKey
// @access  Private (Admin/Staff)
const previewEmailTemplate = async (req, res) => {
  try {
    const { templateKey } = req.params;
    const meta = TEMPLATE_META[templateKey];
    if (!meta) return res.status(404).json({ message: "Unknown template key." });

    const data = meta.sampleData(getFrontendUrl());
    const rendered = templates[templateKey](data);
    res.json({ key: templateKey, subject: rendered.subject, html: rendered.html, text: rendered.text });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Send a test email using a template with sample data
// @route   POST /api/config/email/test
// @access  Private (Admin/Staff)
const sendTestEmail = async (req, res) => {
  try {
    const { templateKey, to } = req.body;
    if (!to) return res.status(400).json({ message: "Recipient email (to) is required." });

    const meta = TEMPLATE_META[templateKey];
    if (!meta) return res.status(404).json({ message: "Unknown template key." });

    const data = meta.sampleData(getFrontendUrl());
    const rendered = templates[templateKey](data);

    const result = await sendEmail({ to, subject: `[TEST] ${rendered.subject}`, text: rendered.text, html: rendered.html });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getEmailConfig,
  updateEmailConfig,
  getEmailTemplates,
  previewEmailTemplate,
  sendTestEmail,
};
