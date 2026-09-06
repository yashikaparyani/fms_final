const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const routeText = (load) =>
  `${load.pickup?.city || "TBD"}, ${load.pickup?.state || ""} to ${load.drop?.city || "TBD"}, ${load.drop?.state || ""}`;

// Staff who add a customer without typing a first name get "N/A" written into
// the user record (see authController.js), and the account name people actually
// know them by lives on the Customer profile instead. Greeting somebody "Hello
// N/A!" in the first email they get from us is not a small thing, so a
// placeholder is treated as no name at all.
const { realName } = require("../utils/displayName");

const customerCredentials = ({ customer, password, frontendUrl }) => {
  // `name` is what the caller resolved from the Customer profile; the user's own
  // fields are the fallback for callers that have no profile to read.
  const greeting =
    realName(customer.name, customer.customerName, customer.firstName) || "Customer";

  return {
  subject: "FMS - Your Customer Portal Credentials",
  text: `Hello ${greeting}, your FMS login is ${frontendUrl}/client-login. Email: ${customer.email}. Password: ${password}. Please login and change your password immediately.`,
  html: `
    <h3>Hello ${escapeHtml(greeting)}!</h3>
    <p>Your login credentials for the FMS system:</p>
    <p><strong>Login URL:</strong> ${escapeHtml(frontendUrl)}/client-login</p>
    <p><strong>Email:</strong> ${escapeHtml(customer.email)}</p>
    <p><strong>Password:</strong> ${escapeHtml(password)}</p>
    <br/>
    <p>Please login and change your password immediately.</p>
  `,
  };
};

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
const streetTurnConfirmed = ({ load, streetTurn, recipientLabel, signLink }) => {
  const rows = [
    ["Load", load.loadId],
    ["Route", routeText(load)],
    ["Container #", load.containerNo],
    ["Chassis #", load.chassisNo],
    ["Street Turn Partner", streetTurn.deliveryPartner],
    ["Shipping Line", streetTurn.shippingLine],
    ["Chassis Company", streetTurn.chassisCompany],
  ].filter(([, value]) => value);

  // Only the street turn partner is asked to sign; everyone else is being told.
  const ask = signLink
    ? "Please confirm you are accepting this container by signing below."
    : "";

  return {
    subject: `FMS - Street Turn Confirmed: Load ${load.loadId}`,
    text:
      [
        `A street turn has been confirmed for load ${load.loadId}.`,
        `You are receiving this as the ${recipientLabel}.`,
        ask,
      ]
        .filter(Boolean)
        .join("\n") +
      "\n\n" +
      rows.map(([label, value]) => `${label}: ${value}`).join("\n") +
      (streetTurn.note ? `\n\nNote: ${streetTurn.note}` : "") +
      (signLink ? `\n\nSign here: ${signLink}` : ""),
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
    ${
      signLink
        ? `<p>${escapeHtml(ask)}</p>
    <p>
      <a href="${escapeHtml(signLink)}"
         style="display:inline-block;padding:12px 22px;border-radius:8px;background:#1D6FE0;color:#ffffff;font-weight:700;text-decoration:none">
        Sign street turn acknowledgement
      </a>
    </p>
    <p style="font-size:12px;color:#64748B">
      If the button does not work, paste this into your browser:<br />${escapeHtml(signLink)}
    </p>`
        : ""
    }
  `,
  };
};

/**
 * The Street Turn Container and Chassis Transfer Agreement, as an email.
 *
 * A street turn moves a container and chassis out of our driver's custody into
 * another carrier's, so what goes out is the contract itself rather than a
 * notice that one exists — the transferee should be able to read the whole
 * thing in the message and sign it without opening an attachment.
 *
 * `signLink` is present only for the transferee. Everyone else on the
 * distribution receives the identical agreement as their record of it, with the
 * signature block shown unsigned.
 *
 * The clauses come from config/streetTurnAgreement.js. This function lays them
 * out; it does not know what any of them mean.
 */
const streetTurnAgreement = ({
  load,
  streetTurn,
  agreement,
  recipientLabel,
  signLink,
  signature,
}) => {
  const { title, transferor, transferee, equipment, clauses, dateText } = agreement;

  const partyRows = (party) =>
    [
      ["Company", party.name],
      ["SCAC", party.scac],
      ["Email", party.email],
    ].filter(([, value]) => value);

  const equipmentRows = [
    ["Load", load.loadId],
    ["Container number", equipment.containerNo],
    ["Container type", equipment.containerType],
    ["Chassis number", equipment.chassisNo],
    ["Pickup / transfer location", equipment.transferLocation],
    ["Delivery / return location", equipment.returnLocation],
    ["Exceptions noted", equipment.condition],
  ].filter(([, value]) => value);

  const textBlock = (rows) =>
    rows.map(([label, value]) => `  ${label}: ${value}`).join("\n");

  const htmlRows = (rows) =>
    rows
      .map(
        ([label, value]) =>
          `<tr><td style="padding:4px 12px 4px 0;color:#64748B;white-space:nowrap">${escapeHtml(
            label,
          )}</td><td style="padding:4px 0;font-weight:600;color:#0F172A">${escapeHtml(
            value,
          )}</td></tr>`,
      )
      .join("");

  // The transferee's block is filled in once they have signed; until then it is
  // shown as blank lines, the way the paper form is.
  const signedLines = signature?.signedAt
    ? [
        ["Signer name", signature.signedName],
        ["Title", signature.signedTitle],
        ["Signed", new Date(signature.signedAt).toUTCString()],
        ["IP address", signature.signedIp],
      ].filter(([, value]) => value)
    : null;

  return {
    subject: `${title} — Load ${load.loadId} (${transferor.scac} → ${transferee.scac || transferee.name})`,
    text: [
      `Please find below the ${title} for the street turn transfer between ` +
        `${transferor.name} and ${transferee.name}.`,
      "",
      `Transferor: ${transferor.name}`,
      textBlock(partyRows(transferor)),
      "",
      `Transferee: ${transferee.name}`,
      textBlock(partyRows(transferee)),
      "",
      "Equipment:",
      textBlock(equipmentRows),
      "",
      `This Agreement is entered into as of ${dateText}.`,
      "",
      ...clauses.map((clause, i) => `${i + 1}. ${clause.heading}\n   ${clause.body}`),
      "",
      streetTurn.note ? `Note from dispatch: ${streetTurn.note}` : "",
      "",
      signLink
        ? `Sign the agreement here: ${signLink}`
        : signedLines
          ? `Signed by ${signature.signedName} on ${new Date(signature.signedAt).toUTCString()}.`
          : `You are receiving this as the ${recipientLabel}.`,
    ]
      .filter((line) => line !== "")
      .join("\n"),
    html: `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#0F172A;max-width:640px">
      <h2 style="margin:0 0 4px;font-size:18px">${escapeHtml(title)}</h2>
      <p style="margin:0 0 18px;font-size:13px;color:#64748B">
        Load ${escapeHtml(load.loadId)} · entered into as of ${escapeHtml(dateText)}
      </p>

      <p style="font-size:14px;line-height:1.6">
        Please find below the ${escapeHtml(title)} for the street turn transfer between
        <strong>${escapeHtml(transferor.name)}</strong> and
        <strong>${escapeHtml(transferee.name)}</strong>.
      </p>

      <table cellpadding="0" cellspacing="0" style="width:100%;margin:18px 0">
        <tr>
          <td style="vertical-align:top;width:50%;padding-right:12px">
            <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.06em;color:#64748B">TRANSFEROR</p>
            <table cellpadding="0" cellspacing="0" style="font-size:13px">${htmlRows(partyRows(transferor))}</table>
          </td>
          <td style="vertical-align:top;width:50%">
            <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.06em;color:#64748B">TRANSFEREE</p>
            <table cellpadding="0" cellspacing="0" style="font-size:13px">${htmlRows(partyRows(transferee))}</table>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.06em;color:#64748B">EQUIPMENT</p>
      <table cellpadding="0" cellspacing="0" style="font-size:13px;margin-bottom:18px">${htmlRows(equipmentRows)}</table>

      ${
        streetTurn.note
          ? `<p style="font-size:13px;background:#F1F5F9;padding:10px 12px;border-radius:8px">
               <strong>Note from dispatch:</strong> ${escapeHtml(streetTurn.note)}</p>`
          : ""
      }

      <hr style="border:none;border-top:1px solid #E2E8F0;margin:18px 0" />

      <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.06em;color:#64748B">AGREEMENT TERMS</p>
      <ol style="font-size:13px;line-height:1.65;padding-left:18px;margin:0">
        ${clauses
          .map(
            (clause) =>
              `<li style="margin-bottom:10px"><strong>${escapeHtml(clause.heading)}</strong><br />${escapeHtml(clause.body)}</li>`,
          )
          .join("")}
      </ol>

      <hr style="border:none;border-top:1px solid #E2E8F0;margin:18px 0" />

      <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:.06em;color:#64748B">E-SIGNATURES</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;font-size:13px">
        <tr>
          <td style="vertical-align:top;width:50%;padding-right:12px">
            <p style="margin:0 0 4px"><strong>TRANSFEROR</strong><br />${escapeHtml(transferor.name)}</p>
            <p style="margin:0;color:#64748B;line-height:2">
              Signer name: ${escapeHtml(transferor.signerName || "____________________")}<br />
              Title: ${escapeHtml(transferor.signerTitle || "____________________")}<br />
              Date: ${escapeHtml(dateText)}
            </p>
          </td>
          <td style="vertical-align:top;width:50%">
            <p style="margin:0 0 4px"><strong>TRANSFEREE</strong><br />${escapeHtml(transferee.name)}</p>
            ${
              signedLines
                ? `<table cellpadding="0" cellspacing="0" style="font-size:13px">${htmlRows(signedLines)}</table>`
                : `<p style="margin:0;color:#64748B;line-height:2">
                     Signer name: ____________________<br />
                     Title: ____________________<br />
                     Signature: ____________________<br />
                     Date: ____________________
                   </p>`
            }
          </td>
        </tr>
      </table>

      ${
        signLink
          ? `<p style="margin:22px 0 8px">
               <a href="${escapeHtml(signLink)}"
                  style="display:inline-block;padding:13px 24px;border-radius:8px;background:#1D6FE0;color:#ffffff;font-weight:700;text-decoration:none">
                 Review and sign the agreement
               </a>
             </p>
             <p style="font-size:12px;color:#64748B">
               If the button does not work, paste this into your browser:<br />${escapeHtml(signLink)}
             </p>`
          : `<p style="font-size:12px;color:#64748B;margin-top:18px">
               You are receiving this as the ${escapeHtml(recipientLabel)}. No action is needed from you.
             </p>`
      }
    </div>
  `,
  };
};

/**
 * Sent back to the office once the street turn partner has signed. The proof is
 * the point, so the signer, the time and the IP are all stated.
 */
const streetTurnSigned = ({ load, streetTurn, signature }) => {
  const rows = [
    ["Load", load.loadId],
    ["Route", routeText(load)],
    ["Container #", load.containerNo],
    ["Street Turn Partner", streetTurn.deliveryPartner],
    ["Signed by", signature.signedName],
    ["Title", signature.signedTitle],
    ["Company", signature.company],
    ["Signed at", signature.signedAt ? new Date(signature.signedAt).toUTCString() : ""],
    ["IP address", signature.signedIp],
  ].filter(([, value]) => value);

  return {
    subject: `FMS - Street Turn Signed: Load ${load.loadId}`,
    text:
      `${signature.signedName} has signed the street turn acknowledgement for load ${load.loadId}.` +
      "\n\n" +
      rows.map(([label, value]) => `${label}: ${value}`).join("\n") +
      (signature.note ? `\n\nPartner note: ${signature.note}` : ""),
    html: `
    <h3>Street Turn Signed</h3>
    <p><strong>${escapeHtml(signature.signedName)}</strong> has signed the street turn
       acknowledgement for load <strong>${escapeHtml(load.loadId)}</strong>.</p>
    <table cellpadding="6" cellspacing="0" border="0">
      ${rows
        .map(
          ([label, value]) =>
            `<tr><td><strong>${escapeHtml(label)}</strong></td><td>${escapeHtml(value)}</td></tr>`,
        )
        .join("")}
    </table>
    ${signature.note ? `<p><strong>Partner note:</strong> ${escapeHtml(signature.note)}</p>` : ""}
    <p style="font-size:12px;color:#64748B">
      Executed electronically. Recorded from IP ${escapeHtml(signature.signedIp || "unknown")}.
    </p>
  `,
  };
};

/**
 * A load offered to a carrier because one of their drivers is near the pickup.
 *
 * States the payout, not the customer's price — that split is settled before
 * anybody is told anything, and what the customer pays is not the carrier's
 * business. States the deadline plainly too: an offer somebody reads after the
 * window closed is worse than one they never got.
 */
const instantDispatchOffer = ({
  load,
  carrierName,
  driverName,
  distanceMiles,
  payout,
  expiresAt,
}) => {
  const lane = [load.pickup?.city, load.drop?.city].filter(Boolean).join(" → ") || "See details";
  const money = `$${Number(payout).toLocaleString("en-US")}`;
  const deadline = new Date(expiresAt).toLocaleString("en-US");
  const truck = driverName ? `${driverName} is` : "Your nearest truck is";

  return {
    subject: `Load ${load.loadId} available near you — ${money}`,
    text:
      `${carrierName || "Hello"}, load ${load.loadId} (${lane}) is available. ` +
      `${truck} ${distanceMiles} miles from the pickup. You would be paid ${money}. ` +
      `First carrier to accept has it — this offer closes ${deadline}. ` +
      `Accept it from your Available Loads screen.`,
    html: `
      <p>Load <strong>${escapeHtml(load.loadId)}</strong> is available and one of your
        trucks is close to it.</p>
      <table cellpadding="6" style="border-collapse:collapse">
        <tr><td><strong>Lane</strong></td><td>${escapeHtml(lane)}</td></tr>
        <tr><td><strong>Nearest driver</strong></td><td>${escapeHtml(driverName || "—")} · ${escapeHtml(String(distanceMiles))} mi from pickup</td></tr>
        <tr><td><strong>You are paid</strong></td><td><strong>${escapeHtml(money)}</strong></td></tr>
        <tr><td><strong>Offer closes</strong></td><td>${escapeHtml(deadline)}</td></tr>
      </table>
      <p>The first carrier to accept has the load, so it may go before the deadline.
        Accept it from your <strong>Available Loads</strong> screen.</p>
      <p style="color:#666;font-size:12px">You are getting this because a driver on your
        roster reported a position near this pickup.</p>
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
  instantDispatchOffer,
  insuranceRequest,
  loadRequiresChanges,
  staffCredentials,
  streetTurnAgreement,
  streetTurnConfirmed,
  streetTurnSigned,
};
