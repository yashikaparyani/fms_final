// ─── The statement spreadsheet ────────────────────────────────────────────────
// The point of sending .xlsx rather than a PDF is that the customer's clerk can
// sort, filter and total it. That only holds if the cells carry numbers and
// dates rather than pre-formatted strings, so that is mostly what these check:
// not "does it contain $1,000" but "is the cell a number that adds up".
// ─────────────────────────────────────────────────────────────────────────────

const XLSX = require("xlsx");
const {
  buildStatementWorkbook,
  statementFilename,
} = require("../services/statementWorkbookService");

const ASOF = new Date("2026-09-10T12:00:00Z");

const rows = [
  {
    invoiceNumber: "LD 0001",
    loadId: "LD 0001",
    issueDate: new Date("2026-07-01T00:00:00Z"),
    dueDate: new Date("2026-07-31T00:00:00Z"),
    total: 1000,
    balance: 1000,
    daysOverdue: 41,
  },
  {
    invoiceNumber: "LD 0002",
    loadId: "LD 0002",
    issueDate: new Date("2026-08-20T00:00:00Z"),
    dueDate: new Date("2026-09-19T00:00:00Z"),
    total: 500,
    balance: 250,
    daysOverdue: 0,
  },
];

const aging = {
  current: 250,
  d1_30: 0,
  d31_60: 1000,
  d61_90: 0,
  d90plus: 0,
  total: 1250,
};

const build = (overrides = {}) =>
  buildStatementWorkbook({
    customerName: "Hub Intermodal",
    rows,
    totals: { outstanding: 1250 },
    aging,
    issuer: { name: "S Line Brokerage Inc." },
    asOf: ASOF,
    ...overrides,
  });

/** Read the workbook back the way Excel would. */
const reopen = (buffer) => {
  const book = XLSX.read(buffer, { type: "buffer", cellDates: true });
  return book.Sheets[book.SheetNames[0]];
};

const cellsOf = (sheet) =>
  Object.entries(sheet).filter(([ref]) => !ref.startsWith("!"));

describe("Building the statement workbook", () => {
  it("produces a real xlsx file", () => {
    const buffer = build();

    expect(Buffer.isBuffer(buffer)).toBe(true);
    // "PK" — every xlsx is a zip archive. A workbook written as anything else
    // opens as gibberish in Excel.
    expect(buffer.slice(0, 2).toString()).toBe("PK");
  });

  it("names its sheet Statement", () => {
    const book = XLSX.read(build(), { type: "buffer" });
    expect(book.SheetNames).toContain("Statement");
  });

  it("writes money as numbers, not as text", () => {
    const sheet = reopen(build());

    const money = cellsOf(sheet).filter(([, cell]) => cell.v === 1000);
    expect(money.length).toBeGreaterThan(0);
    // `t: "n"` is what makes SUM() work. A "$1,000.00" string looks identical
    // on screen and totals to zero.
    money.forEach(([, cell]) => expect(cell.t).toBe("n"));
  });

  it("writes dates as dates, not as text", () => {
    const sheet = reopen(build());

    const dates = cellsOf(sheet).filter(([, cell]) => cell.v instanceof Date);
    expect(dates.length).toBeGreaterThan(0);
  });

  it("carries every open invoice and its load", () => {
    const sheet = reopen(build());
    const values = cellsOf(sheet).map(([, cell]) => String(cell.v));

    expect(values).toContain("LD 0001");
    expect(values).toContain("LD 0002");
    expect(values).toContain("Hub Intermodal");
  });

  it("totals what the email says is outstanding", () => {
    const sheet = reopen(build());
    const numbers = cellsOf(sheet)
      .filter(([, cell]) => cell.t === "n")
      .map(([, cell]) => cell.v);

    // Once as the headline, once on the total row under the table.
    expect(numbers.filter((value) => value === 1250)).toHaveLength(2);
  });

  it("survives a customer with nothing but a name", () => {
    const buffer = buildStatementWorkbook({
      customerName: "Bare Co",
      rows: [],
      totals: {},
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    const values = cellsOf(reopen(buffer)).map(([, cell]) => String(cell.v));
    expect(values).toContain("Bare Co");
  });

  it("does not choke on an unreadable date or amount", () => {
    const buffer = build({
      rows: [
        {
          invoiceNumber: "LD 0003",
          loadId: "LD 0003",
          issueDate: "not a date",
          dueDate: null,
          total: undefined,
          balance: "oops",
          daysOverdue: null,
        },
      ],
    });

    const sheet = reopen(buffer);
    const values = cellsOf(sheet).map(([, cell]) => String(cell.v));
    expect(values).toContain("LD 0003");
    // An Invalid Date would surface as a #VALUE! cell in Excel.
    expect(values).not.toContain("Invalid Date");
    expect(values).not.toContain("NaN");
  });
});

describe("Naming the file", () => {
  it("stamps the customer and the date on it", () => {
    expect(statementFilename("Hub Intermodal", ASOF)).toBe(
      "Statement_Hub_Intermodal_2026-09-10.xlsx",
    );
  });

  it("strips what a filesystem would refuse", () => {
    const name = statementFilename('A/B\\C:"*?<>|D', ASOF);

    expect(name).toMatch(/^Statement_[\w.-]+_2026-09-10\.xlsx$/);
    expect(name).not.toMatch(/[/\\:"*?<>|]/);
  });

  it("still names a file when the customer has none", () => {
    expect(statementFilename("", ASOF)).toBe("Statement_customer_2026-09-10.xlsx");
  });
});
