// Paying several carrier bills in one run.
//
// The payables side of the register: the office ticks the carriers and drivers
// being paid this afternoon and records the lot as one act. Unlike receiving,
// there is no amount to divide — every bill ticked is settled in full — so what
// is being protected here is different: that each bill gets its own payment row
// against the right payee, that nothing already settled or void is quietly paid
// again, and that a single cheque number never ends up covering two payees.

const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const { connect, closeDatabase, clearDatabase } = require("./setup");
const { seed, TEST_LOCATION_ID } = require("./helpers/tenantTestContext");
const { withTenant } = require("../utils/tenantContext");
const Invoice = require("../models/Invoice");
const Payment = require("../models/Payment");

const STAFF_ID = new mongoose.Types.ObjectId();
const CARRIER_ID = new mongoose.Types.ObjectId();
const OTHER_CARRIER = new mongoose.Types.ObjectId();

jest.mock("../middleware/auth", () =>
  require("./helpers/tenantTestContext").authMock({ defaultRole: "admin" }),
);

jest.mock("../services/accountingMailService", () => ({
  sendReceipt: jest.fn().mockResolvedValue({ sent: true }),
  sendStatement: jest.fn().mockResolvedValue({ sent: true }),
  sendReminder: jest.fn().mockResolvedValue({ sent: true }),
  sendInvoice: jest.fn().mockResolvedValue({ sent: true }),
}));

const { settleBills } = require("../controllers/paymentController");

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = { _id: STAFF_ID, role: "admin", firstName: "Office" };
  req.locationId = TEST_LOCATION_ID;
  next();
});
app.post("/api/payments/settle", (req, res) =>
  withTenant({ locationId: TEST_LOCATION_ID }, () => settleBills(req, res)),
);

const DAY = 86400000;

/** An open AP bill for `total`, owed to `party`. */
const makeBill = ({
  number,
  loadId,
  total,
  dueInDays = 0,
  party = CARRIER_ID,
  payeeName = "Redline Carriers",
  status = "SENT",
  direction = "AP",
}) =>
  seed(() =>
    Invoice.create({
      invoiceNumber: number,
      direction,
      status,
      loadId,
      party: { kind: "CARRIER", id: party, name: payeeName },
      issueDate: new Date(Date.now() - 20 * DAY),
      dueDate: new Date(Date.now() + dueInDays * DAY),
      lines: [{ label: "Linehaul", amount: total }],
      subtotal: total,
      total,
      amountPaid: 0,
    }),
  );

const reload = (number) => seed(() => Invoice.findOne({ invoiceNumber: number }));

const settle = (body) => request(app).post("/api/payments/settle").send(body);

// ACH demands a trace number, like every method but cash — see
// config/paymentMethods.js. One payee, one trace number, which is the shape a
// run normally takes.
const base = { method: "ACH", documentNumber: "TRC-77", paidOn: "2026-09-10" };

// The one method that identifies nothing, so a run may span payees under it.
const cash = { method: "CASH", paidOn: "2026-09-10" };

const idsOf = async () => {
  const rows = await seed(() => Invoice.find({}).sort({ dueDate: 1 }).lean());
  return rows.map((row) => String(row._id));
};

beforeAll(async () => await connect());
afterEach(async () => {
  await clearDatabase();
  jest.clearAllMocks();
});
afterAll(async () => await closeDatabase());

describe("A payment run", () => {
  beforeEach(async () => {
    await makeBill({ number: "LD 0001-AP1", loadId: "LD 0001", total: 500, dueInDays: -8 });
    await makeBill({ number: "LD 0002-AP1", loadId: "LD 0002", total: 300, dueInDays: -3 });
  });

  it("pays every bill chosen in full", async () => {
    const ids = await idsOf();

    const res = await settle({ ...base, invoices: ids.map((id) => ({ invoice: id })) });

    expect(res.status).toBe(201);
    expect(res.body.total).toBe(800);

    for (const number of ["LD 0001-AP1", "LD 0002-AP1"]) {
      const bill = await reload(number);
      expect(bill.balance).toBe(0);
      expect(bill.status).toBe("PAID");
    }
  });

  it("writes one payment per bill, sharing a batch", async () => {
    const ids = await idsOf();

    await settle({ ...base, invoices: ids.map((id) => ({ invoice: id })) });

    const payments = await seed(() => Payment.find({}).lean());
    expect(payments).toHaveLength(2);
    // Every figure downstream is per bill — the balance on each, the load each
    // belongs to — so the run is two rows that know they travelled together.
    expect(new Set(payments.map((p) => p.batch?.id)).size).toBe(1);
    expect(payments.every((p) => p.direction === "PAID")).toBe(true);
  });

  it("counts the same bill ticked twice only once", async () => {
    const [first] = await idsOf();

    await settle({
      ...base,
      invoices: [{ invoice: first }, { invoice: first }],
    });

    const payments = await seed(() => Payment.find({}).lean());
    expect(payments).toHaveLength(1);

    const bill = await reload("LD 0001-AP1");
    expect(bill.amountPaid).toBe(500);
  });
});

describe("What it refuses", () => {
  const noPaymentsWritten = async () =>
    expect(await seed(() => Payment.countDocuments({}))).toBe(0);

  it("names the real problem when a run spans payees, not the missing number", async () => {
    await makeBill({ number: "LD 0010-AP1", loadId: "LD 0010", total: 200 });
    await makeBill({
      number: "LD 0011-AP1",
      loadId: "LD 0011",
      total: 150,
      party: OTHER_CARRIER,
      payeeName: "Gulf Drayage",
    });
    const ids = await idsOf();

    // No trace number supplied, and ACH demands one — but asking for it would
    // be asking for a number that could not be correct anyway.
    const res = await settle({
      method: "ACH",
      paidOn: "2026-09-10",
      invoices: ids.map((id) => ({ invoice: id })),
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/different payees/i);
    await noPaymentsWritten();
  });

  it("refuses a receivable — this side only pays bills", async () => {
    await makeBill({
      number: "LD 0003",
      loadId: "LD 0003",
      total: 400,
      direction: "AR",
    });
    const ids = await idsOf();

    const res = await settle({ ...base, invoices: ids.map((id) => ({ invoice: id })) });

    expect(res.status).toBe(404);
    await noPaymentsWritten();
  });

  it("refuses a bill that is already settled rather than paying it twice", async () => {
    await makeBill({ number: "LD 0004-AP1", loadId: "LD 0004", total: 200 });
    const ids = await idsOf();
    await settle({ ...base, invoices: [{ invoice: ids[0] }] });

    const res = await settle({ ...base, invoices: [{ invoice: ids[0] }] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already been paid/i);
    // The first run's single payment, and nothing added by the second.
    expect(await seed(() => Payment.countDocuments({}))).toBe(1);
  });

  it("refuses a void bill rather than silently skipping it", async () => {
    await makeBill({
      number: "LD 0005-AP1",
      loadId: "LD 0005",
      total: 200,
      status: "VOID",
    });
    const ids = await idsOf();

    const res = await settle({ ...base, invoices: ids.map((id) => ({ invoice: id })) });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/void/i);
    await noPaymentsWritten();
  });

  it("refuses one cheque number across two payees", async () => {
    await makeBill({ number: "LD 0006-AP1", loadId: "LD 0006", total: 200 });
    await makeBill({
      number: "LD 0007-AP1",
      loadId: "LD 0007",
      total: 150,
      party: OTHER_CARRIER,
      payeeName: "Gulf Drayage",
    });
    const ids = await idsOf();

    const res = await settle({
      method: "CHECK",
      documentNumber: "1001",
      paidOn: "2026-09-10",
      invoices: ids.map((id) => ({ invoice: id })),
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/different payees/i);
    await noPaymentsWritten();
  });

  it("allows one run across two payees when nothing identifies a single instrument", async () => {
    await makeBill({ number: "LD 0008-AP1", loadId: "LD 0008", total: 200 });
    await makeBill({
      number: "LD 0009-AP1",
      loadId: "LD 0009",
      total: 150,
      party: OTHER_CARRIER,
      payeeName: "Gulf Drayage",
    });
    const ids = await idsOf();

    const res = await settle({ ...cash, invoices: ids.map((id) => ({ invoice: id })) });

    expect(res.status).toBe(201);
    expect(res.body.total).toBe(350);
  });

  it("refuses an empty selection", async () => {
    const res = await settle({ ...base, invoices: [] });

    expect(res.status).toBe(400);
    await noPaymentsWritten();
  });
});
