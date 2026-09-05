#!/usr/bin/env node
// ─── Accounting demo data ─────────────────────────────────────────────────────
// Everything needed to exercise the accounting module, in one command.
//
//   node scripts/seedAccountingDemo.js            # add another set of demo loads
//   node scripts/seedAccountingDemo.js --reset    # delete what this made, then recreate
//
// It exists because reaching a testable state by hand — a branch, a staff login
// with the right permissions, a customer with a billing address, two carriers, a
// driver, and loads carrying charges on both sides — is twenty minutes of form
// filling before the first thing you actually wanted to test. Doing that by hand
// once is fine; doing it after every database reset is how a feature stops being
// tested.
//
// ── What it leaves behind ────────────────────────────────────────────────────
// Four loads, each parked at a different point of the billing cycle, because the
// interesting behaviour is at the transitions and a set of identical fresh loads
// exercises none of them:
//
//   A — charges on both sides, nothing raised.      Tests: raising invoices.
//   B — split between two carriers, plus a driver.  Tests: one bill per leg.
//   C — invoiced and part paid.                     Tests: balances, reversal.
//   D — invoiced, sent, 45 days overdue.            Tests: aging, reminders.
//
// ── Running it twice ─────────────────────────────────────────────────────────
// The directory — branch, logins, customer, carriers, driver — is found and
// reused, never duplicated. The four loads are created fresh each time, so a
// second run gives you a second set to work on while the first stays as you left
// it. That is usually what you want mid-test; when it is not, `--reset` removes
// every load, invoice and payment this script has created (they carry a refNo
// tagged ACCT-DEMO) and leaves the rest of the database untouched.
//
// The tag is why the reset is safe: deleting by name pattern instead would
// eventually delete somebody's real customer called "Demo Freight".
// ─────────────────────────────────────────────────────────────────────────────

require("dotenv").config();
const mongoose = require("mongoose");

const { runUnscoped, withTenant } = require("../utils/tenantContext");
const { resetBranchCodeCache } = require("../utils/sequence");

const Branch = require("../models/Branch");
const User = require("../models/User");
const Customer = require("../models/Customer");
const Address = require("../models/common/Address");
const FleetOwner = require("../models/FleetOwner");
const Driver = require("../models/Driver");
const Load = require("../models/Load");
const Invoice = require("../models/Invoice");
const Payment = require("../models/Payment");

const invoices = require("../services/invoiceService");
const { money } = require("../config/chargeTypes");
const { nextSequence } = require("../utils/sequence");

const PASSWORD = "password123";
const RESET = process.argv.includes("--reset");

// Everything this script creates is tagged so --reset can find it again without
// guessing. A reset that deletes by name pattern eventually deletes somebody's
// real customer called "Demo Freight".
const TAG = "ACCT-DEMO";

const log = (...args) => console.log(...args);

const daysAgo = (days) => new Date(Date.now() - days * 86400000);

// ─── Wipe ─────────────────────────────────────────────────────────────────────

const wipe = async () => {
  log("Removing previous demo data…");

  const loads = await Load.find({ refNo: { $regex: `^${TAG}` } }).select("_id loadId");
  const loadIds = loads.map((l) => l.loadId);

  const removed = {
    payments: (await Payment.deleteMany({ loadId: { $in: loadIds } })).deletedCount,
    invoices: (await Invoice.deleteMany({ loadId: { $in: loadIds } })).deletedCount,
    loads: (await Load.deleteMany({ _id: { $in: loads.map((l) => l._id) } })).deletedCount,
  };

  // Manual invoices carry no load, so they are matched on their own tag.
  removed.invoices += (await Invoice.deleteMany({ memo: { $regex: TAG } })).deletedCount;

  log(
    `  ${removed.loads} loads, ${removed.invoices} invoices, ${removed.payments} payments removed.`,
  );
  log("  Branch, staff, customer, carriers and drivers are kept and reused.\n");
};

// ─── Directory ────────────────────────────────────────────────────────────────

/** Find or create, reporting which it did — a silent no-op reads as a failure. */
const ensure = async (label, find, create) => {
  const existing = await find();
  if (existing) {
    log(`  · ${label} — already there`);
    return existing;
  }
  const made = await create();
  log(`  + ${label}`);
  return made;
};

const seedDirectory = async () => {
  log("Directory");

  const branch = await ensure(
    "Branch NY (New York)",
    () => Branch.findOne({ code: "NY" }),
    () =>
      Branch.create({
        name: "New York",
        code: "NY",
        address: "1200 Harbor Boulevard, Suite 400",
        city: "Newark",
        state: "NJ",
        zip: "07114",
        phone: "(201) 555-0142",
        email: "accounts@slinebrokerage.test",
      }),
  );

  const staff = await ensure(
    `Staff login  accounts@fms.test / ${PASSWORD}`,
    () => User.findOne({ email: "accounts@fms.test" }),
    () =>
      User.create({
        firstName: "Amara",
        lastName: "Ross",
        email: "accounts@fms.test",
        password: PASSWORD,
        role: "staff",
        isVerified: true,
        locations: [branch._id],
        defaultLocation: branch._id,
        // The two the accounting screens are gated on, plus what it takes to
        // reach a load in the first place.
        permissions: [
          "dashboard.view",
          "loads.view",
          "loads.create",
          "loads.edit",
          "customers.view",
          "fleetOwners.view",
          "reports.view",
          "reports.export",
        ],
      }),
  );

  const customerUser = await ensure(
    `Customer login  ap@kingsway.test / ${PASSWORD}`,
    () => User.findOne({ email: "ap@kingsway.test" }),
    () =>
      User.create({
        firstName: "Kingsway",
        lastName: "Logistics",
        email: "ap@kingsway.test",
        password: PASSWORD,
        role: "client",
        isVerified: true,
        phone: "(908) 555-0199",
        locations: [branch._id],
      }),
  );

  return { branch, staff, customerUser };
};

/** The tenant-scoped half — everything below here needs a location context. */
const seedTenantDirectory = async ({ customerUser }) => {
  const address = await ensure(
    "Billing address for Kingsway Logistics",
    () => Address.findOne({ street: "55 Dock Street" }),
    () =>
      Address.create({
        street: "55 Dock Street",
        city: "Elizabeth",
        state: "NJ",
        zip: "07201",
      }),
  );

  const customer = await ensure(
    "Customer record  Kingsway Logistics LLC",
    () => Customer.findOne({ user: customerUser._id }),
    () =>
      Customer.create({
        user: customerUser._id,
        customerName: "Kingsway Logistics LLC",
        addresses: [address._id],
        contact: { name: "Sarah Vance", phone: "(908) 555-0199", email: "ops@kingsway.test" },
        // Invoices go here rather than to the operations contact — a bill in the
        // inbox of somebody with no authority to pay it sits there.
        emails: { accChargesEmail: "ap@kingsway.test" },
        preferences: { sendInvoiceEmails: true },
        active: true,
      }),
  );

  const north = await ensure(
    "Carrier  Northline Trucking Co.",
    () => FleetOwner.findOne({ carrierName: "Northline Trucking Co." }),
    () =>
      FleetOwner.create({
        carrierName: "Northline Trucking Co.",
        phone: "(973) 555-0164",
        mcLicense: "MC441207",
        dotLicense: "DOT2288140",
        status: "ACTIVE",
        contactPersons: [
          {
            name: "Dale Prosser",
            phone: "(973) 555-0164",
            email: "billing@northline.test",
            isPrimary: true,
          },
        ],
      }),
  );

  const south = await ensure(
    "Carrier  Southbound Freight LLC",
    () => FleetOwner.findOne({ carrierName: "Southbound Freight LLC" }),
    () =>
      FleetOwner.create({
        carrierName: "Southbound Freight LLC",
        phone: "(610) 555-0121",
        mcLicense: "MC552318",
        dotLicense: "DOT3391250",
        status: "ACTIVE",
        contactPersons: [
          {
            name: "Marta Quinn",
            phone: "(610) 555-0121",
            email: "ap@southbound.test",
            isPrimary: true,
          },
        ],
      }),
  );

  const driver = await ensure(
    "Driver  Ray Mott (28% of revenue)",
    () => Driver.findOne({ name: "Ray Mott" }),
    () =>
      Driver.create({
        fleetOwner: north._id,
        name: "Ray Mott",
        phone: "(201) 555-0177",
        email: "r.mott@northline.test",
        payType: "PERCENTAGE",
        payRate: 28,
        active: true,
      }),
  );

  return { customer, north, south, driver };
};

// ─── Loads ────────────────────────────────────────────────────────────────────

const baseLoad = (customerUser, overrides) => ({
  createdBy: "staff",
  creatorId: customerUser._id,
  customer: customerUser._id,
  customerName: "Kingsway Logistics LLC",
  truckType: "Container",
  material: "General freight",
  amount: 0,
  ...overrides,
});

const seedLoads = async ({ customerUser, north, south, driver }) => {
  log("\nLoads");

  // ── A — costed on both sides, nothing raised ───────────────────────────────
  const a = await Load.create(
    baseLoad(customerUser, {
      refNo: `${TAG}-A`,
      material: "Consumer electronics",
      transportStatus: "DELIVERED",
      pickup: { city: "Newark", state: "NJ" },
      drop: { city: "Allentown", state: "PA" },
      assignedFleetOwner: {
        fleetOwnerId: north._id,
        fleetOwnerName: north.carrierName,
        assignedAt: new Date(),
      },
      accounting: {
        receivables: {
          lines: [
            { chargeType: "linehaul", amount: 1450, note: "Port Newark to Allentown" },
            { chargeType: "fuelSurcharge", amount: 217.5 },
            { chargeType: "detention", amount: 150, quantity: 2, rate: 75, note: "2 hrs at delivery" },
            { chargeType: "chassisRent", amount: 105, quantity: 3, rate: 35, note: "3 days" },
          ],
        },
        payables: {
          lines: [
            { chargeType: "linehaul", amount: 950 },
            { chargeType: "fuelSurcharge", amount: 142.5 },
            { chargeType: "detention", amount: 100, quantity: 2, rate: 50 },
          ],
        },
      },
    }),
  );
  log(`  + ${a.loadId}  A — costed both sides, nothing raised yet`);

  // ── B — split between two carriers, plus a driver ──────────────────────────
  // The case the "one linehaul per side" rule used to refuse outright: two
  // carriers on one load genuinely have two base charges.
  const b = await Load.create(
    baseLoad(customerUser, {
      refNo: `${TAG}-B`,
      material: "Machine parts",
      transportStatus: "DELIVERED",
      pickup: { city: "Newark", state: "NJ" },
      drop: { city: "Harrisburg", state: "PA" },
      assignedFleetOwner: {
        fleetOwnerId: north._id,
        fleetOwnerName: north.carrierName,
        assignedAt: new Date(),
      },
      assignments: [
        {
          fleetOwnerId: north._id,
          fleetOwnerName: north.carrierName,
          carrierRate: 600,
          origin: { source: "CUSTOM", city: "Newark", state: "NJ" },
          destination: { source: "CUSTOM", company: "Kearny yard", city: "Kearny", state: "NJ" },
          transportStatus: "DELIVERED",
        },
        {
          fleetOwnerId: south._id,
          fleetOwnerName: south.carrierName,
          carrierRate: 450,
          origin: { source: "CUSTOM", company: "Kearny yard", city: "Kearny", state: "NJ" },
          destination: { source: "CUSTOM", city: "Harrisburg", state: "PA" },
          transportStatus: "DELIVERED",
        },
      ],
      accounting: {
        receivables: {
          lines: [
            { chargeType: "linehaul", amount: 1800 },
            { chargeType: "fuelSurcharge", amount: 270 },
            { chargeType: "transload", amount: 220, note: "Reworked at the Kearny yard" },
          ],
        },
        payables: {
          lines: [
            { chargeType: "linehaul", amount: 600, fleetOwnerId: north._id },
            { chargeType: "linehaul", amount: 450, fleetOwnerId: south._id },
            { chargeType: "detention", amount: 75, fleetOwnerId: south._id, note: "Waiting at the yard" },
            { chargeType: "yardStorage", amount: 60, fleetOwnerId: north._id },
          ],
        },
        payroll: {
          driver: driver._id,
          driverName: driver.name,
          payType: "PERCENTAGE",
          rate: 28,
          amount: money(2290 * 0.28),
          calculatedAt: new Date(),
        },
      },
    }),
  );
  log(`  + ${b.loadId}  B — split across 2 carriers + driver pay`);

  // ── C — invoiced and part paid ─────────────────────────────────────────────
  const c = await Load.create(
    baseLoad(customerUser, {
      refNo: `${TAG}-C`,
      material: "Packaged goods",
      transportStatus: "DELIVERED",
      pickup: { city: "Newark", state: "NJ" },
      drop: { city: "Baltimore", state: "MD" },
      assignedFleetOwner: {
        fleetOwnerId: south._id,
        fleetOwnerName: south.carrierName,
        assignedAt: new Date(),
      },
      accounting: {
        receivables: {
          lines: [
            { chargeType: "linehaul", amount: 2100 },
            { chargeType: "fuelSurcharge", amount: 315 },
            { chargeType: "advance", amount: 500, note: "Taken at booking" },
          ],
        },
        payables: { lines: [{ chargeType: "linehaul", amount: 1400 }] },
      },
    }),
  );
  log(`  + ${c.loadId}  C — will be invoiced and part paid`);

  // ── D — sent and 45 days overdue ───────────────────────────────────────────
  const d = await Load.create(
    baseLoad(customerUser, {
      refNo: `${TAG}-D`,
      material: "Building materials",
      transportStatus: "DELIVERED",
      pickup: { city: "Newark", state: "NJ" },
      drop: { city: "Richmond", state: "VA" },
      createdAt: daysAgo(80),
      assignedFleetOwner: {
        fleetOwnerId: north._id,
        fleetOwnerName: north.carrierName,
        assignedAt: daysAgo(80),
      },
      accounting: {
        receivables: {
          lines: [
            { chargeType: "linehaul", amount: 3200 },
            { chargeType: "lumper", amount: 180, note: "Dock labour at delivery" },
          ],
        },
        payables: { lines: [{ chargeType: "linehaul", amount: 2250 }] },
      },
    }),
  );
  log(`  + ${d.loadId}  D — will be sent and left 45 days overdue`);

  return { a, b, c, d };
};

// ─── Documents ────────────────────────────────────────────────────────────────

const seedDocuments = async ({ c, d, staff }) => {
  log("\nInvoices and payments");

  // ── C: raised, sent, part paid by check ────────────────────────────────────
  const { invoice: cInvoice } = await invoices.buildCustomerInvoice({
    load: c,
    user: staff,
    terms: "NET_30",
  });
  await invoices.buildCarrierBills({ load: c, user: staff, terms: "NET_15" });

  cInvoice.sentAt = daysAgo(10);
  cInvoice.sentTo = "ap@kingsway.test";
  await cInvoice.save();

  const payment = await Payment.create({
    paymentNumber: await nextSequence("receipt", c.locationId),
    direction: "RECEIVED",
    invoice: cInvoice._id,
    invoiceNumber: cInvoice.invoiceNumber,
    load: c._id,
    loadId: c.loadId,
    party: { kind: "CUSTOMER", id: cInvoice.party.id, name: cInvoice.party.name },
    amount: 800,
    paidOn: daysAgo(4),
    method: "CHECK",
    documentNumber: "100482",
    bankName: "Chase",
    note: "Part payment against the balance",
    recordedBy: staff._id,
    recordedByName: "Amara Ross",
  });

  await invoices.syncInvoicePayments(cInvoice);

  log(
    `  + ${cInvoice.invoiceNumber}  sent, ${payment.documentNumber} check for $800 · ` +
      `$${cInvoice.balance.toLocaleString("en-US")} outstanding`,
  );

  // ── D: raised, sent, dated back so it is genuinely overdue ─────────────────
  // The dates are pushed into the past rather than the status being set to
  // "OVERDUE", because overdue is not a status — it is a due date and a
  // balance, and faking it any other way would test the fake instead.
  const { invoice: dInvoice } = await invoices.buildCustomerInvoice({
    load: d,
    user: staff,
    terms: "NET_30",
  });
  await invoices.buildCarrierBills({ load: d, user: staff, terms: "NET_15" });

  dInvoice.issueDate = daysAgo(75);
  dInvoice.dueDate = daysAgo(45);
  dInvoice.sentAt = daysAgo(75);
  dInvoice.sentTo = "ap@kingsway.test";
  dInvoice.reminders = [
    { sentAt: daysAgo(44), to: "ap@kingsway.test", trigger: "AUTO", daysOverdue: 1, sent: true },
    { sentAt: daysAgo(38), to: "ap@kingsway.test", trigger: "AUTO", daysOverdue: 7, sent: true },
    { sentAt: daysAgo(30), to: "ap@kingsway.test", trigger: "AUTO", daysOverdue: 15, sent: true },
    { sentAt: daysAgo(15), to: "ap@kingsway.test", trigger: "MANUAL", daysOverdue: 30, sent: true },
  ];
  await dInvoice.save();

  log(
    `  + ${dInvoice.invoiceNumber}  sent, 45 days overdue, 4 reminders on the record`,
  );

  return { cInvoice, dInvoice };
};

// ─── Run ──────────────────────────────────────────────────────────────────────

const run = async () => {
  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/fms";
  log(`Connecting to ${uri}\n`);
  await mongoose.connect(uri);

  resetBranchCodeCache();

  // Branch and User are not tenant-scoped; everything else is. The unscoped
  // context covers the first pair, then the rest runs inside the branch so the
  // records land in the same tenant the staff login will read them from.
  const { branch, staff, customerUser } = await runUnscoped(() => seedDirectory());

  await withTenant({ locationId: String(branch._id) }, async () => {
    if (RESET) await wipe();

    const directory = await seedTenantDirectory({ customerUser });
    const loads = await seedLoads({ customerUser, ...directory });
    await seedDocuments({ ...loads, staff });

    log("\n" + "─".repeat(70));
    log("Done. Sign in and go to Accounting → Invoices.\n");
    log(`  Staff (back office)   accounts@fms.test   / ${PASSWORD}`);
    log(`  Customer (portal)     ap@kingsway.test    / ${PASSWORD}`);
    log(`  Location              ${branch.name} (${branch.code})\n`);
    log(`  ${loads.a.loadId}  costed both sides — press "Raise invoices" here first`);
    log(`  ${loads.b.loadId}  split across 2 carriers + a driver`);
    log(`  ${loads.c.loadId}  invoiced, part paid by check 100482`);
    log(`  ${loads.d.loadId}  45 days overdue, 4 reminders sent`);
    log("─".repeat(70));
  });

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("\nSeed failed:", error.message);
  console.error(error.stack);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
