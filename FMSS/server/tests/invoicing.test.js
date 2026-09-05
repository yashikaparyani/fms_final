// Raising invoices off a load, recording payments against them, and the reports
// built on both.
//
// Three rules are checked from several directions because getting any of them
// wrong is silently wrong rather than loudly wrong:
//
//   1. An invoice is a snapshot. Once sent, editing the ledger must not change
//      it under the person holding it.
//   2. `amountPaid` is always re-added from the Payment collection, never
//      incremented — so a reversal lands on the right number rather than a
//      number that has drifted.
//   3. A payment without its document number is not a payment. A cheque with no
//      cheque number cannot be matched to a bank statement, which is the only
//      reason to keep the row.

const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const { connect, closeDatabase, clearDatabase } = require("./setup");
const { getJwtSecret } = require("../utils/jwtSecret");
const { runUnscoped, withTenant } = require("../utils/tenantContext");
const { resetBranchCodeCache } = require("../utils/sequence");

const User = require("../models/User");
const Branch = require("../models/Branch");
const Load = require("../models/Load");
const Invoice = require("../models/Invoice");
const Payment = require("../models/Payment");
const FleetOwner = require("../models/FleetOwner");

const accountingRoutes = require("../routes/accountingRoutes");
const invoiceRoutes = require("../routes/invoiceRoutes");
const paymentRoutes = require("../routes/paymentRoutes");
const { isDueForReminder } = require("../services/reminderService");
const { validatePaymentReference } = require("../config/paymentMethods");
const { renderInvoicePdf } = require("../services/invoiceDocumentService");

const app = express();
app.use(express.json());
app.use("/api/accounting", accountingRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/payments", paymentRoutes);

const tokenFor = (user) => jwt.sign({ id: user._id }, getJwtSecret());

const call = (method, path, user, branch) => {
  const req = request(app)[method](path);
  if (user) req.set("Authorization", `Bearer ${tokenFor(user)}`);
  if (branch) req.set("x-location-id", String(branch._id));
  return req;
};

beforeAll(async () => await connect());
afterEach(async () => {
  await clearDatabase();
  resetBranchCodeCache();
});
afterAll(async () => await closeDatabase());

let ny;
let staff;
let load;
let customerUser;

const newLoad = (overrides = {}) =>
  withTenant({ locationId: String(ny._id) }, () =>
    Load.create({
      createdBy: "staff",
      customer: customerUser._id,
      customerName: "Acme Imports",
      truckType: "Container",
      material: "Boxes",
      amount: 0,
      ...overrides,
    }),
  );

/** Put charges on a load through the API, the way the office does. */
const setLedger = (side, lines) =>
  call("put", `/api/accounting/loads/${load.loadId}/${side}`, staff, ny).send({ lines });

const generate = (body = {}) =>
  call("post", `/api/invoices/loads/${load.loadId}/generate`, staff, ny).send(body);

beforeEach(async () => {
  await runUnscoped(async () => {
    ny = await Branch.create({
      name: "New York",
      code: "NY",
      address: "1200 Harbor Blvd",
      city: "Newark",
      state: "NJ",
      zip: "07114",
      phone: "(201) 555-0142",
      email: "ar@sline.test",
    });
  });

  staff = await User.create({
    email: "office@fms.com",
    password: "password123",
    role: "staff",
    locations: [ny._id],
    defaultLocation: ny._id,
    permissions: ["loads.view", "loads.edit", "reports.view"],
  });

  customerUser = await User.create({
    email: "ap@acme.test",
    password: "password123",
    role: "client",
    firstName: "Acme",
    lastName: "Imports",
    locations: [ny._id],
  });

  load = await newLoad();
});

// ─── Raising the documents ────────────────────────────────────────────────────

describe("Raising invoices from a load", () => {
  it("numbers the customer invoice as the load itself", async () => {
    // The rule the office asked for: one number quoted on the board, the bill
    // and the remittance, so nobody has to translate between two schemes.
    await setLedger("receivables", [
      { chargeType: "linehaul", amount: 1450 },
      { chargeType: "fuelSurcharge", amount: 217.5 },
    ]);

    const res = await generate();

    expect(res.status).toBe(200);
    expect(res.body.customerInvoice.invoiceNumber).toBe(load.loadId);
    expect(res.body.customerInvoice.direction).toBe("AR");
    expect(res.body.customerInvoice.total).toBe(1667.5);
    expect(res.body.customerInvoice.balance).toBe(1667.5);
  });

  it("refuses to bill a load with nothing on its receivables", async () => {
    const res = await generate({ sides: ["AR"] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/receivable/i);
  });

  it("keeps an advance off the total and takes it off the balance", async () => {
    // The same rule as the ledger, carried onto the document. An advance summed
    // into the invoice total would over-bill the customer by the amount they had
    // already paid.
    await setLedger("receivables", [
      { chargeType: "linehaul", amount: 1000 },
      { chargeType: "advance", amount: 400 },
    ]);

    const res = await generate();
    const invoice = res.body.customerInvoice;

    expect(invoice.total).toBe(1000);
    expect(invoice.advanceApplied).toBe(400);
    expect(invoice.balance).toBe(600);
    expect(invoice.status).toBe("PARTIAL");
  });

  it("raises one carrier bill per leg, each holding only that carrier's costs", async () => {
    // The split-load case. Two carriers on one load are owed two different
    // amounts, and neither may see the other's rate.
    const [north, south] = await withTenant({ locationId: String(ny._id) }, () =>
      Promise.all([
        FleetOwner.create({ carrierName: "Northline Trucking", status: "ACTIVE" }),
        FleetOwner.create({ carrierName: "Southbound Freight", status: "ACTIVE" }),
      ]),
    );

    load.assignments = [
      { fleetOwnerId: north._id, fleetOwnerName: "Northline Trucking", carrierRate: 600 },
      { fleetOwnerId: south._id, fleetOwnerName: "Southbound Freight", carrierRate: 450 },
    ];
    await withTenant({ locationId: String(ny._id) }, () => load.save());

    await setLedger("receivables", [{ chargeType: "linehaul", amount: 1500 }]);
    await setLedger("payables", [
      { chargeType: "linehaul", amount: 600, fleetOwnerId: String(north._id) },
      { chargeType: "linehaul", amount: 450, fleetOwnerId: String(south._id) },
      { chargeType: "detention", amount: 75, fleetOwnerId: String(south._id) },
    ]);

    const res = await generate();

    expect(res.status).toBe(200);
    expect(res.body.carrierBills).toHaveLength(2);

    const numbers = res.body.carrierBills.map((b) => b.invoiceNumber);
    expect(numbers).toEqual([`${load.loadId}-AP1`, `${load.loadId}-AP2`]);

    const northBill = res.body.carrierBills.find(
      (b) => b.party.name === "Northline Trucking",
    );
    const southBill = res.body.carrierBills.find(
      (b) => b.party.name === "Southbound Freight",
    );

    expect(northBill.total).toBe(600);
    expect(southBill.total).toBe(525);

    // Neither bill carries the other carrier's lines.
    expect(northBill.lines).toHaveLength(1);
    expect(southBill.lines).toHaveLength(2);
  });

  it("bills the agreed leg rate when nobody has costed the leg yet", async () => {
    // A $0 bill on a leg everybody knows costs $900 is the number that then
    // flows into the margin on every report.
    const carrier = await withTenant({ locationId: String(ny._id) }, () =>
      FleetOwner.create({ carrierName: "Northline Trucking", status: "ACTIVE" }),
    );

    load.assignments = [
      { fleetOwnerId: carrier._id, fleetOwnerName: "Northline Trucking", carrierRate: 900 },
    ];
    await withTenant({ locationId: String(ny._id) }, () => load.save());

    await setLedger("receivables", [{ chargeType: "linehaul", amount: 1500 }]);

    const res = await generate();

    expect(res.body.carrierBills).toHaveLength(1);
    expect(res.body.carrierBills[0].total).toBe(900);
  });

  it("refreshes drafts instead of raising a second set when pressed twice", async () => {
    // The natural workflow is generate, spot a missing charge, fix, generate
    // again. Answering that with a second invoice leaves the office deciding by
    // hand which one is real.
    await setLedger("receivables", [{ chargeType: "linehaul", amount: 1000 }]);
    await generate();

    await setLedger("receivables", [
      { chargeType: "linehaul", amount: 1000 },
      { chargeType: "detention", amount: 150 },
    ]);
    const second = await generate();

    expect(second.body.customerInvoice.total).toBe(1150);

    const count = await withTenant({ locationId: String(ny._id) }, () =>
      Invoice.countDocuments({ loadId: load.loadId, direction: "AR" }),
    );
    expect(count).toBe(1);
  });

  it("turns the driver's pay into its own payable bill", async () => {
    await setLedger("receivables", [{ chargeType: "linehaul", amount: 1000 }]);

    await withTenant({ locationId: String(ny._id) }, async () => {
      load.accounting.payroll = {
        driverName: "Ray Mott",
        payType: "FLAT",
        rate: 250,
        amount: 250,
        calculatedAt: new Date(),
      };
      load.markModified("accounting.payroll");
      await load.save();
    });

    const res = await generate();

    expect(res.body.driverBill).toBeTruthy();
    expect(res.body.driverBill.party.kind).toBe("DRIVER");
    expect(res.body.driverBill.party.name).toBe("Ray Mott");
    expect(res.body.driverBill.total).toBe(250);
  });
});

// ─── The snapshot rule ────────────────────────────────────────────────────────

describe("An invoice is frozen once it leaves the building", () => {
  const markSent = (id) =>
    withTenant({ locationId: String(ny._id) }, async () => {
      const invoice = await Invoice.findById(id);
      invoice.sentAt = new Date();
      invoice.sentTo = "ap@acme.test";
      await invoice.save();
      return invoice;
    });

  it("does not rewrite a sent invoice when the ledger changes", async () => {
    await setLedger("receivables", [{ chargeType: "linehaul", amount: 1000 }]);
    const first = await generate();
    await markSent(first.body.customerInvoice._id);

    // A rate correction after the fact must not silently change a bill the
    // customer is already holding.
    await setLedger("receivables", [{ chargeType: "linehaul", amount: 1475 }]);
    const second = await generate();

    expect(second.body.customerInvoice.total).toBe(1000);
    expect(second.body.customerInvoice.status).toBe("SENT");
  });

  it("refuses to edit a sent invoice and names the alternative", async () => {
    await setLedger("receivables", [{ chargeType: "linehaul", amount: 1000 }]);
    const created = await generate();
    const invoice = await markSent(created.body.customerInvoice._id);

    const res = await call("put", `/api/invoices/${invoice._id}`, staff, ny).send({
      lines: [{ label: "Gross Amount", kind: "linehaul", amount: 5000 }],
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/void it and raise a new one/i);
  });

  it("edits a draft freely", async () => {
    await setLedger("receivables", [{ chargeType: "linehaul", amount: 1000 }]);
    const created = await generate();

    const res = await call(
      "put",
      `/api/invoices/${created.body.customerInvoice._id}`,
      staff,
      ny,
    ).send({
      lines: [
        { label: "Gross Amount", kind: "linehaul", amount: 1000 },
        { label: "Storage", kind: "accessorial", quantity: 3, rate: 40 },
      ],
    });

    expect(res.status).toBe(200);
    // Quantity × rate is done for the user when no amount is typed.
    expect(res.body.invoice.total).toBe(1120);
  });
});

// ─── Payments ─────────────────────────────────────────────────────────────────

describe("Recording payments", () => {
  let invoiceId;

  beforeEach(async () => {
    await setLedger("receivables", [{ chargeType: "linehaul", amount: 1000 }]);
    const res = await generate({ sides: ["AR"] });
    invoiceId = res.body.customerInvoice._id;
  });

  const pay = (body) =>
    call("post", "/api/payments", staff, ny).send({ invoice: invoiceId, ...body });

  it("requires the cheque number on a cheque payment", async () => {
    // Without it the row cannot be matched against a bank statement, which is
    // the only reason to keep the row.
    const res = await pay({ amount: 400, method: "CHECK" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cheque number is required/i);
  });

  it("does not demand a reference for cash", async () => {
    // Cash is the one method with nothing issued by a third party to quote.
    // Asking anyway would only produce an invented number.
    const res = await pay({ amount: 100, method: "CASH" });

    expect(res.status).toBe(201);
  });

  it("applies a part payment and leaves the rest outstanding", async () => {
    const res = await pay({ amount: 400, method: "CHECK", documentNumber: "100482" });

    expect(res.status).toBe(201);
    expect(res.body.invoice.amountPaid).toBe(400);
    expect(res.body.invoice.balance).toBe(600);
    expect(res.body.invoice.status).toBe("PARTIAL");
    expect(res.body.payment.documentLabel).toBe("Cheque Number");
  });

  it("marks the invoice paid when the balance reaches zero", async () => {
    await pay({ amount: 400, method: "CHECK", documentNumber: "100482" });
    const res = await pay({ amount: 600, method: "ACH", documentNumber: "0210000212345" });

    expect(res.body.invoice.balance).toBe(0);
    expect(res.body.invoice.status).toBe("PAID");
  });

  it("refuses a payment larger than the balance", async () => {
    // Almost always a typo or a payment applied to the wrong invoice. Accepting
    // it creates a negative balance every report then has to special-case.
    const res = await pay({ amount: 1500, method: "CHECK", documentNumber: "100482" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/more than the \$1,000/i);
  });

  it("puts the invoice back to outstanding when a payment is reversed", async () => {
    const first = await pay({ amount: 400, method: "CHECK", documentNumber: "100482" });
    const second = await pay({ amount: 600, method: "CASH" });

    expect(second.body.invoice.status).toBe("PAID");

    const res = await call(
      "put",
      `/api/payments/${first.body.payment._id}/reverse`,
      staff,
      ny,
    ).send({ reason: "Cheque returned unpaid" });

    expect(res.status).toBe(200);
    // Re-added from the collection, not decremented — 600 of live payments left.
    expect(res.body.invoice.amountPaid).toBe(600);
    expect(res.body.invoice.balance).toBe(400);
    expect(res.body.invoice.status).toBe("PARTIAL");
  });

  it("keeps the reversed payment on the record rather than deleting it", async () => {
    const first = await pay({ amount: 400, method: "CHECK", documentNumber: "100482" });

    await call("put", `/api/payments/${first.body.payment._id}/reverse`, staff, ny).send({
      reason: "Cheque returned unpaid",
    });

    const still = await withTenant({ locationId: String(ny._id) }, () =>
      Payment.findById(first.body.payment._id),
    );

    expect(still).toBeTruthy();
    expect(still.reversedReason).toBe("Cheque returned unpaid");
  });

  it("demands a reason before reversing", async () => {
    const first = await pay({ amount: 400, method: "CHECK", documentNumber: "100482" });

    const res = await call(
      "put",
      `/api/payments/${first.body.payment._id}/reverse`,
      staff,
      ny,
    ).send({});

    expect(res.status).toBe(400);
  });

  it("refuses to void an invoice while a payment stands against it", async () => {
    await pay({ amount: 400, method: "CHECK", documentNumber: "100482" });

    const res = await call("put", `/api/invoices/${invoiceId}/void`, staff, ny).send({
      reason: "Billed in error",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/reverse it before voiding/i);
  });
});

// ─── Manual invoices ──────────────────────────────────────────────────────────

describe("Invoices typed by hand", () => {
  it("numbers a manual invoice from its own branch series", async () => {
    const res = await call("post", "/api/invoices/manual", staff, ny).send({
      direction: "AR",
      party: { kind: "CUSTOMER", name: "Walk-in Shipper", email: "ap@walkin.test" },
      lines: [
        { label: "Storage", kind: "accessorial", quantity: 5, rate: 40 },
        { label: "Administration fee", kind: "accessorial", amount: 75 },
      ],
      terms: "NET_15",
    });

    expect(res.status).toBe(201);
    // Obvious on the register that this one was typed rather than derived.
    expect(res.body.invoice.invoiceNumber).toBe("NY-MI-0001");
    expect(res.body.invoice.kind).toBe("MANUAL");
    expect(res.body.invoice.total).toBe(275);
  });

  it("totals a hand-typed line that has no charge type in the catalog", async () => {
    // The reason invoice lines total by their own `kind`: a free-text line has
    // no catalog entry to look a kind up in, and totalling by charge type would
    // silently value it at zero.
    const res = await call("post", "/api/invoices/manual", staff, ny).send({
      party: { name: "Walk-in Shipper" },
      lines: [{ label: "Consulting on customs paperwork", amount: 300 }],
    });

    expect(res.body.invoice.total).toBe(300);
  });

  it("refuses an invoice with nobody to address it to", async () => {
    const res = await call("post", "/api/invoices/manual", staff, ny).send({
      lines: [{ label: "Storage", amount: 100 }],
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/addressed to/i);
  });

  it("sets the due date from the terms", async () => {
    const res = await call("post", "/api/invoices/manual", staff, ny).send({
      party: { name: "Walk-in Shipper" },
      lines: [{ label: "Storage", amount: 100 }],
      issueDate: "2026-03-01",
      terms: "NET_30",
    });

    expect(new Date(res.body.invoice.dueDate).toISOString().slice(0, 10)).toBe(
      "2026-03-31",
    );
  });
});

// ─── Reports ──────────────────────────────────────────────────────────────────

describe("Reports", () => {
  beforeEach(async () => {
    await setLedger("receivables", [
      { chargeType: "linehaul", amount: 1000 },
      { chargeType: "detention", amount: 150 },
    ]);
    await setLedger("payables", [{ chargeType: "linehaul", amount: 700 }]);
  });

  it("reports what a load earns, costs and still has uninvoiced", async () => {
    const res = await call("get", "/api/accounting/reports/loads", staff, ny);

    expect(res.status).toBe(200);
    const row = res.body.rows.find((r) => r.loadId === load.loadId);

    expect(row.receivable.baseRate).toBe(1000);
    expect(row.receivable.additionalTotal).toBe(150);
    expect(row.receivable.additionalCharges[0].label).toBe("Detention Charges");
    expect(row.receivable.total).toBe(1150);
    // Nothing raised yet — the whole ledger is revenue earned but not billed.
    expect(row.receivable.uninvoiced).toBe(1150);
    expect(row.payable.total).toBe(700);
    expect(row.margin).toBe(450);
  });

  it("closes the uninvoiced gap once the invoice is raised", async () => {
    await generate({ sides: ["AR"] });

    const res = await call("get", "/api/accounting/reports/loads", staff, ny);
    const row = res.body.rows.find((r) => r.loadId === load.loadId);

    expect(row.receivable.invoiced).toBe(1150);
    expect(row.receivable.uninvoiced).toBe(0);
    expect(row.receivable.outstanding).toBe(1150);
  });

  // ── The badge on the accounting summary ─────────────────────────────────────
  // These exist because the summary used to read a date typed into the load's
  // own ledger form, which nothing in the invoice module ever writes. A load
  // with a sent invoice against it reported NOT BILLED, which is the prompt to
  // bill a customer twice. See services/billingState.js.

  it("shows a load as billed once an invoice is raised against it", async () => {
    const before = await call("get", "/api/accounting/summary", staff, ny);
    expect(before.body.rows.find((r) => r.loadId === load.loadId).invoiced).toBe(false);

    const created = await generate({ sides: ["AR"] });
    const invoiceNumber = created.body.customerInvoice.invoiceNumber;

    const after = await call("get", "/api/accounting/summary", staff, ny);
    const row = after.body.rows.find((r) => r.loadId === load.loadId);

    expect(row.invoiced).toBe(true);
    expect(row.paid).toBe(false);
    expect(row.invoiceNumber).toBe(invoiceNumber);
    expect(after.body.totals.billedLoads).toBe(1);
  });

  it("shows a load as paid once its invoice is settled", async () => {
    const created = await generate({ sides: ["AR"] });
    const invoice = created.body.customerInvoice;

    await call("post", "/api/payments", staff, ny).send({
      invoice: invoice._id,
      amount: invoice.balance,
      method: "CHECK",
      documentNumber: "100482",
    });

    const res = await call("get", "/api/accounting/summary", staff, ny);
    const row = res.body.rows.find((r) => r.loadId === load.loadId);

    expect(row.invoiced).toBe(true);
    expect(row.paid).toBe(true);
  });

  it("treats a voided invoice as unbilled again", async () => {
    const created = await generate({ sides: ["AR"] });

    await call(
      "put",
      `/api/invoices/${created.body.customerInvoice._id}/void`,
      staff,
      ny,
    ).send({ reason: "Raised against the wrong customer" });

    const res = await call("get", "/api/accounting/summary", staff, ny);
    const row = res.body.rows.find((r) => r.loadId === load.loadId);

    // A withdrawn claim is not a bill. The load goes back in the queue, which is
    // the entire point of voiding one.
    expect(row.invoiced).toBe(false);
  });

  it("drops a load off the awaiting-invoice queue once it is billed", async () => {
    await runUnscoped(() =>
      Load.updateOne({ loadId: load.loadId }, { transportStatus: "INVOICED" }),
    );

    const before = await call(
      "get",
      "/api/accounting/summary?awaitingInvoice=true",
      staff,
      ny,
    );
    expect(before.body.rows.map((r) => r.loadId)).toContain(load.loadId);

    await generate({ sides: ["AR"] });

    const after = await call(
      "get",
      "/api/accounting/summary?awaitingInvoice=true",
      staff,
      ny,
    );
    expect(after.body.rows.map((r) => r.loadId)).not.toContain(load.loadId);
  });

  it("still reports a load billed the old way as billed", async () => {
    // Loads invoiced before the register existed carry a typed date and no
    // document. Dropping that fallback would flip them from INVOICED back to
    // NOT BILLED — the same error pointing the other way.
    await runUnscoped(() =>
      Load.updateOne(
        { loadId: load.loadId },
        { "accounting.receivables.invoicedAt": new Date("2026-01-15") },
      ),
    );

    const res = await call("get", "/api/accounting/summary", staff, ny);
    const row = res.body.rows.find((r) => r.loadId === load.loadId);

    expect(row.invoiced).toBe(true);
  });

  it("groups outstanding money by customer with its age", async () => {
    await generate({ sides: ["AR"] });

    const res = await call("get", "/api/accounting/reports/customers", staff, ny);

    expect(res.status).toBe(200);
    const row = res.body.rows.find((r) => r.customerId === String(customerUser._id));

    expect(row.billed).toBe(1150);
    expect(row.outstanding).toBe(1150);
    expect(row.openCount).toBe(1);
    // Raised today on Net 30 — not overdue, so it sits in the current bucket.
    expect(row.aging.current).toBe(1150);
    expect(row.aging.d1_30).toBe(0);
  });

  it("ages an overdue invoice into the right bucket", async () => {
    const created = await generate({ sides: ["AR"] });

    await withTenant({ locationId: String(ny._id) }, async () => {
      const invoice = await Invoice.findById(created.body.customerInvoice._id);
      invoice.dueDate = new Date(Date.now() - 45 * 86400000);
      invoice.sentAt = new Date(Date.now() - 75 * 86400000);
      await invoice.save();
    });

    const res = await call("get", "/api/accounting/reports/aging", staff, ny);

    expect(res.body.buckets.d31_60).toBe(1150);
    expect(res.body.buckets.current).toBe(0);
    expect(res.body.invoices[0].daysOverdue).toBe(45);
  });

  it("gives one customer their whole account", async () => {
    await generate({ sides: ["AR"] });

    const res = await call(
      "get",
      `/api/accounting/reports/customers/${customerUser._id}`,
      staff,
      ny,
    );

    expect(res.status).toBe(200);
    expect(res.body.totals.billed).toBe(1150);
    expect(res.body.totals.outstanding).toBe(1150);
    expect(res.body.invoices).toHaveLength(1);
    expect(res.body.customer.billingEmail).toBe("ap@acme.test");
  });
});

// ─── The pieces that stand alone ──────────────────────────────────────────────

// ─── Loads that predate the ledger ────────────────────────────────────────────
// The overwhelmingly common shape in a live database: a load carries `amount`
// and a carrier rate because that is how it was created, and nobody has ever
// opened the accounting screen to itemise it. Reading the stored ledger lines
// directly reports $0 revenue for a load that plainly has a value.

describe("A load nobody has itemised", () => {
  it("bills its base amount when the receivable ledger is empty", async () => {
    const bare = await newLoad({ amount: 4800 });

    const res = await call(
      "post",
      `/api/invoices/loads/${bare.loadId}/generate`,
      staff,
      ny,
    ).send({ sides: ["AR"] });

    expect(res.status).toBe(200);
    expect(res.body.customerInvoice.total).toBe(4800);
    expect(res.body.customerInvoice.lines[0].description).toMatch(/base amount/i);
  });

  it("bills the carrier from vendorRate when the payable ledger is empty", async () => {
    const carrier = await withTenant({ locationId: String(ny._id) }, () =>
      FleetOwner.create({ carrierName: "Northline Trucking", status: "ACTIVE" }),
    );

    const bare = await newLoad({
      amount: 4800,
      vendorRate: 3200,
      assignedFleetOwner: {
        fleetOwnerId: carrier._id,
        fleetOwnerName: "Northline Trucking",
      },
    });

    const res = await call(
      "post",
      `/api/invoices/loads/${bare.loadId}/generate`,
      staff,
      ny,
    ).send({});

    expect(res.body.customerInvoice.total).toBe(4800);
    expect(res.body.carrierBills).toHaveLength(1);
    expect(res.body.carrierBills[0].total).toBe(3200);
  });

  it("prefers the agreed rate over what the carrier bid", async () => {
    // The bid is what was offered; vendorRate is what was agreed. Paying the
    // bid after somebody negotiated it down pays the wrong number.
    const bare = await newLoad({
      amount: 4800,
      vendorRate: 3000,
      winningBid: { amount: 3400 },
      assignedFleetOwner: { fleetOwnerId: new mongoose.Types.ObjectId() },
    });

    const res = await call(
      "post",
      `/api/invoices/loads/${bare.loadId}/generate`,
      staff,
      ny,
    ).send({});

    expect(res.body.carrierBills[0].total).toBe(3000);
  });

  it("falls back to the winning bid when no rate was set", async () => {
    const bare = await newLoad({
      amount: 4800,
      winningBid: { amount: 3400 },
      assignedFleetOwner: { fleetOwnerId: new mongoose.Types.ObjectId() },
    });

    const res = await call(
      "post",
      `/api/invoices/loads/${bare.loadId}/generate`,
      staff,
      ny,
    ).send({});

    expect(res.body.carrierBills[0].total).toBe(3400);
  });

  it("reports its value rather than zero", async () => {
    await newLoad({ amount: 4800, vendorRate: 3200 });

    const res = await call("get", "/api/accounting/reports/loads", staff, ny);
    const row = res.body.rows.find((r) => r.receivable.total === 4800);

    expect(row).toBeTruthy();
    expect(row.payable.total).toBe(3200);
    expect(row.margin).toBe(1600);
  });

  it("says on the accounting screen that the figures are not itemised", async () => {
    const bare = await newLoad({ amount: 4800, vendorRate: 3200 });

    const res = await call("get", `/api/accounting/loads/${bare.loadId}`, staff, ny);

    expect(res.body.receivables.derived).toBe(true);
    expect(res.body.payables.derived).toBe(true);
    expect(res.body.profit.margin).toBe(1600);
  });

  it("stops deriving the moment a real ledger is saved", async () => {
    const bare = await newLoad({ amount: 4800 });

    await call("put", `/api/accounting/loads/${bare.loadId}/receivables`, staff, ny).send({
      lines: [
        { chargeType: "linehaul", amount: 5000 },
        { chargeType: "detention", amount: 200 },
      ],
    });

    const res = await call("get", `/api/accounting/loads/${bare.loadId}`, staff, ny);

    expect(res.body.receivables.derived).toBe(false);
    expect(res.body.receivables.totals.total).toBe(5200);
  });

  it("does not invent a bill for a leg nobody has priced", async () => {
    // A $0 bill reads as "we owe you nothing", which is a different claim from
    // "we have not priced this leg yet".
    const carrier = await withTenant({ locationId: String(ny._id) }, () =>
      FleetOwner.create({ carrierName: "Southbound Freight", status: "ACTIVE" }),
    );

    const bare = await newLoad({
      amount: 4800,
      assignments: [
        { fleetOwnerId: carrier._id, fleetOwnerName: "Southbound Freight" },
      ],
    });

    const res = await call("get", `/api/accounting/loads/${bare.loadId}`, staff, ny);

    expect(res.body.payables.totals.total).toBe(0);
    expect(res.body.payables.derived).toBe(false);
  });
});

describe("The reminder ladder", () => {
  it("fires three days before due, then at 1, 7, 15 and 30 days late", () => {
    expect(isDueForReminder(-3)).toBe(true);
    expect(isDueForReminder(1)).toBe(true);
    expect(isDueForReminder(7)).toBe(true);
    expect(isDueForReminder(15)).toBe(true);
    expect(isDueForReminder(30)).toBe(true);
  });

  it("stays quiet on the days between the rungs", () => {
    [-10, -2, 0, 3, 10, 20, 45].forEach((day) => {
      expect(isDueForReminder(day)).toBe(false);
    });
  });

  it("keeps chasing monthly past the last rung", () => {
    // An unpaid invoice does not become less unpaid by being ignored.
    expect(isDueForReminder(60)).toBe(true);
    expect(isDueForReminder(90)).toBe(true);
    expect(isDueForReminder(91)).toBe(false);
  });
});

describe("Payment references", () => {
  it("names the document each method actually issues", () => {
    expect(validatePaymentReference({ method: "CHECK", documentNumber: "" })).toMatch(
      /cheque number/i,
    );
    expect(validatePaymentReference({ method: "WIRE", documentNumber: "" })).toMatch(
      /wire reference/i,
    );
    expect(validatePaymentReference({ method: "CARD", documentNumber: "" })).toMatch(
      /authorisation code/i,
    );
  });

  it("accepts cash without one", () => {
    expect(validatePaymentReference({ method: "CASH", documentNumber: "" })).toBeNull();
  });

  it("rejects a method that is not in the catalog", () => {
    expect(validatePaymentReference({ method: "BARTER", documentNumber: "x" })).toMatch(
      /choose how/i,
    );
  });
});

describe("The PDF", () => {
  it("renders an invoice to a PDF buffer", async () => {
    const buffer = await renderInvoicePdf({
      invoiceNumber: "LD 0001",
      direction: "AR",
      issuer: { name: "S Line Brokerage Inc." },
      party: { kind: "CUSTOMER", name: "Acme Imports" },
      issueDate: new Date(),
      dueDate: new Date(),
      terms: "NET_30",
      lines: [{ label: "Gross Amount", kind: "linehaul", amount: 1000 }],
      subtotal: 1000,
      total: 1000,
      balance: 1000,
      status: "DRAFT",
    });

    expect(buffer.length).toBeGreaterThan(500);
    expect(buffer.slice(0, 4).toString()).toBe("%PDF");
  });
});
