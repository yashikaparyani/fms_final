const nodemailer = require("nodemailer");
const EmailConfig = require("../models/EmailConfig");

const EMAIL_STATUS = {
  SENT: "SENT",
  DISABLED: "DISABLED",
  INCOMPLETE_CONFIG: "INCOMPLETE_CONFIG",
  NO_RECIPIENT: "NO_RECIPIENT",
  SEND_FAILED: "SEND_FAILED",
};

const createEmailResult = ({
  requested = true,
  attempted = false,
  sent = false,
  skipped = false,
  reason = null,
  message = "",
  error = null,
} = {}) => ({
  requested,
  attempted,
  sent,
  skipped,
  reason,
  message,
  error,
});

/**
 * Sends an email using the global DB EmailConfig settings.
 * @param {Object} options - { to, cc, replyTo, subject, text, html, attachments }
 * @returns {Object} structured delivery status
 */
const sendEmail = async (options) => {
  try {
    if (!options?.to) {
      return createEmailResult({
        requested: false,
        skipped: true,
        reason: EMAIL_STATUS.NO_RECIPIENT,
        message: "No recipient email was provided.",
      });
    }

    const config = await EmailConfig.getGlobalConfig();

    if (!config.isEmailEnabled) {
      console.log("Email disabled in settings, skipping sendEmail to:", options.to);
      return createEmailResult({
        skipped: true,
        reason: EMAIL_STATUS.DISABLED,
        message: "Automated email is disabled.",
      });
    }

    if (!config.host || !config.email || !config.password) {
      console.error("Incomplete Email Config, cannot send email.");
      return createEmailResult({
        skipped: true,
        reason: EMAIL_STATUS.INCOMPLETE_CONFIG,
        message: "Email configuration is incomplete.",
      });
    }

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465, // true for 465, false for other ports
      auth: {
        user: config.email,
        pass: config.password,
      },
    });

    const mailOptions = {
      from: `"FMS System" <${config.email}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    };

    // Copies and attachments are passed through only when the caller asked for
    // them. Set unconditionally — even to undefined — nodemailer is fine, but an
    // empty `cc` header on every credential email is noise in every inbox.
    if (options.cc) mailOptions.cc = options.cc;
    if (options.replyTo) mailOptions.replyTo = options.replyTo;

    // An invoice is not an invoice until the PDF is on the mail. Attachments are
    // buffers rather than paths on purpose — see services/invoiceDocumentService.js
    // for why nothing renders to disk first.
    if (Array.isArray(options.attachments) && options.attachments.length) {
      mailOptions.attachments = options.attachments;
    }

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent: %s", info.messageId);
    return createEmailResult({
      attempted: true,
      sent: true,
      reason: EMAIL_STATUS.SENT,
      message: "Email sent successfully.",
    });
  } catch (error) {
    console.error("Error sending email:", error);
    return createEmailResult({
      attempted: true,
      sent: false,
      reason: EMAIL_STATUS.SEND_FAILED,
      message: "Email send failed.",
      error: error.message,
    });
  }
};

module.exports = { EMAIL_STATUS, sendEmail };
