const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const routeText = (load) =>
  `${load.pickup?.city || "TBD"}, ${load.pickup?.state || ""} to ${load.drop?.city || "TBD"}, ${load.drop?.state || ""}`;

const customerCredentials = ({ customer, password, frontendUrl }) => ({
  subject: "FMS - Your Customer Portal Credentials",
  text: `Hello ${customer.firstName || "Customer"}, your FMS login is ${frontendUrl}/client-login. Email: ${customer.email}. Password: ${password}. Please login and change your password immediately.`,
  html: `
    <h3>Hello ${escapeHtml(customer.firstName || "Customer")}!</h3>
    <p>Your login credentials for the FMS system:</p>
    <p><strong>Login URL:</strong> ${escapeHtml(frontendUrl)}/client-login</p>
    <p><strong>Email:</strong> ${escapeHtml(customer.email)}</p>
    <p><strong>Password:</strong> ${escapeHtml(password)}</p>
    <br/>
    <p>Please login and change your password immediately.</p>
  `,
});

const fleetOwnerCredentials = ({ carrierName, email, password, frontendUrl, includeBiddingAccess = false }) => ({
  subject: "FMS - Your Fleet Owner Credentials",
  text: `Welcome ${carrierName}. Your FMS login is ${frontendUrl}/vendor-login. Email: ${email}. Password: ${password}. Please login and change your password immediately.`,
  html: `
    <h3>Welcome ${escapeHtml(carrierName)}!</h3>
    <p>Your fleet owner credentials for the FMS system:</p>
    <p><strong>Login URL:</strong> ${escapeHtml(frontendUrl)}/vendor-login</p>
    <p><strong>Email:</strong> ${escapeHtml(email)}</p>
    <p><strong>Password:</strong> ${escapeHtml(password)}</p>
    <br/>
    <p>Please login and change your password immediately.</p>
    ${includeBiddingAccess ? "<p>You can now view and bid on available loads in the system.</p>" : ""}
  `,
});

const loadRequiresChanges = ({ load, client, changesNote }) => ({
  subject: `Updates Required for Load ${load.loadId}`,
  text: `Hello ${client.firstName || "Customer"}, your load ${load.loadId} requires changes: ${changesNote}. Please log in and update your load.`,
  html: `
    <p>Hello ${escapeHtml(client.firstName || "Customer")},</p>
    <p>Your load <strong>${escapeHtml(load.loadId)}</strong> has been reviewed and requires the following changes before it can be verified:</p>
    <blockquote style="
      margin: 16px 0;
      padding: 12px 16px;
      background: #fff7ed;
      border-left: 4px solid #f97316;
      border-radius: 4px;
      color: #374151;
      font-size: 14px;
      line-height: 1.6;
    ">
      ${escapeHtml(changesNote)}
    </blockquote>
    <p>Please log in and update your load accordingly. Once resubmitted, our team will review it again.</p>
    <p style="color:#6b7280;font-size:13px;">If you have any questions, please contact our support team.</p>
  `,
});

const biddingNowOpen = ({ load }) => ({
  subject: `FMS - Bidding Now Open: Load ${load.loadId}`,
  text: `Bidding has started for load ${load.loadId}. Route: ${routeText(load)}. Bidding ends: ${load.bidEndTime ? new Date(load.bidEndTime).toLocaleString() : "TBD"}.`,
  html: `
    <h3>Bidding is Now Open!</h3>
    <p>Bidding has started for Load <strong>${escapeHtml(load.loadId)}</strong>.</p>
    <p><strong>Route:</strong> ${escapeHtml(routeText(load))}</p>
    <p><strong>Bidding Ends:</strong> ${load.bidEndTime ? escapeHtml(new Date(load.bidEndTime).toLocaleString()) : "TBD"}</p>
    <p>Login to the FMS portal to place your bid now!</p>
  `,
});

const biddingScheduled = ({ load }) => ({
  subject: `FMS - Bidding Scheduled: Load ${load.loadId}`,
  text: `Bidding has been scheduled for load ${load.loadId}. Route: ${routeText(load)}. Bidding opens: ${load.bidStartTime ? new Date(load.bidStartTime).toLocaleString() : "TBD"} and closes: ${load.bidEndTime ? new Date(load.bidEndTime).toLocaleString() : "TBD"}. Log in to place your bid when it opens.`,
  html: `
    <h3>Bidding Scheduled</h3>
    <p>A load is scheduled for bidding. Load <strong>${escapeHtml(load.loadId)}</strong>.</p>
    <p><strong>Route:</strong> ${escapeHtml(routeText(load))}</p>
    <p><strong>Bidding Opens:</strong> ${load.bidStartTime ? escapeHtml(new Date(load.bidStartTime).toLocaleString()) : "TBD"}</p>
    <p><strong>Bidding Closes:</strong> ${load.bidEndTime ? escapeHtml(new Date(load.bidEndTime).toLocaleString()) : "TBD"}</p>
    <p>Log in to the FMS portal to place your bid once bidding opens.</p>
  `,
});

const bidWon = ({ load, fleetOwner, winningBid }) => ({
  subject: `FMS - Congratulations! You Won the Bid for Load ${load.loadId}`,
  text: `Congratulations ${fleetOwner.carrierName}! Your bid of $${Number(winningBid.amount || 0).toLocaleString()} won load ${load.loadId}. Route: ${routeText(load)}.`,
  html: `
    <h3>Congratulations ${escapeHtml(fleetOwner.carrierName)}!</h3>
    <p>Your bid of <strong>$${escapeHtml(Number(winningBid.amount || 0).toLocaleString())}</strong> was the winning bid for Load <strong>${escapeHtml(load.loadId)}</strong>.</p>
    <p><strong>Route:</strong> ${escapeHtml(routeText(load))}</p>
    <br/>
    <p>Our team will contact you shortly with further details.</p>
  `,
});

/**
 * Sent to every party involved when a load is confirmed as a street turn.
 * `recipientLabel` names the party being written to (e.g. "Delivery Partner"),
 * so the same body can be addressed to each of them.
 */
const streetTurnConfirmed = ({ load, streetTurn, recipientLabel }) => {
  const rows = [
    ["Load", load.loadId],
    ["Route", routeText(load)],
    ["Container #", load.containerNo],
    ["Chassis #", load.chassisNo],
    ["Delivery Partner", streetTurn.deliveryPartner],
    ["Shipping Line", streetTurn.shippingLine],
    ["Chassis Company", streetTurn.chassisCompany],
  ].filter(([, value]) => value);

  return {
    subject: `FMS - Street Turn Confirmed: Load ${load.loadId}`,
    text:
      [
        `A street turn has been confirmed for load ${load.loadId}.`,
        `You are receiving this as the ${recipientLabel}.`,
      ].join("\n") +
      "\n\n" +
      rows.map(([label, value]) => `${label}: ${value}`).join("\n") +
      (streetTurn.note ? `\n\nNote: ${streetTurn.note}` : ""),
    html: `
    <h3>Street Turn Confirmed</h3>
    <p>A street turn has been confirmed for Load <strong>${escapeHtml(load.loadId)}</strong>.</p>
    <p>You are receiving this as the <strong>${escapeHtml(recipientLabel)}</strong>.</p>
    <table cellpadding="6" cellspacing="0" border="0">
      ${rows
        .map(
          ([label, value]) =>
            `<tr><td><strong>${escapeHtml(label)}</strong></td><td>${escapeHtml(value)}</td></tr>`,
        )
        .join("")}
    </table>
    ${streetTurn.note ? `<p><strong>Note:</strong> ${escapeHtml(streetTurn.note)}</p>` : ""}
  `,
  };
};

module.exports = {
  biddingNowOpen,
  biddingScheduled,
  bidWon,
  customerCredentials,
  fleetOwnerCredentials,
  loadRequiresChanges,
  streetTurnConfirmed,
};
