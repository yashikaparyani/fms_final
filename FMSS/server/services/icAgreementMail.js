const IcAgreement = require("../models/IcAgreement");
const { sendEmail } = require("../utils/mailer");

// ─── IC agreement copies by email ─────────────────────────────────────────────
// When the IC agreement form is submitted, two copies of the PDF go out:
//
//   1. to the contractor, at the address they typed into the form;
//   2. to the office, at every address in IC_NOTIFY_EMAILS (server/.env,
//      comma separated).
//
// Either is skipped when it has no address. The PDF is the one the contractor's
// browser built and previewed, so the copy is exactly what they saw. Sending
// runs after the submission is saved and answered, so a slow or failing mail
// server never loses an agreement; the outcome is written to `mailStatus`.
// ─────────────────────────────────────────────────────────────────────────────

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const officeEmails = () =>
  String(process.env.IC_NOTIFY_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

const wrap = (title, body) => `
  <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
    <h2 style="color: #0f172a; margin-top: 0; font-size: 19px; border-bottom: 2px solid #1f4e8c; padding-bottom: 10px;">${title}</h2>
    ${body}
  </div>`;

const row = (label, value) =>
  `<tr><td style="padding:4px 12px 4px 0;color:#64748b;font-size:13px">${label}</td><td style="padding:4px 0;font-size:13px;color:#0f172a">${escapeHtml(value || "-")}</td></tr>`;

const contractorMail = (a) => ({
  subject: `Your Independent Contractor Agreement with Empire Transportation (${a.agreementId})`,
  text:
    `Hello ${a.signerName || a.name},\n\n` +
    `Thank you for completing the Independent Contractor Agreement with Empire Transportation. ` +
    `A copy of the agreement is attached for your records.\n\nReference: ${a.agreementId}\n\nEmpire Transportation`,
  html: wrap(
    "Empire Transportation &mdash; IC Agreement",
    `<p style="color:#334155;font-size:14px">Hello <strong>${escapeHtml(a.signerName || a.name)}</strong>,</p>
     <p style="color:#475569;font-size:14px;line-height:1.5">Thank you for completing the Independent Contractor Agreement with Empire Transportation. A copy of the agreement is attached for your records.</p>
     <p style="color:#475569;font-size:13px">Reference: <strong>${escapeHtml(a.agreementId)}</strong></p>`,
  ),
});

const officeMail = (a) => ({
  subject: `New IC agreement submitted: ${a.name} (${a.agreementId})`,
  text:
    `A new Independent Contractor Agreement was submitted.\n\n` +
    `Contractor: ${a.name}\nSigner: ${[a.signerName, a.signerTitle].filter(Boolean).join(" / ")}\n` +
    `EIN: ${a.ein || "-"}\nEmail: ${a.contractorEmail || "-"}\n` +
    `Address: ${[a.street, a.city, a.state, a.zip].filter(Boolean).join(", ")}\n` +
    `Reference: ${a.agreementId}\n\nThe signed PDF is attached.`,
  html: wrap(
    "New IC agreement submitted",
    `<table style="border-collapse:collapse;margin:8px 0 14px">
       ${row("Contractor", a.name)}
       ${row("Signer", [a.signerName, a.signerTitle].filter(Boolean).join(" / "))}
       ${row("EIN", a.ein)}
       ${row("Driver license", a.dl)}
       ${row("Email", a.contractorEmail)}
       ${row("Address", [a.street, a.city, a.state, a.zip].filter(Boolean).join(", "))}
       ${row("Equipment units", String((a.equipment || []).length))}
       ${row("Reference", a.agreementId)}
     </table>
     <p style="color:#475569;font-size:13px">The signed PDF is attached. All submissions are in the IC Agreement admin panel.</p>`,
  ),
});

const statusOf = (result) => result?.reason || (result?.sent ? "SENT" : "SEND_FAILED");

/**
 * Mail both copies of a freshly saved agreement. Never throws; the outcome is
 * stored on the agreement and returned.
 */
const sendAgreementCopies = async (agreement, pdf) => {
  const attachments = pdf
    ? [{ filename: agreement.fileName || `IC-Agreement-${agreement.agreementId}.pdf`, content: pdf, contentType: "application/pdf" }]
    : [];
  const status = { contractor: "SKIPPED", office: "SKIPPED", at: new Date() };

  try {
    if (agreement.contractorEmail) {
      status.contractor = statusOf(
        await sendEmail({ to: agreement.contractorEmail, ...contractorMail(agreement), attachments }),
      );
    }

    const office = officeEmails();
    if (office.length) {
      status.office = statusOf(
        await sendEmail({
          to: office.join(", "),
          replyTo: agreement.contractorEmail || undefined,
          ...officeMail(agreement),
          attachments,
        }),
      );
    }
  } catch (error) {
    console.error(`[IC Agreement] mailing ${agreement.agreementId} failed:`, error.message);
  }

  console.log(
    `[IC Agreement] ${agreement.agreementId} copies — contractor: ${status.contractor}, office: ${status.office}`,
  );
  await IcAgreement.updateOne({ _id: agreement._id }, { mailStatus: status }).catch(() => {});
  return status;
};

module.exports = { sendAgreementCopies, officeEmails };
