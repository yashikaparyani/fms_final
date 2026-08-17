const { sendEmail } = require("../utils/mailer");
const templates = require("./emailTemplates");

const frontendUrl = () => process.env.FRONTEND_URL || "http://localhost:5173";

const toEmailStatus = (result) => ({
  requested: !!result?.requested,
  attempted: !!result?.attempted,
  sent: !!result?.sent,
  skipped: !!result?.skipped,
  reason: result?.reason || null,
  message: result?.message || "",
});

const sendTemplate = async ({ to, template }) => {
  const result = await sendEmail({
    to,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });

  return toEmailStatus(result);
};

const sendCustomerCredentials = ({ customer, password }) =>
  sendTemplate({
    to: customer.email,
    template: templates.customerCredentials({
      customer,
      password,
      frontendUrl: frontendUrl(),
    }),
  });

const sendFleetOwnerCredentials = ({
  carrierName,
  email,
  loginEmail,
  password,
  includeBiddingAccess = false,
}) =>
  sendTemplate({
    // Sent to the contact address; the body names the account to sign in with.
    to: email,
    template: templates.fleetOwnerCredentials({
      carrierName,
      email,
      loginEmail,
      password,
      frontendUrl: frontendUrl(),
      includeBiddingAccess,
    }),
  });

const sendStaffCredentials = ({ firstName, email, password, locationNames }) =>
  sendTemplate({
    to: email,
    template: templates.staffCredentials({
      firstName,
      email,
      password,
      locationNames,
      frontendUrl: frontendUrl(),
    }),
  });

const sendDriverCredentials = ({ driverName, email, password, carrierName }) =>
  sendTemplate({
    to: email,
    template: templates.driverCredentials({
      driverName,
      email,
      password,
      carrierName,
      frontendUrl: frontendUrl(),
    }),
  });

// The broker named on the certificate. Read from config/carrierAgreements.js
// rather than repeated here, so a change of counterparty is one edit.
const BROKER = require("../config/carrierAgreements").AGREEMENT_BY_KEY.get("broker");
const { COVERAGES } = require("../config/insuranceCoverages");

const sendInsuranceRequest = ({
  to,
  agentName,
  agencyName,
  carrierName,
  mcNumber,
  dotNumber,
  link,
  expiresAt,
  isReminder = false,
}) =>
  sendTemplate({
    to,
    template: templates.insuranceRequest({
      agentName,
      agencyName,
      carrierName,
      mcNumber,
      dotNumber,
      link,
      expiresAt,
      isReminder,
      brokerName: BROKER.counterparty,
      brokerAddress: BROKER.counterpartyAddress,
      // Listed in the email so the agency can start pulling policies before
      // they even open the form.
      requiredCoverages: COVERAGES.filter((c) => c.required).map((c) =>
        c.minLimit
          ? `${c.label} — at least $${c.minLimit.toLocaleString("en-US")}`
          : `${c.label}${c.statutory ? " — statutory limits" : ""}`,
      ),
    }),
  });

const sendInsuranceFiled = ({ to, carrierName, agencyName, policyCount, shortfalls }) =>
  sendTemplate({
    to,
    template: templates.insuranceFiled({
      carrierName,
      agencyName,
      policyCount,
      shortfalls,
    }),
  });

const sendDriverPaymentStatement = ({
  to,
  driverName,
  statement,
  total,
  paidAt,
  reference,
}) =>
  sendTemplate({
    to,
    template: templates.driverPaymentStatement({
      driverName,
      statement,
      total,
      paidAt,
      reference,
    }),
  });

const sendLoadRequiresChanges = ({ load, client, changesNote }) =>
  sendTemplate({
    to: client.email,
    template: templates.loadRequiresChanges({ load, client, changesNote }),
  });

const sendBiddingNowOpen = ({ load, email }) =>
  sendTemplate({
    to: email,
    template: templates.biddingNowOpen({ load }),
  });

const sendBiddingScheduled = ({ load, email }) =>
  sendTemplate({
    to: email,
    template: templates.biddingScheduled({ load }),
  });

const sendBidWon = ({ load, fleetOwner, winningBid, email }) =>
  sendTemplate({
    to: email,
    template: templates.bidWon({ load, fleetOwner, winningBid }),
  });

/**
 * Notifies every party on a confirmed street turn: the delivery partner, the
 * shipping line, the chassis company, the carrier (who passes it to the
 * driver) and each admin.
 *
 * Recipients are emailed independently — one bad address must not stop the
 * rest — and the per-recipient outcome is returned so the caller can record
 * it on the load.
 *
 * @returns {Promise<Array<{party, email, sent, reason}>>}
 */
const sendStreetTurnNotifications = async ({ load, streetTurn, recipients }) => {
  const targets = recipients
    .filter((r) => r.email)
    .map((r) => ({ ...r, email: String(r.email).trim() }))
    .filter((r) => r.email);

  // The same address in two roles (e.g. carrier also listed as admin) should
  // only be written to once.
  const seen = new Set();
  const unique = targets.filter((r) => {
    const key = r.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const results = await Promise.allSettled(
    unique.map((recipient) =>
      sendTemplate({
        to: recipient.email,
        template: templates.streetTurnConfirmed({
          load,
          streetTurn,
          recipientLabel: recipient.party,
        }),
      }),
    ),
  );

  return results.map((result, i) => ({
    party: unique[i].party,
    email: unique[i].email,
    sent: result.status === "fulfilled" && !!result.value?.sent,
    reason:
      result.status === "rejected"
        ? result.reason?.message || "Send failed"
        : result.value?.reason || null,
  }));
};

module.exports = {
  sendBidWon,
  sendBiddingNowOpen,
  sendBiddingScheduled,
  sendCustomerCredentials,
  sendDriverCredentials,
  sendDriverPaymentStatement,
  sendFleetOwnerCredentials,
  sendInsuranceFiled,
  sendInsuranceRequest,
  sendLoadRequiresChanges,
  sendStaffCredentials,
  sendStreetTurnNotifications,
  toEmailStatus,
};
