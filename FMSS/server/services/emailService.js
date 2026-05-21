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
  password,
  includeBiddingAccess = false,
}) =>
  sendTemplate({
    to: email,
    template: templates.fleetOwnerCredentials({
      carrierName,
      email,
      password,
      frontendUrl: frontendUrl(),
      includeBiddingAccess,
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

const sendBidWon = ({ load, fleetOwner, winningBid, email }) =>
  sendTemplate({
    to: email,
    template: templates.bidWon({ load, fleetOwner, winningBid }),
  });

module.exports = {
  sendBidWon,
  sendBiddingNowOpen,
  sendCustomerCredentials,
  sendFleetOwnerCredentials,
  sendLoadRequiresChanges,
  toEmailStatus,
};
