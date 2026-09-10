const XLSX = require("xlsx");

// ─── The statement, as a spreadsheet ──────────────────────────────────────────
// The same statement of account the email renders as a table, attached as a
// real .xlsx file.
//
// ── Why a spreadsheet and not a PDF ──────────────────────────────────────────
// An invoice is a document: it is a fixed record of what was billed, and a PDF
// is right for it. A statement is not a document, it is a working list — the
// customer's accounts-payable clerk opens it to tick off what they have already
// paid, sort by due date, filter to what is overdue, and total the column that
// is left. All of that needs cells.
//
// So dates go in as Date objects and money as numbers, with a display format
// laid over the top. A statement whose amounts are strings like "$1,234.00"
// looks identical on screen and will not sum, which defeats the entire reason
// for sending a spreadsheet.
// ─────────────────────────────────────────────────────────────────────────────

const MONEY_FORMAT = '"$"#,##0.00';
const DATE_FORMAT = "mmm d, yyyy";

const HOUSE_NAME = "S Line Brokerage Inc.";

/** A figure Excel can add up. Anything unreadable becomes 0, never "" or NaN. */
const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** A real Date for Excel, or "" — an Invalid Date renders as a #VALUE! cell. */
const day = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date;
};

/** Lay a display format over one cell, if the cell exists and holds anything. */
const format = (sheet, row, column, mask) => {
  const ref = XLSX.utils.encode_cell({ r: row, c: column });
  const cell = sheet[ref];
  if (cell && cell.v !== "" && cell.v !== null && cell.v !== undefined) {
    cell.z = mask;
  }
};

const COLUMNS = [
  "Invoice",
  "Load #",
  "Date",
  "Due",
  "Total",
  "Outstanding",
  "Days overdue",
];

// Column positions, so the formatting below reads as what it is rather than as
// a row of magic numbers.
const COL = { INVOICE: 0, LOAD: 1, DATE: 2, DUE: 3, TOTAL: 4, OUTSTANDING: 5, AGE: 6 };

/**
 * Build the statement workbook.
 *
 * Takes exactly what the email template takes, so the attachment and the body
 * of the mail can never disagree about what is outstanding.
 *
 * @returns {Buffer} the .xlsx file
 */
const buildStatementWorkbook = ({
  customerName,
  rows = [],
  totals = {},
  aging,
  asOf = new Date(),
  issuer,
} = {}) => {
  const heading = [
    [issuer?.name || HOUSE_NAME],
    ["Statement of account"],
    [],
    ["Customer", customerName || ""],
    ["As at", day(asOf)],
    ["Total outstanding", num(totals.outstanding)],
    [],
  ];

  if (aging) {
    heading.push(["Aging", "Current", "1-30", "31-60", "61-90", "90+"]);
    heading.push([
      "",
      num(aging.current),
      num(aging.d1_30),
      num(aging.d31_60),
      num(aging.d61_90),
      num(aging.d90plus),
    ]);
    heading.push([]);
  }

  const headerRow = heading.length;

  const body = rows.map((row) => [
    row.invoiceNumber || "",
    row.loadId || "",
    day(row.issueDate),
    day(row.dueDate),
    num(row.total),
    num(row.balance),
    // 0 rather than "Current", so the column sorts and filters as a number.
    num(row.daysOverdue) > 0 ? num(row.daysOverdue) : 0,
  ]);

  // A blank line before the total, so it does not read as one more invoice and
  // does not get caught by a filter applied to the table above it.
  const totalRowIndex = headerRow + body.length + 2;
  const table = [COLUMNS, ...body, [], ["Total", "", "", "", "", num(totals.outstanding), ""]];

  const sheet = XLSX.utils.aoa_to_sheet([...heading, ...table], { cellDates: true });

  // ── Formats ───────────────────────────────────────────────────────────────
  format(sheet, 4, 1, DATE_FORMAT); // As at
  format(sheet, 5, 1, MONEY_FORMAT); // Total outstanding

  if (aging) {
    // The aging figures sit on the row after their labels, columns B..F.
    const agingRow = headerRow - 2;
    for (let column = 1; column <= 5; column += 1) {
      format(sheet, agingRow, column, MONEY_FORMAT);
    }
  }

  body.forEach((_, index) => {
    const row = headerRow + 1 + index;
    format(sheet, row, COL.DATE, DATE_FORMAT);
    format(sheet, row, COL.DUE, DATE_FORMAT);
    format(sheet, row, COL.TOTAL, MONEY_FORMAT);
    format(sheet, row, COL.OUTSTANDING, MONEY_FORMAT);
  });

  format(sheet, totalRowIndex, COL.OUTSTANDING, MONEY_FORMAT);

  sheet["!cols"] = [
    { wch: 16 }, // Invoice
    { wch: 12 }, // Load #
    { wch: 14 }, // Date
    { wch: 14 }, // Due
    { wch: 14 }, // Total
    { wch: 14 }, // Outstanding
    { wch: 14 }, // Days overdue
  ];

  // Freeze everything above and including the column headings, so the clerk
  // scrolling a hundred invoices can still see which column is which.
  sheet["!freeze"] = { xSplit: 0, ySplit: headerRow + 1 };

  // Filter buttons over the table only — not the heading block above it.
  const lastBodyRow = headerRow + body.length;
  if (body.length) {
    sheet["!autofilter"] = {
      ref: `${XLSX.utils.encode_cell({ r: headerRow, c: COL.INVOICE })}:${XLSX.utils.encode_cell({ r: lastBodyRow, c: COL.AGE })}`,
    };
  }

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Statement");

  return XLSX.write(book, { type: "buffer", bookType: "xlsx" });
};

/** A filename the customer can file without renaming it. */
const statementFilename = (customerName, asOf = new Date()) => {
  const date = day(asOf) || new Date();
  const stamp = date.toISOString().slice(0, 10);
  const who = String(customerName || "customer")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

  return `Statement_${who || "customer"}_${stamp}.xlsx`;
};

module.exports = {
  buildStatementWorkbook,
  statementFilename,
};
