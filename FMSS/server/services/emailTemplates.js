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

// `email` is where this is sent; `loginEmail` is what to type at the sign-in
// screen. They are usually the same, but a carrier's paperwork contact is not
// always the address their account was opened under — and telling somebody to
// sign in with an address that has no account produces "Invalid credentials"
// with nothing to go on. Defaults to `email` for callers where they match.
const fleetOwnerCredentials = ({
  carrierName,
  email,
  loginEmail,
  password,
  frontendUrl,
  includeBiddingAccess = false,
}) => ({
  subject: "FMS - Your Fleet Owner Credentials",
  text: `Welcome ${carrierName}. Your FMS login is ${frontendUrl}/vendor-login. Email: ${loginEmail || email}. Password: ${password}. Please login and change your password immediately.`,
  html: `
    <h3>Welcome ${escapeHtml(carrierName)}!</h3>
    <p>Your fleet owner credentials for the FMS system:</p>
    <p><strong>Login URL:</strong> ${escapeHtml(frontendUrl)}/vendor-login</p>
    <p><strong>Sign in with:</strong> ${escapeHtml(loginEmail || email)}</p>
    <p><strong>Password:</strong> ${escapeHtml(password)}</p>
    <br/>
    <p>Please login and change your password immediately.</p>
    ${includeBiddingAccess ? "<p>You can now view and bid on available loads in the system.</p>" : ""}
  `,
});

const staffCredentials = ({
  firstName,
  email,
  password,
  frontendUrl,
  locationNames = [],
}) => {
  // Staff are told which locations they were assigned. Without it the first
  // thing a new hire sees is a location switcher they cannot interpret, or an
  // empty board with no clue that access was scoped.
  const locationLine = locationNames.length
    ? `You have been given access to: ${locationNames.join(", ")}.`
    : `No location has been assigned to you yet — your administrator will do that shortly.`;

  return {
    subject: "FMS - Your Staff Account",
    text: `Hello ${firstName || "there"}, your FMS staff login is ${frontendUrl}/staff-login. Email: ${email}. Password: ${password}. ${locationLine} Please login and change your password immediately.`,
    html: `
    <h3>Hello ${escapeHtml(firstName || "there")}!</h3>
    <p>A staff account has been created for you on the FMS system:</p>
    <p><strong>Login URL:</strong> ${escapeHtml(frontendUrl)}/staff-login</p>
    <p><strong>Email:</strong> ${escapeHtml(email)}</p>
    <p><strong>Password:</strong> ${escapeHtml(password)}</p>
    <p>${escapeHtml(locationLine)}</p>
    <br/>
    <p>Please login and change your password immediately.</p>
  `,
  };
};

const driverCredentials = ({
  driverName,
  email,
  password,
  frontendUrl,
  carrierName,
}) => ({
  subject: "FMS - Your Driver App Login",
  text: `Hello ${driverName || "Driver"}, ${carrierName || "your carrier"} has created a driver account for you. Sign in to the FMS driver app with Email: ${email} and Password: ${password}. Web login: ${frontendUrl}/vendor-login. Please change your password after your first sign-in.`,
  html: `
    <h3>Hello ${escapeHtml(driverName || "Driver")}!</h3>
    <p>${escapeHtml(carrierName || "Your carrier")} has created a driver account for you on the FMS system.</p>
    <p><strong>Email:</strong> ${escapeHtml(email)}</p>
    <p><strong>Password:</strong> ${escapeHtml(password)}</p>
    <p>Sign in with the FMS mobile app to see the trips assigned to you, start live tracking and upload pickup and delivery proof.</p>
    <p><strong>Web login:</strong> ${escapeHtml(frontendUrl)}/vendor-login</p>
    <br/>
    <p>Please change your password after your first sign-in.</p>
  `,
});

// Sent to the carrier's own insurance agency, who has no account here and may
// never have heard of us. It has to say who is asking, on whose behalf, exactly
// what is needed, and who to name on the certificate — an agency that has to
// phone the carrier to find out any of that will simply not do it today.
const insuranceRequest = ({
  agentName,
  agencyName,
  carrierName,
  mcNumber,
  dotNumber,
  link,
  expiresAt,
  brokerName,
  brokerAddress,
  requiredCoverages = [],
  isReminder = false,
}) => {
  const identity = [
    mcNumber ? `MC ${mcNumber}` : null,
    dotNumber ? `USDOT ${dotNumber}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const expiryText = expiresAt
    ? new Date(expiresAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

  const subject = isReminder
    ? `Reminder: certificates of insurance needed for ${carrierName}`
    : `Certificates of insurance requested for ${carrierName}`;

  return {
    subject,
    text:
      `${isReminder ? "Reminder — " : ""}${carrierName}${identity ? ` (${identity})` : ""} has asked you to file their certificates of insurance with ${brokerName}. ` +
      `Open ${link} to enter the policy details. No account or password is needed.${expiryText ? ` The link works until ${expiryText}.` : ""} ` +
      `Please name ${brokerName}, ${brokerAddress}, as certificate holder.`,
    html: `
    <p>Hello${agentName ? ` ${escapeHtml(agentName)}` : ""}${agencyName ? ` at ${escapeHtml(agencyName)}` : ""},</p>
    <p>
      ${isReminder ? "<strong>Reminder:</strong> " : ""}
      <strong>${escapeHtml(carrierName)}</strong>${identity ? ` (${escapeHtml(identity)})` : ""}
      has asked you to file their certificates of insurance.
    </p>
    <p>
      <a href="${escapeHtml(link)}"
         style="display:inline-block;padding:10px 18px;background:#4338ca;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600">
        Enter the policy details
      </a>
    </p>
    <p style="font-size:13px;color:#4b5563">
      No account or password is needed — the link opens the form directly.${
        expiryText ? ` It works until <strong>${escapeHtml(expiryText)}</strong>.` : ""
      }
    </p>
    <p><strong>Certificate holder / additional insured:</strong><br/>
      ${escapeHtml(brokerName)}<br/>
      ${escapeHtml(brokerAddress)}
    </p>
    ${
      requiredCoverages.length
        ? `<p><strong>Required cover:</strong></p><ul>${requiredCoverages
            .map((c) => `<li>${escapeHtml(c)}</li>`)
            .join("")}</ul>`
        : ""
    }
    <p style="font-size:12px;color:#6b7280">
      If you were not expecting this, please ignore it — the link is specific to
      this one carrier and grants no other access.
    </p>
  `,
  };
};

// Sent back to the carrier once their agency files, so they are not left
// refreshing a page to find out.
const insuranceFiled = ({ carrierName, agencyName, policyCount, shortfalls = [] }) => ({
  subject: shortfalls.length
    ? `Insurance filed for ${carrierName} — some items need attention`
    : `Insurance filed for ${carrierName}`,
  text:
    `${agencyName || "Your insurance agency"} has filed ${policyCount} polic${policyCount === 1 ? "y" : "ies"} for ${carrierName}. ` +
    (shortfalls.length
      ? `The following fall short of the agreement: ${shortfalls.join(" ")}`
      : `Everything meets the contractual requirements.`),
  html: `
    <p>Good news — <strong>${escapeHtml(agencyName || "your insurance agency")}</strong> has filed
      ${policyCount} polic${policyCount === 1 ? "y" : "ies"} for <strong>${escapeHtml(carrierName)}</strong>.</p>
    ${
      shortfalls.length
        ? `<p>Some items fall short of what the agreement requires:</p>
           <ul>${shortfalls.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>
           <p>Please ask your agency to correct these — your onboarding cannot be approved until they are resolved.</p>`
        : `<p>Everything meets the contractual requirements. Nothing further is needed from you on insurance.</p>`
    }
    <p>You can see the full details on your onboarding page at any time.</p>
  `,
});

// Sent to a driver the moment their pay is settled. It itemises the loads
// rather than stating a lump sum: "you were paid $1,340" invites a phone call
// asking which runs that covered, which is the call this email exists to avoid.
const driverPaymentStatement = ({
  driverName,
  statement = [],
  total,
  paidAt,
  reference,
}) => {
  const paidOn = new Date(paidAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const basis = (row) => {
    if (row.payType === "PERCENTAGE") return `${row.rate}% of load revenue`;
    if (row.payType === "PER_MILE") return `${row.miles} mi × $${row.rate}`;
    if (row.payType === "HOURLY") return `${row.hours} h × $${row.rate}`;
    return "Flat rate";
  };

  const asMoney = (value) => `$${Number(value || 0).toLocaleString("en-US")}`;

  return {
    subject: `Payment of ${asMoney(total)} — ${statement.length} load${statement.length === 1 ? "" : "s"}`,
    text:
      `Hello ${driverName}, you have been paid ${asMoney(total)} on ${paidOn} for ${statement.length} load(s)` +
      `${reference ? ` (reference ${reference})` : ""}. ` +
      statement
        .map((row) => `${row.loadId}: ${basis(row)} = ${asMoney(row.amount)}`)
        .join("; "),
    html: `
    <p>Hello ${escapeHtml(driverName)},</p>
    <p>You have been paid <strong>${escapeHtml(asMoney(total))}</strong> on ${escapeHtml(paidOn)}
      for ${statement.length} load${statement.length === 1 ? "" : "s"}.</p>
    ${reference ? `<p><strong>Reference:</strong> ${escapeHtml(reference)}</p>` : ""}

    <table cellpadding="6" cellspacing="0" border="1"
           style="border-collapse:collapse;font-size:13px;margin-top:12px">
      <tr style="background:#f3f4f6">
        <th align="left">Load</th>
        <th align="left">Customer</th>
        <th align="left">Basis</th>
        <th align="right">Amount</th>
      </tr>
      ${statement
        .map(
          (row) => `
        <tr>
          <td>${escapeHtml(row.loadId)}</td>
          <td>${escapeHtml(row.customerName || "—")}</td>
          <td>${escapeHtml(basis(row))}</td>
          <td align="right">${escapeHtml(asMoney(row.amount))}</td>
        </tr>`,
        )
        .join("")}
      <tr style="background:#f9fafb;font-weight:bold">
        <td colspan="3" align="right">Total</td>
        <td align="right">${escapeHtml(asMoney(total))}</td>
      </tr>
    </table>

    <p style="font-size:12px;color:#6b7280;margin-top:14px">
      If anything here does not look right, contact the office and quote the load
      numbers above.
    </p>
  `,
  };
};

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
  driverCredentials,
  driverPaymentStatement,
  fleetOwnerCredentials,
  insuranceFiled,
  insuranceRequest,
  loadRequiresChanges,
  staffCredentials,
  streetTurnConfirmed,
};
