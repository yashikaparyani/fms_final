// ─── Accounting emails ────────────────────────────────────────────────────────
// The four letters money actually needs: here is your bill, your bill is late,
// we have your payment, and here is everything outstanding on your account.
//
// Kept apart from services/emailTemplates.js because these are the only mails in
// the system that state a figure somebody is expected to act on. That earns them
// a shared, sober layout — a summary table, the amount due in a box, and a plain
// statement of what happens next — rather than the loose `<h3>` and `<p>` style
// the operational notifications use. A payment chaser that looks like a system
// alert gets treated like one.
//
// Every template returns { subject, text, html }: the text part is not a
// courtesy. Accounts-payable inboxes are full of filters, and a mail with no
// plain-text alternative scores as spam far more often than one with it.
// ─────────────────────────────────────────────────────────────────────────────

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const usd = (value) =>
  `$${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// Calendar dates, rendered in UTC — see utils/dates.js. A due date that reads
// differently in the mail from on the invoice attached to it is the fastest way
// to have the invoice queried.
const { formatDate } = require("../utils/dates");

// Inline styles throughout: every mail client of consequence still strips or
// mangles a <style> block, so a stylesheet here would render as a fallback
// nobody designed.
const S = {
  wrap: "font-family:Helvetica,Arial,sans-serif;color:#111827;max-width:620px;margin:0 auto;padding:24px;",
  h1: "font-size:18px;font-weight:700;margin:0 0 4px;",
  sub: "font-size:13px;color:#6b7280;margin:0 0 20px;",
  p: "font-size:14px;line-height:1.55;margin:0 0 14px;",
  table:
    "width:100%;border-collapse:collapse;font-size:13px;margin:0 0 18px;border:1px solid #e5e7eb;",
  th: "text-align:left;padding:8px 10px;background:#f3f4f6;font-weight:700;font-size:11px;letter-spacing:.4px;color:#374151;border-bottom:1px solid #e5e7eb;",
  td: "padding:8px 10px;border-bottom:1px solid #f3f4f6;",
  tdRight: "padding:8px 10px;border-bottom:1px solid #f3f4f6;text-align:right;",
  box: "background:#1d4ed8;color:#ffffff;border-radius:8px;padding:14px 18px;margin:0 0 18px;",
  boxLabel: "font-size:11px;letter-spacing:.6px;opacity:.85;margin:0 0 2px;",
  boxValue: "font-size:24px;font-weight:700;margin:0;",
  warnBox:
    "background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:8px;padding:14px 18px;margin:0 0 18px;",
  goodBox:
    "background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;border-radius:8px;padding:14px 18px;margin:0 0 18px;",
  foot: "font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px;margin-top:24px;",
};

/** Two-column facts under the heading — invoice number, dates, load reference. */
const factRows = (facts) =>
  facts
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(
      ([label, value]) =>
        `<tr><td style="${S.td};color:#6b7280;width:40%;">${escapeHtml(label)}</td>` +
        `<td style="${S.td};font-weight:600;">${escapeHtml(String(value))}</td></tr>`,
    )
    .join("");

const shell = ({ heading, subheading, body, issuer, note }) => `
  <div style="${S.wrap}">
    <p style="${S.h1}">${escapeHtml(heading)}</p>
    <p style="${S.sub}">${escapeHtml(subheading || "")}</p>
    ${
      // A covering note from whoever pressed send. Above the standard body so it
      // reads as the sender speaking, and escaped — it is free text typed by a
      // user and going into somebody else's mail client.
      note
        ? `<p style="${S.p}white-space:pre-line;">${escapeHtml(note)}</p>`
        : ""
    }
    ${body}
    <p style="${S.foot}">
      ${escapeHtml(issuer?.name || "S Line Brokerage Inc.")}
      ${issuer?.phone ? ` &middot; ${escapeHtml(issuer.phone)}` : ""}
      ${issuer?.email ? ` &middot; ${escapeHtml(issuer.email)}` : ""}
    </p>
  </div>
`;

// ─── 1. Here is your bill ─────────────────────────────────────────────────────

const invoiceIssued = ({ invoice, load, message }) => {
  const isAR = invoice.direction === "AR";
  const issuer = invoice.issuer || {};

  const heading = isAR
    ? `Invoice ${invoice.invoiceNumber}`
    : `Settlement ${invoice.invoiceNumber}`;

  const route =
    load?.pickup?.city && load?.drop?.city
      ? `${load.pickup.city}, ${load.pickup.state || ""} → ${load.drop.city}, ${load.drop.state || ""}`
      : "";

  const facts = [
    ["Invoice number", invoice.invoiceNumber],
    ["Load number", invoice.loadId],
    ["Reference", load?.refNo],
    ["Route", route],
    ["Invoice date", formatDate(invoice.issueDate)],
    ["Due date", formatDate(invoice.dueDate)],
  ];

  const lineRows = (invoice.lines || [])
    .filter((l) => l.kind !== "settlement")
    .map(
      (line) =>
        `<tr><td style="${S.td}">${escapeHtml(line.label)}` +
        (line.description
          ? `<br/><span style="color:#6b7280;font-size:12px;">${escapeHtml(line.description)}</span>`
          : "") +
        `</td><td style="${S.tdRight}">${usd(line.amount)}</td></tr>`,
    )
    .join("");

  const deductions = (invoice.lines || [])
    .filter((l) => l.kind === "settlement")
    .map(
      (line) =>
        `<tr><td style="${S.td};color:#6b7280;">${escapeHtml(line.label)}</td>` +
        `<td style="${S.tdRight};color:#6b7280;">− ${usd(line.amount)}</td></tr>`,
    )
    .join("");

  const body = `
    <table style="${S.table}">${factRows(facts)}</table>

    <table style="${S.table}">
      <tr><th style="${S.th}">Description</th><th style="${S.th};text-align:right;">Amount</th></tr>
      ${lineRows}
      <tr><td style="${S.td};font-weight:700;">Subtotal</td>
          <td style="${S.tdRight};font-weight:700;">${usd(invoice.subtotal)}</td></tr>
      ${deductions}
      ${
        invoice.amountPaid > 0
          ? `<tr><td style="${S.td};color:#6b7280;">Payments received</td><td style="${S.tdRight};color:#6b7280;">− ${usd(invoice.amountPaid)}</td></tr>`
          : ""
      }
    </table>

    <div style="${S.box}">
      <p style="${S.boxLabel}">${isAR ? "AMOUNT DUE" : "AMOUNT PAYABLE"}</p>
      <p style="${S.boxValue}">${usd(invoice.balance)}</p>
    </div>

    <p style="${S.p}">
      ${
        isAR
          ? `Payment is due by <strong>${escapeHtml(formatDate(invoice.dueDate))}</strong>. Please quote <strong>${escapeHtml(invoice.invoiceNumber)}</strong> on your remittance so we can match it against your account.`
          : `This settlement covers load <strong>${escapeHtml(invoice.loadId || "")}</strong> and is scheduled for payment by <strong>${escapeHtml(formatDate(invoice.dueDate))}</strong>.`
      }
    </p>
    ${invoice.memo ? `<p style="${S.p};color:#6b7280;">${escapeHtml(invoice.memo)}</p>` : ""}
    <p style="${S.p};color:#6b7280;font-size:13px;">The full ${isAR ? "invoice" : "settlement"} is attached as a PDF.</p>
  `;

  return {
    subject: `${isAR ? "Invoice" : "Settlement"} ${invoice.invoiceNumber} — ${usd(invoice.balance)} ${isAR ? "due" : "payable"} by ${formatDate(invoice.dueDate)}`,
    text:
      (message ? `${message}\n\n` : "") +
      `${heading}\n\n` +
      `Load: ${invoice.loadId || "—"}\n` +
      `Invoice date: ${formatDate(invoice.issueDate)}\n` +
      `Due date: ${formatDate(invoice.dueDate)}\n` +
      `Subtotal: ${usd(invoice.subtotal)}\n` +
      (invoice.advanceApplied ? `Less advance: ${usd(invoice.advanceApplied)}\n` : "") +
      (invoice.amountPaid ? `Less payments: ${usd(invoice.amountPaid)}\n` : "") +
      `${isAR ? "AMOUNT DUE" : "AMOUNT PAYABLE"}: ${usd(invoice.balance)}\n\n` +
      `Please quote ${invoice.invoiceNumber} on your remittance. The full document is attached.\n\n` +
      `${issuer.name || "S Line Brokerage Inc."}`,
    html: shell({
      heading,
      subheading: invoice.party?.name || "",
      body,
      issuer,
      note: message,
    }),
  };
};

// ─── 2. Your bill is late ─────────────────────────────────────────────────────
// Deliberately escalates in wording rather than in volume: the same facts, said
// more plainly the longer it goes on. A first reminder that already sounds like
// a final demand leaves nowhere to go on the second.

const REMINDER_TONE = [
  {
    upTo: 0,
    label: "Payment reminder",
    line: (invoice) =>
      `A friendly reminder that invoice ${invoice.invoiceNumber} falls due on ${formatDate(invoice.dueDate)}.`,
  },
  {
    upTo: 7,
    label: "Payment reminder",
    line: (invoice, days) =>
      `Invoice ${invoice.invoiceNumber} became due on ${formatDate(invoice.dueDate)} and is now ${days} day${days === 1 ? "" : "s"} past due.`,
  },
  {
    upTo: 30,
    label: "Overdue invoice",
    line: (invoice, days) =>
      `Invoice ${invoice.invoiceNumber} is now ${days} days overdue. Please arrange payment or let us know if something is holding it up.`,
  },
  {
    upTo: Infinity,
    label: "Final reminder",
    line: (invoice, days) =>
      `Invoice ${invoice.invoiceNumber} is ${days} days overdue and remains unpaid. Please treat this as a matter of priority and contact us if the invoice is disputed.`,
  },
];

const toneFor = (days) => REMINDER_TONE.find((t) => days <= t.upTo) || REMINDER_TONE[0];

const paymentReminder = ({ invoice, daysOverdue = 0 }) => {
  const issuer = invoice.issuer || {};
  const tone = toneFor(daysOverdue);
  const overdue = daysOverdue > 0;

  const facts = [
    ["Invoice number", invoice.invoiceNumber],
    ["Load number", invoice.loadId],
    ["Invoice date", formatDate(invoice.issueDate)],
    ["Due date", formatDate(invoice.dueDate)],
    ["Invoice total", usd(invoice.total)],
    invoice.amountPaid ? ["Paid to date", usd(invoice.amountPaid)] : null,
  ].filter(Boolean);

  const body = `
    <p style="${S.p}">${escapeHtml(tone.line(invoice, daysOverdue))}</p>

    <table style="${S.table}">${factRows(facts)}</table>

    <div style="${overdue ? S.warnBox : S.box}">
      <p style="${S.boxLabel}">${overdue ? `OUTSTANDING — ${daysOverdue} DAY${daysOverdue === 1 ? "" : "S"} OVERDUE` : "AMOUNT DUE"}</p>
      <p style="${S.boxValue}">${usd(invoice.balance)}</p>
    </div>

    <p style="${S.p}">
      Please quote <strong>${escapeHtml(invoice.invoiceNumber)}</strong> on your remittance.
      If this invoice has already been paid, or if there is a query on it, reply to this
      email and we will look into it straight away.
    </p>
  `;

  return {
    subject: `${tone.label}: ${invoice.invoiceNumber} — ${usd(invoice.balance)} outstanding${overdue ? ` (${daysOverdue} days overdue)` : ""}`,
    text:
      `${tone.line(invoice, daysOverdue)}\n\n` +
      `Invoice: ${invoice.invoiceNumber}\n` +
      `Load: ${invoice.loadId || "—"}\n` +
      `Due date: ${formatDate(invoice.dueDate)}\n` +
      `Outstanding: ${usd(invoice.balance)}\n\n` +
      `Please quote ${invoice.invoiceNumber} on your remittance. If this has already been paid, reply and let us know.\n\n` +
      `${issuer.name || "S Line Brokerage Inc."}`,
    html: shell({
      heading: tone.label,
      subheading: invoice.party?.name || "",
      body,
      issuer,
    }),
  };
};

// ─── 3. We have your payment ──────────────────────────────────────────────────
// Sent on every recorded payment, including partial ones. The receipt exists to
// close the loop: the payer knows the money landed, and the remaining balance is
// stated so a part payment does not read as a settled account.

const paymentReceipt = ({ payment, invoice, methodLabel, documentLabel }) => {
  const issuer = invoice?.issuer || {};
  const settled = (invoice?.balance || 0) <= 0;

  const facts = [
    ["Receipt number", payment.paymentNumber],
    ["Invoice number", payment.invoiceNumber],
    ["Load number", payment.loadId],
    ["Payment date", formatDate(payment.paidOn)],
    ["Method", methodLabel || payment.method],
    [documentLabel || "Reference", payment.documentNumber],
    payment.bankName ? ["Bank", payment.bankName] : null,
  ].filter(Boolean);

  const body = `
    <div style="${S.goodBox}">
      <p style="${S.boxLabel}">PAYMENT RECEIVED</p>
      <p style="${S.boxValue}">${usd(payment.amount)}</p>
    </div>

    <table style="${S.table}">${factRows(facts)}</table>

    <table style="${S.table}">
      <tr><td style="${S.td}">Invoice total</td><td style="${S.tdRight}">${usd(invoice?.total)}</td></tr>
      <tr><td style="${S.td}">Paid to date</td><td style="${S.tdRight}">${usd((invoice?.amountPaid || 0) + (invoice?.advanceApplied || 0))}</td></tr>
      <tr><td style="${S.td};font-weight:700;">${settled ? "Balance" : "Still outstanding"}</td>
          <td style="${S.tdRight};font-weight:700;color:${settled ? "#166534" : "#991b1b"};">${usd(invoice?.balance)}</td></tr>
    </table>

    <p style="${S.p}">
      ${
        settled
          ? `Thank you — invoice ${escapeHtml(payment.invoiceNumber)} is now paid in full.`
          : `Thank you. ${usd(invoice?.balance)} remains outstanding on invoice ${escapeHtml(payment.invoiceNumber)}, due ${escapeHtml(formatDate(invoice?.dueDate))}.`
      }
    </p>
  `;

  return {
    subject: `Payment received — ${usd(payment.amount)} against ${payment.invoiceNumber}`,
    text:
      `Payment received: ${usd(payment.amount)}\n\n` +
      `Receipt: ${payment.paymentNumber}\n` +
      `Invoice: ${payment.invoiceNumber}\n` +
      `Date: ${formatDate(payment.paidOn)}\n` +
      `Method: ${methodLabel || payment.method}\n` +
      `${documentLabel || "Reference"}: ${payment.documentNumber || "—"}\n\n` +
      (settled
        ? `Invoice ${payment.invoiceNumber} is now paid in full.`
        : `${usd(invoice?.balance)} remains outstanding.`) +
      `\n\n${issuer.name || "S Line Brokerage Inc."}`,
    html: shell({
      heading: "Payment received",
      subheading: payment.party?.name || "",
      body,
      issuer,
    }),
  };
};

// ─── 4. Everything outstanding on your account ────────────────────────────────
// The customer statement. One row per open invoice with its age, because a
// customer chasing their own accounts department needs to hand them a list, not
// a total.

const customerStatement = ({ customerName, rows, totals, asOf, issuer, aging }) => {
  const invoiceRows = rows
    .map(
      (row) =>
        `<tr>
          <td style="${S.td}">${escapeHtml(row.invoiceNumber)}</td>
          <td style="${S.td}">${escapeHtml(formatDate(row.issueDate))}</td>
          <td style="${S.td}">${escapeHtml(formatDate(row.dueDate))}</td>
          <td style="${S.tdRight}">${usd(row.total)}</td>
          <td style="${S.tdRight};color:${row.daysOverdue > 0 ? "#991b1b" : "#111827"};font-weight:600;">${usd(row.balance)}</td>
          <td style="${S.tdRight};color:#6b7280;">${row.daysOverdue > 0 ? `${row.daysOverdue}d` : "Current"}</td>
        </tr>`,
    )
    .join("");

  const agingRow = aging
    ? `<table style="${S.table}">
        <tr>
          <th style="${S.th}">Current</th><th style="${S.th}">1–30</th>
          <th style="${S.th}">31–60</th><th style="${S.th}">61–90</th><th style="${S.th}">90+</th>
        </tr>
        <tr>
          <td style="${S.td}">${usd(aging.current)}</td>
          <td style="${S.td}">${usd(aging.d1_30)}</td>
          <td style="${S.td}">${usd(aging.d31_60)}</td>
          <td style="${S.td}">${usd(aging.d61_90)}</td>
          <td style="${S.td};color:#991b1b;font-weight:700;">${usd(aging.d90plus)}</td>
        </tr>
      </table>`
    : "";

  const body = `
    <p style="${S.p}">Statement of account as at ${escapeHtml(formatDate(asOf))}.</p>

    <div style="${S.box}">
      <p style="${S.boxLabel}">TOTAL OUTSTANDING</p>
      <p style="${S.boxValue}">${usd(totals.outstanding)}</p>
    </div>

    ${agingRow}

    <table style="${S.table}">
      <tr>
        <th style="${S.th}">Invoice</th><th style="${S.th}">Date</th><th style="${S.th}">Due</th>
        <th style="${S.th};text-align:right;">Total</th>
        <th style="${S.th};text-align:right;">Outstanding</th>
        <th style="${S.th};text-align:right;">Age</th>
      </tr>
      ${invoiceRows || `<tr><td style="${S.td}" colspan="6">Nothing outstanding — thank you.</td></tr>`}
    </table>

    <p style="${S.p};color:#6b7280;font-size:13px;">
      ${rows.length} open invoice${rows.length === 1 ? "" : "s"}.
      Please quote the invoice number on each remittance so payments can be matched correctly.
    </p>
  `;

  return {
    subject: `Statement of account — ${usd(totals.outstanding)} outstanding as at ${formatDate(asOf)}`,
    text:
      `Statement of account for ${customerName}\n` +
      `As at ${formatDate(asOf)}\n\n` +
      rows
        .map(
          (row) =>
            `${row.invoiceNumber}  due ${formatDate(row.dueDate)}  total ${usd(row.total)}  outstanding ${usd(row.balance)}${row.daysOverdue > 0 ? `  (${row.daysOverdue}d overdue)` : ""}`,
        )
        .join("\n") +
      `\n\nTOTAL OUTSTANDING: ${usd(totals.outstanding)}\n\n` +
      `${issuer?.name || "S Line Brokerage Inc."}`,
    html: shell({
      heading: "Statement of account",
      subheading: customerName || "",
      body,
      issuer,
    }),
  };
};

module.exports = {
  invoiceIssued,
  paymentReminder,
  paymentReceipt,
  customerStatement,
  toneFor,
  usd,
  formatDate,
};
