// Receiving one payment against several loads.
//
// A customer settles six loads with one transfer. That is one movement of money
// and six invoices, so it writes six payment rows sharing a batch id — because
// every figure downstream is per invoice: the balance on each, the aging bucket
// each falls into, the load each belongs to.
//
// What is being protected is that the money lands where the screen said it
// would. The split is previewed per load before it is committed, so the server
// has to apply exactly that split, refuse anything that would overpay a load,
// and write nothing at all when any row is bad — a batch that half-applies
// leaves a customer's balance wrong in a way nobody can see.

const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const { connect, closeDatabase, clearDatabase } = require("./setup");
const { seed, TEST_LOCATION_ID } = require("./helpers/tenantTestContext");
const { withTenant } = require("../utils/tenantContext");
const Invoice = require("../models/Invoice");
const Payment = require("../models/Payment");

const STAFF_ID = new mongoose.Types.ObjectId();
const CUSTOMER_ID = new mongoose.Types.ObjectId();
const OTHER_CUSTOMER = new mongoose.Types.ObjectId();

jest.mock("../middleware/auth", () =>
  require("./helpers/tenantTestContext").authMock({ defaultRole: "admin" }),
);

// Receipts are a courtesy the dialog can ask for; nothing here is about email.
jest.mock("../services/accountingMailService", () => ({
  sendReceipt: jest.fn().mockResolvedValue({ sent: true }),
  sendStatement: jest.fn().mockResolvedValue({ sent: true }),
  sendReminder: jest.fn().mockResolvedValue({ sent: true }),
  sendInvoice: jest.fn().mockResolvedValue({ sent: true }),
}));

const { receivePayment } = require("../controllers/paymentController");

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = { _id: STAFF_ID, role: "admin", firstName: "Office" };
  req.locationId = TEST_LOCATION_ID;
  next();
});
app.post("/api/payments/receive", (req, res) =>
  withTenant({ locationId: TEST_LOCATION_ID }, () => receivePayment(req, res)),
);

const DAY = 86400000;

/** An open AR invoice for `total`, due `dueInDays` from now. */
const makeInvoice = ({ number, loadId, total, dueInDays = 0, party = CUSTOMER_ID, status = "SENT" }) =>
  seed(() =>
    Invoice.create({
      invoiceNumber: number,
      direction: "AR",
      status,
      loadId,
      party: { kind: "CUSTOMER", id: party, name: "Hub Intermodal" },
      issueDate: new Date(Date.now() - 30 * DAY),
      dueDate: new Date(Date.now() + dueInDays * DAY),
      lines: [{ label: "Linehaul", amount: total }],
      subtotal: total,
      total,
      amountPaid: 0,
    }),
  );

const reload = (number) => seed(() => Invoice.findOne({ invoiceNumber: number }));

const receive = (body) => request(app).post("/api/payments/receive").send(body);

const base = { method: "CHECK", documentNumber: "1001", paidOn: "2026-09-10" };

beforeAll(async () => await connect());
afterEach(async () => {
  await clearDatabase();
  jest.clearAllMocks();
});
afterAll(async () => await closeDatabase());

describe("Splitting one payment across loads", () => {
  beforeEach(async () => {
    // Oldest debt first, which is the order a payment normally clears.
    await makeInvoice({ number: "LD 0001", loadId: "LD 0001", total: 500, dueInDays: -20 });
    await makeInvoice({ number: "LD 0002", loadId: "LD 0002", total: 300, dueInDays: -10 });
    await makeInvoice({ number: "LD 0003", loadId: "LD 0003", total: 200, dueInDays: 5 });
  });

  const ids = async () => {
    const rows = await seed(() => Invoice.find({}).sort({ dueDate: 1 }).lean());
    return rows.map((row) => String(row._id));
  };

  it("clears every load when the whole balance is paid", async () => {
    const [a, b, c] = await ids();

    const res = await receive({ ...base, amount: 1000, invoices: [a, b, c] });

    expect(res.status).toBe(201);
    expect(res.body.cleared).toBe(3);
    expect((await reload("LD 0001")).balance).toBe(0);
    expect((await reload("LD 0002")).balance).toBe(0);
    expect((await reload("LD 0003")).balance).toBe(0);
  });

  it("fills the oldest first, leaving whole loads settled", async () => {
    const [a, b, c] = await ids();

    // $600 over three loads: clears the $500, part-pays the $300, nothing left.
    await receive({ ...base, amount: 600, invoices: [a, b, c] });

    expect((await reload("LD 0001")).balance).toBe(0);
    expect((await reload("LD 0002")).balance).toBe(200);
    expect((await reload("LD 0003")).balance).toBe(200);
  });

  it("spreads by size when asked to", async () => {
    const [a, b, c] = await ids();

    // Half of everything: each load takes half its balance.
    await receive({
      ...base,
      amount: 500,
      strategy: "PROPORTIONAL",
      invoices: [a, b, c],
    });

    expect((await reload("LD 0001")).balance).toBe(250);
    expect((await reload("LD 0002")).balance).toBe(150);
    expect((await reload("LD 0003")).balance).toBe(100);
  });

  it("applies exactly the amounts it is given", async () => {
    const [a, b, c] = await ids();

    const res = await receive({
      ...base,
      invoices: [
        { invoice: a, amount: 100 },
        { invoice: b, amount: 300 },
        { invoice: c, amount: 0 },
      ],
    });

    expect(res.body.total).toBe(400);
    expect((await reload("LD 0001")).balance).toBe(400);
    expect((await reload("LD 0002")).balance).toBe(0);
    expect((await reload("LD 0003")).balance).toBe(200);
  });

  it("writes one row per load, all carrying the same batch", async () => {
    const [a, b, c] = await ids();

    await receive({ ...base, amount: 1000, invoices: [a, b, c] });

    const payments = await seed(() => Payment.find({}).lean());
    expect(payments).toHaveLength(3);

    const batches = new Set(payments.map((p) => p.batch?.id));
    expect(batches.size).toBe(1);
    // The total the customer actually sent, on every row — so a reversal of one
    // cannot make the batch look like it was always for less.
    expect(payments.every((p) => p.batch.total === 1000)).toBe(true);
    expect(payments.every((p) => p.batch.count === 3)).toBe(true);
  });
});

describe("What it refuses", () => {
  beforeEach(async () => {
    await makeInvoice({ number: "LD 0001", loadId: "LD 0001", total: 500, dueInDays: -20 });
    await makeInvoice({ number: "LD 0002", loadId: "LD 0002", total: 300, dueInDays: -10 });
  });

  const ids = async () => {
    const rows = await seed(() => Invoice.find({}).sort({ dueDate: 1 }).lean());
    return rows.map((row) => String(row._id));
  };

  const noPaymentsWritten = async () =>
    expect(await seed(() => Payment.countDocuments({}))).toBe(0);

  it("refuses more than the loads chosen actually owe", async () => {
    const [a, b] = await ids();

    const res = await receive({ ...base, amount: 1200, invoices: [a, b] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/more than/i);
    await noPaymentsWritten();
  });

  it("refuses to overpay a single load", async () => {
    const [a, b] = await ids();

    const res = await receive({
      ...base,
      invoices: [
        { invoice: a, amount: 900 },
        { invoice: b, amount: 100 },
      ],
    });

    expect(res.status).toBe(400);
    // Nothing at all is written — a batch that half-applies leaves the
    // customer's balance wrong in a way nobody can see.
    await noPaymentsWritten();
  });

  it("refuses to mix two customers into one payment", async () => {
    await makeInvoice({
      number: "LD 0009",
      loadId: "LD 0009",
      total: 100,
      party: OTHER_CUSTOMER,
    });
    const all = await ids();

    const res = await receive({ ...base, amount: 200, invoices: all });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/different customers/i);
    await noPaymentsWritten();
  });

  it("refuses a void invoice rather than silently skipping it", async () => {
    await makeInvoice({
      number: "LD 0007",
      loadId: "LD 0007",
      total: 100,
      status: "VOID",
    });
    const all = await ids();

    const res = await receive({ ...base, amount: 100, invoices: all });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/void/i);
    await noPaymentsWritten();
  });

  it("insists on the cheque number a cheque needs", async () => {
    const [a] = await ids();

    const res = await receive({
      method: "CHECK",
      documentNumber: "",
      amount: 100,
      invoices: [a],
    });

    expect(res.status).toBe(400);
    await noPaymentsWritten();
  });

  it("needs at least one load", async () => {
    const res = await receive({ ...base, amount: 100, invoices: [] });

    expect(res.status).toBe(400);
    await noPaymentsWritten();
  });
});

// The same load named twice in one payment. Each row used to be checked against
// that invoice's full balance on its own, so two rows that were fine separately
// and impossible together both got through — and the no-amount path counted the
// duplicate's balance twice, lifting the very ceiling meant to catch it.
describe("The same load named twice", () => {
  beforeEach(async () => {
    await makeInvoice({ number: "LD 0001", loadId: "LD 0001", total: 500, dueInDays: -20 });
    await makeInvoice({ number: "LD 0002", loadId: "LD 0002", total: 300, dueInDays: -10 });
  });

  const ids = async () => {
    const rows = await seed(() => Invoice.find({}).sort({ dueDate: 1 }).lean());
    return rows.map((row) => String(row._id));
  };

  const noPaymentsWritten = async () =>
    expect(await seed(() => Payment.countDocuments({}))).toBe(0);

  it("refuses two lines that together overpay one load", async () => {
    const [a] = await ids();

    const res = await receive({
      ...base,
      invoices: [
        { invoice: a, amount: 400 },
        { invoice: a, amount: 400 },
      ],
    });

    expect(res.status).toBe(400);
    await noPaymentsWritten();
  });

  it("adds up two lines that name the same load", async () => {
    const [a] = await ids();

    const res = await receive({
      ...base,
      invoices: [
        { invoice: a, amount: 200 },
        { invoice: a, amount: 150 },
      ],
    });

    expect(res.status).toBe(201);

    // One load, so one receipt — not one per line naming it.
    const payments = await seed(() => Payment.find({}).lean());
    expect(payments).toHaveLength(1);
    expect(payments[0].amount).toBe(350);

    const invoice = await reload("LD 0001");
    expect(invoice.amountPaid).toBe(350);
    expect(invoice.balance).toBe(150);
  });

  it("does not let a duplicate inflate what the payment may exceed", async () => {
    const [a] = await ids();

    // One load owing $500, named twice. The ceiling is $500, not $1,000.
    const res = await receive({ ...base, amount: 900, invoices: [a, a] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/more than/i);
    await noPaymentsWritten();
  });

  it("settles a duplicated load once, to its real balance", async () => {
    const [a] = await ids();

    const res = await receive({ ...base, amount: 500, invoices: [a, a] });

    expect(res.status).toBe(201);

    const payments = await seed(() => Payment.find({}).lean());
    expect(payments).toHaveLength(1);

    const invoice = await reload("LD 0001");
    expect(invoice.amountPaid).toBe(500);
    expect(invoice.balance).toBe(0);
  });
});

describe("The customer's position afterwards", () => {
  it("moves paid and outstanding together", async () => {
    await makeInvoice({ number: "LD 0001", loadId: "LD 0001", total: 500, dueInDays: -20 });
    await makeInvoice({ number: "LD 0002", loadId: "LD 0002", total: 300, dueInDays: -10 });

    const rows = await seed(() => Invoice.find({}).sort({ dueDate: 1 }).lean());
    const ids = rows.map((row) => String(row._id));

    await receive({ ...base, amount: 650, invoices: ids });

    const after = await seed(() => Invoice.find({}).lean());
    const paid = after.reduce((sum, i) => sum + i.amountPaid, 0);
    const open = after.reduce((sum, i) => sum + i.balance, 0);

    expect(paid).toBe(650);
    expect(open).toBe(150);
    // The two still add up to what was billed, which is the invariant every
    // customer-facing figure rests on.
    expect(paid + open).toBe(800);
  });
});
