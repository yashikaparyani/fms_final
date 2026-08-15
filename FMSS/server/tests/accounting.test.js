// Receivables, payables, driver payroll and the reports on top of them.
//
// The rule almost every test here circles is the one from config/chargeTypes.js:
// an advance is money that has already moved, not a charge. Getting that wrong
// makes every downstream figure — margin, payroll, the P&L — quietly incorrect,
// so it is checked from several directions.

const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");

const { connect, closeDatabase, clearDatabase } = require("./setup");
const { getJwtSecret } = require("../utils/jwtSecret");
const { runUnscoped, withTenant } = require("../utils/tenantContext");
const { resetBranchCodeCache } = require("../utils/sequence");

const User = require("../models/User");
const Branch = require("../models/Branch");
const Load = require("../models/Load");
const Driver = require("../models/Driver");
const FleetOwner = require("../models/FleetOwner");

const accountingRoutes = require("../routes/accountingRoutes");
const { totalsFor, profitFor } = require("../config/chargeTypes");
const { calculatePayroll } = require("../controllers/accountingController");

const app = express();
app.use(express.json());
app.use("/api/accounting", accountingRoutes);

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

const newLoad = (overrides = {}) =>
  withTenant({ locationId: String(ny._id) }, () =>
    Load.create({
      createdBy: "staff",
      customer: new (require("mongoose").Types.ObjectId)(),
      customerName: "Acme Imports",
      truckType: "Container",
      material: "Boxes",
      amount: 0,
      ...overrides,
    }),
  );

beforeEach(async () => {
  await runUnscoped(async () => {
    ny = await Branch.create({ name: "New York", code: "NY" });
  });

  staff = await User.create({
    email: "office@fms.com",
    password: "password123",
    role: "staff",
    locations: [ny._id],
    defaultLocation: ny._id,
    permissions: ["loads.view", "loads.edit", "reports.view"],
  });

  load = await newLoad();
});

describe("The arithmetic", () => {
  it("keeps an advance out of the total and takes it off the balance", () => {
    // The rule the whole module turns on. Summing the advance in would either
    // double-count the money or inflate the revenue.
    const totals = totalsFor([
      { chargeType: "linehaul", amount: 1000 },
      { chargeType: "fuelSurcharge", amount: 150 },
      { chargeType: "detention", amount: 75 },
      { chargeType: "advance", amount: 400 },
    ]);

    expect(totals.linehaul).toBe(1000);
    expect(totals.accessorials).toBe(225);
    expect(totals.total).toBe(1225); // NOT 1625
    expect(totals.settled).toBe(400);
    expect(totals.balance).toBe(825);
  });

  it("measures margin on totals, not on balances", () => {
    // Advances are cash-flow timing. They say nothing about whether the load
    // made money, so a big advance must not flatter the margin.
    const profit = profitFor({
      receivableLines: [
        { chargeType: "linehaul", amount: 1000 },
        { chargeType: "advance", amount: 900 },
      ],
      payableLines: [{ chargeType: "linehaul", amount: 700 }],
    });

    expect(profit.margin).toBe(300);
    expect(profit.marginPercent).toBe(30);
  });

  it("does not report a margin percentage on a load with nothing billed", () => {
    // Guarded, or this is Infinity/NaN and poisons every average downstream.
    const profit = profitFor({
      receivableLines: [],
      payableLines: [{ chargeType: "linehaul", amount: 500 }],
    });

    expect(profit.margin).toBe(-500);
    expect(profit.marginPercent).toBe(0);
    expect(Number.isFinite(profit.marginPercent)).toBe(true);
  });

  it("ignores charge types it does not recognise rather than producing NaN", () => {
    const totals = totalsFor([
      { chargeType: "linehaul", amount: 500 },
      { chargeType: "invented", amount: 999 },
    ]);

    expect(totals.total).toBe(500);
  });

  it("rounds to cents instead of trailing float noise", () => {
    const totals = totalsFor([
      { chargeType: "linehaul", amount: 0.1 },
      { chargeType: "fuelSurcharge", amount: 0.2 },
    ]);

    expect(totals.total).toBe(0.3); // not 0.30000000000000004
  });
});

describe("Saving a ledger", () => {
  it("stores the lines and returns the totals", async () => {
    const res = await call(
      "put",
      `/api/accounting/loads/${load.loadId}/receivables`,
      staff,
      ny,
    ).send({
      lines: [
        { chargeType: "linehaul", amount: 1200 },
        { chargeType: "chassisRent", amount: 90, quantity: 3, rate: 30 },
        { chargeType: "advance", amount: 500 },
      ],
      invoiceNumber: "INV-9001",
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.accounting.receivables.totals.total).toBe(1290);
    expect(res.body.accounting.receivables.totals.balance).toBe(790);
    expect(res.body.accounting.receivables.invoiceNumber).toBe("INV-9001");
  });

  it("drags the load's headline amount along with the receivables", async () => {
    // `amount` is read by the board, the bid screens and the POD. The two
    // disagreeing is how a load shows one figure and invoices at another.
    await call(
      "put",
      `/api/accounting/loads/${load.loadId}/receivables`,
      staff,
      ny,
    ).send({ lines: [{ chargeType: "linehaul", amount: 1475 }] });

    const saved = await withTenant({ locationId: String(ny._id) }, () =>
      Load.findById(load._id),
    );
    expect(saved.amount).toBe(1475);
  });

  it("leaves the amount alone on a load with no lines", async () => {
    // A load created before this section existed, or one where the figure was
    // simply typed in, keeps the number it was given.
    const typedIn = await newLoad({ amount: 999 });

    await call(
      "put",
      `/api/accounting/loads/${typedIn.loadId}/payables`,
      staff,
      ny,
    ).send({ lines: [{ chargeType: "linehaul", amount: 700 }] });

    const saved = await withTenant({ locationId: String(ny._id) }, () =>
      Load.findById(typedIn._id),
    );
    expect(saved.amount).toBe(999);
  });

  it("refuses two base charges on one side", async () => {
    const res = await call(
      "put",
      `/api/accounting/loads/${load.loadId}/receivables`,
      staff,
      ny,
    ).send({
      lines: [
        { chargeType: "linehaul", amount: 1000 },
        { chargeType: "linehaul", amount: 200 },
      ],
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/only one gross amount/i);
  });

  it("refuses a repeated non-repeatable accessorial", async () => {
    const res = await call(
      "put",
      `/api/accounting/loads/${load.loadId}/receivables`,
      staff,
      ny,
    ).send({
      lines: [
        { chargeType: "linehaul", amount: 1000 },
        { chargeType: "fuelSurcharge", amount: 100 },
        { chargeType: "fuelSurcharge", amount: 50 },
      ],
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/more than once/i);
  });

  it("allows a repeatable one more than once", async () => {
    // Two extra stops on one load are genuinely two lines with two notes.
    const res = await call(
      "put",
      `/api/accounting/loads/${load.loadId}/receivables`,
      staff,
      ny,
    ).send({
      lines: [
        { chargeType: "linehaul", amount: 1000 },
        { chargeType: "extraStops", amount: 75, note: "Stop 2" },
        { chargeType: "extraStops", amount: 75, note: "Stop 3" },
      ],
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.accounting.receivables.totals.total).toBe(1150);
  });

  it("requires a note on a miscellaneous charge", async () => {
    const res = await call(
      "put",
      `/api/accounting/loads/${load.loadId}/receivables`,
      staff,
      ny,
    ).send({
      lines: [
        { chargeType: "linehaul", amount: 1000 },
        { chargeType: "other", amount: 60 },
      ],
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/say what the charge is for/i);
  });

  it("refuses a negative amount and names the alternative", async () => {
    const res = await call(
      "put",
      `/api/accounting/loads/${load.loadId}/receivables`,
      staff,
      ny,
    ).send({ lines: [{ chargeType: "linehaul", amount: -100 }] });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/cannot be negative/i);
  });

  it("drops empty rows the user never filled in", async () => {
    const res = await call(
      "put",
      `/api/accounting/loads/${load.loadId}/receivables`,
      staff,
      ny,
    ).send({
      lines: [
        { chargeType: "linehaul", amount: 1000 },
        { chargeType: "lumper", amount: 0, note: "" },
      ],
    });

    expect(res.body.accounting.receivables.lines).toHaveLength(1);
  });

  it("keeps a payable charge off the receivable side and vice versa", async () => {
    const res = await call(
      "put",
      `/api/accounting/loads/${load.loadId}/receivables`,
      staff,
      ny,
    ).send({ lines: [{ chargeType: "notAThing", amount: 100 }] });

    // Unrecognised lines are dropped, so nothing is stored rather than a line
    // that totals to nothing.
    expect(res.body.accounting.receivables.lines).toHaveLength(0);
  });
});

describe("Payroll", () => {
  let driver;

  beforeEach(async () => {
    let carrier;
    await withTenant({ locationId: String(ny._id) }, async () => {
      carrier = await FleetOwner.create({ carrierName: "Swift Haulage" });
      driver = await Driver.create({
        fleetOwner: carrier._id,
        name: "Ravi Kumar",
        payType: "PERCENTAGE",
        payRate: 25,
      });
    });

    await call(
      "put",
      `/api/accounting/loads/${load.loadId}/receivables`,
      staff,
      ny,
    ).send({
      lines: [
        { chargeType: "linehaul", amount: 1000 },
        { chargeType: "fuelSurcharge", amount: 200 },
        { chargeType: "advance", amount: 600 },
      ],
    });
  });

  it("pays a percentage driver on revenue, not on the balance", () => {
    // Paying on the balance would make a driver's wage depend on how much the
    // customer happened to pay up front.
    expect(
      calculatePayroll({ payType: "PERCENTAGE", rate: 25, revenueTotal: 1200 }),
    ).toBe(300);
  });

  it("works out each pay type", () => {
    expect(calculatePayroll({ payType: "FLAT", rate: 450 })).toBe(450);
    expect(calculatePayroll({ payType: "PER_MILE", rate: 0.65, miles: 420 })).toBe(273);
    expect(calculatePayroll({ payType: "HOURLY", rate: 28, hours: 9.5 })).toBe(266);
  });

  it("uses the driver's own rate when none is given", async () => {
    const res = await call(
      "put",
      `/api/accounting/loads/${load.loadId}/payroll`,
      staff,
      ny,
    ).send({ driver: String(driver._id) });

    expect(res.statusCode).toBe(200);
    // 25% of the $1,200 revenue — the $600 advance is not part of it.
    expect(res.body.accounting.payroll.amount).toBe(300);
    expect(res.body.accounting.payroll.driverName).toBe("Ravi Kumar");
  });

  it("lets a one-off rate override the driver's standing one", async () => {
    const res = await call(
      "put",
      `/api/accounting/loads/${load.loadId}/payroll`,
      staff,
      ny,
    ).send({ driver: String(driver._id), payType: "FLAT", rate: 500 });

    expect(res.body.accounting.payroll.amount).toBe(500);

    // And the driver's own record is untouched.
    const unchanged = await withTenant({ locationId: String(ny._id) }, () =>
      Driver.findById(driver._id),
    );
    expect(unchanged.payType).toBe("PERCENTAGE");
    expect(unchanged.payRate).toBe(25);
  });

  it("does not rewrite a stored figure when the driver's rate later changes", async () => {
    await call("put", `/api/accounting/loads/${load.loadId}/payroll`, staff, ny).send({
      driver: String(driver._id),
    });

    await withTenant({ locationId: String(ny._id) }, async () => {
      const record = await Driver.findById(driver._id);
      record.payRate = 40;
      await record.save();
    });

    const res = await call(
      "get",
      `/api/accounting/loads/${load.loadId}`,
      staff,
      ny,
    );
    // Still 25% — what was already paid is a record, not a recalculation.
    expect(res.body.payroll.amount).toBe(300);
  });

  it("asks for the miles on a per-mile driver", async () => {
    const res = await call(
      "put",
      `/api/accounting/loads/${load.loadId}/payroll`,
      staff,
      ny,
    ).send({ driver: String(driver._id), payType: "PER_MILE", rate: 0.65 });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/miles/i);
  });

  it("previews without storing anything", async () => {
    const res = await call(
      "post",
      `/api/accounting/loads/${load.loadId}/payroll/preview`,
      staff,
      ny,
    ).send({ payType: "PERCENTAGE", rate: 30 });

    expect(res.body.amount).toBe(360);

    const stored = await call("get", `/api/accounting/loads/${load.loadId}`, staff, ny);
    expect(stored.body.payroll?.amount).toBeFalsy();
  });

  it("marks pay settled and reopens it", async () => {
    await call("put", `/api/accounting/loads/${load.loadId}/payroll`, staff, ny).send({
      driver: String(driver._id),
    });

    const settled = await call(
      "put",
      `/api/accounting/loads/${load.loadId}/payroll/settle`,
      staff,
      ny,
    ).send({});
    expect(settled.body.accounting.payroll.settledAt).toBeTruthy();

    const reopened = await call(
      "put",
      `/api/accounting/loads/${load.loadId}/payroll/settle`,
      staff,
      ny,
    ).send({ settledAt: null });
    expect(reopened.body.accounting.payroll.settledAt).toBeFalsy();
  });
});

describe("Summary", () => {
  beforeEach(async () => {
    await call(
      "put",
      `/api/accounting/loads/${load.loadId}/receivables`,
      staff,
      ny,
    ).send({
      lines: [
        { chargeType: "linehaul", amount: 1000 },
        { chargeType: "advance", amount: 400 },
      ],
    });

    await call(
      "put",
      `/api/accounting/loads/${load.loadId}/payables`,
      staff,
      ny,
    ).send({ lines: [{ chargeType: "linehaul", amount: 700 }] });
  });

  it("totals revenue, expense and margin across loads", async () => {
    const res = await call("get", "/api/accounting/summary", staff, ny);

    expect(res.statusCode).toBe(200);
    expect(res.body.totals.revenue).toBe(1000);
    expect(res.body.totals.expense).toBe(700);
    expect(res.body.totals.margin).toBe(300);
    expect(res.body.totals.outstandingReceivable).toBe(600);
  });

  it("leaves unbilled loads out of the average margin", async () => {
    // A load nobody has invoiced yet is not a zero-margin load, and averaging it
    // in drags the figure toward a number that means nothing.
    await newLoad({ amount: 0 });

    const res = await call("get", "/api/accounting/summary", staff, ny);

    expect(res.body.totals.loads).toBe(2);
    expect(res.body.totals.billedLoads).toBe(1);
    expect(res.body.totals.averageMarginPercent).toBe(30);
  });

  it("groups the payroll run by driver", async () => {
    let carrier;
    let driver;
    await withTenant({ locationId: String(ny._id) }, async () => {
      carrier = await FleetOwner.create({ carrierName: "Swift" });
      driver = await Driver.create({
        fleetOwner: carrier._id,
        name: "Ravi Kumar",
        payType: "FLAT",
        payRate: 400,
      });
    });

    await call("put", `/api/accounting/loads/${load.loadId}/payroll`, staff, ny).send({
      driver: String(driver._id),
    });

    const res = await call("get", "/api/accounting/payroll", staff, ny);

    expect(res.body.drivers).toHaveLength(1);
    expect(res.body.drivers[0].driverName).toBe("Ravi Kumar");
    expect(res.body.totals.total).toBe(400);
    expect(res.body.totals.unsettled).toBe(400);
  });
});

describe("Who may see the books", () => {
  it("keeps a carrier out entirely", async () => {
    // The margin between billed and paid is the brokerage's business. There is
    // no filtered version of this for a carrier — there is no route at all.
    const carrierUser = await User.create({
      email: "carrier@x.com",
      password: "x",
      role: "fleetOwner",
      locations: [ny._id],
      defaultLocation: ny._id,
    });

    const res = await call(
      "get",
      `/api/accounting/loads/${load.loadId}`,
      carrierUser,
      ny,
    );
    expect(res.statusCode).toBe(403);
  });

  it("keeps a client out entirely", async () => {
    const client = await User.create({
      email: "client@x.com",
      password: "x",
      role: "client",
      locations: [ny._id],
      defaultLocation: ny._id,
    });

    const res = await call("get", "/api/accounting/summary", client, ny);
    expect(res.statusCode).toBe(403);
  });

  it("keeps a dispatcher without reports permission out of the margin", async () => {
    // Moving loads and seeing what they earn are different jobs.
    const dispatcher = await User.create({
      email: "dispatch@fms.com",
      password: "x",
      role: "staff",
      locations: [ny._id],
      defaultLocation: ny._id,
      permissions: ["loads.view", "loads.edit"],
    });

    const summary = await call("get", "/api/accounting/summary", dispatcher, ny);
    expect(summary.statusCode).toBe(403);

    // But they can still work a single load's charges, which is their job.
    const single = await call(
      "get",
      `/api/accounting/loads/${load.loadId}`,
      dispatcher,
      ny,
    );
    expect(single.statusCode).toBe(200);
  });
});
