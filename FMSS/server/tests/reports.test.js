// The report module: eighteen reports run by one runner, CSV export, and the
// driver payment that emails a statement.
//
// The tests concentrate on the selections that are easy to get subtly wrong —
// "no LFD" that misses empty strings, "days in yard" that resets on an unrelated
// edit, an accessorials report full of loads with no accessorials — because
// those produce a report that looks right and is not.

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

const reportRoutes = require("../routes/reportRoutes");
const { csvEscape, toCsv } = require("../controllers/reportController");
const { catalog } = require("../config/reportDefinitions");

const app = express();
app.use(express.json());
app.use("/api/reports", reportRoutes);

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

const newLoad = (overrides = {}) =>
  withTenant({ locationId: String(ny._id) }, () =>
    Load.create({
      createdBy: "staff",
      customer: new (require("mongoose").Types.ObjectId)(),
      customerName: "Acme Imports",
      truckType: "Container",
      material: "Boxes",
      amount: 1000,
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
    permissions: ["reports.view", "reports.export", "loads.edit", "loads.view"],
  });
});

describe("Catalog", () => {
  it("offers every report the specification asked for", async () => {
    const res = await call("get", "/api/reports/catalog", staff, ny);
    expect(res.statusCode).toBe(200);

    const keys = res.body.reports.map((r) => r.key);

    [
      "receivables",
      "payables",
      "driverPayable",
      "dailyEntered",
      "customerWise",
      "loadedInYard",
      "dailyDelivered",
      "withLfd",
      "emptyInYard",
      "invoiceable",
      "accessorialsByCustomer",
      "shippingLineWise",
      "noPickup",
      "noAppointment",
      "withoutLfd",
      "readyForPickup",
      "paperworkPending",
    ].forEach((key) => expect(keys).toContain(key));
  });

  it("describes each report's columns and filters so the UI needs no per-report code", () => {
    catalog().reports.forEach((report) => {
      expect(report.columns.length).toBeGreaterThan(0);
      expect(Array.isArray(report.filters)).toBe(true);
    });
  });

  it("404s a report that does not exist", async () => {
    const res = await call("get", "/api/reports/invented", staff, ny);
    expect(res.statusCode).toBe(404);
  });
});

describe("Financial reports", () => {
  beforeEach(async () => {
    const billed = await newLoad({ customerName: "Acme Imports" });
    await withTenant({ locationId: String(ny._id) }, async () => {
      const load = await Load.findById(billed._id);
      load.accounting = {
        receivables: {
          lines: [
            { chargeType: "linehaul", amount: 1000 },
            { chargeType: "detention", amount: 250 },
            { chargeType: "advance", amount: 400 },
          ],
        },
        payables: {
          lines: [{ chargeType: "linehaul", amount: 700 }],
        },
      };
      await load.save();
    });

    // A load nobody has billed — it must not appear on a receivables report as
    // a zero-value row.
    await newLoad({ customerName: "Globex" });
  });

  it("lists only loads that were actually billed", async () => {
    const res = await call("get", "/api/reports/receivables", staff, ny);

    expect(res.body.rows).toHaveLength(1);
    expect(res.body.totals.total).toBe(1250);
    // The advance is settled, not revenue — see config/chargeTypes.js.
    expect(res.body.totals.settled).toBe(400);
    expect(res.body.totals.balance).toBe(850);
  });

  it("totals payables separately from receivables", async () => {
    const res = await call("get", "/api/reports/payables", staff, ny);

    expect(res.body.rows).toHaveLength(1);
    expect(res.body.totals.total).toBe(700);
  });

  it("reports margin per load", async () => {
    const res = await call("get", "/api/reports/profitability", staff, ny);

    const billed = res.body.rows.find((r) => r.revenue > 0);
    expect(billed.margin).toBe(550);
  });

  it("keeps loads with no accessorials off the accessorials report", async () => {
    // A row with nothing on it is noise on a report about charges.
    const plain = await newLoad({ customerName: "Plain Co" });
    await withTenant({ locationId: String(ny._id) }, async () => {
      const load = await Load.findById(plain._id);
      load.accounting = {
        receivables: { lines: [{ chargeType: "linehaul", amount: 900 }] },
      };
      await load.save();
    });

    const res = await call("get", "/api/reports/accessorialsByCustomer", staff, ny);

    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].customerName).toBe("Acme Imports");
    expect(res.body.rows[0].accessorialDetail).toMatch(/Detention Charges \$250/);
  });

  it("narrows a report to its date range", async () => {
    const res = await call(
      "get",
      "/api/reports/receivables?from=2000-01-01&to=2000-12-31",
      staff,
      ny,
    );
    expect(res.body.rows).toHaveLength(0);
  });

  it("includes the whole of the end day rather than stopping at midnight", async () => {
    // The load was created moments ago, so "today to today" must include it.
    // Both the test and the query name UTC explicitly — a range built from a
    // date picker is a calendar day in somebody's zone, and leaving that
    // implicit is precisely the bug this guards.
    const todayUtc = new Date().toISOString().slice(0, 10);

    const res = await call(
      "get",
      `/api/reports/receivables?from=${todayUtc}&to=${todayUtc}&tz=UTC`,
      staff,
      ny,
    );
    expect(res.body.rows).toHaveLength(1);
  });

  it("reads the range in the caller's timezone, not the server's", async () => {
    // A load created at 19:00 UTC is already tomorrow in Asia/Kolkata (00:30),
    // so it belongs to tomorrow's report there and today's in UTC. Getting this
    // wrong shifts every daily report by the server's offset.
    const { utcFromLocal } = require("../utils/timezone");

    const start = utcFromLocal("2026-08-14T00:00:00", "Asia/Kolkata");
    const end = utcFromLocal("2026-08-15T00:00:00", "Asia/Kolkata");

    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
    // 00:00 IST is 18:30 UTC the previous day.
    expect(start.toISOString()).toBe("2026-08-13T18:30:00.000Z");
  });
});

describe("Yard reports", () => {
  it("counts days from when the load entered the yard, not from its last edit", async () => {
    // A load in the yard still gets touched by unrelated edits. Using updatedAt
    // would reset its age every time somebody fixed a typo — which is exactly
    // the number this report exists to expose.
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    const load = await newLoad({
      transportStatus: "LOADED_IN_YARD",
      transportStatusHistory: [
        { status: "LOADED_IN_YARD", changedAt: tenDaysAgo },
      ],
    });

    // An unrelated edit right now.
    await withTenant({ locationId: String(ny._id) }, async () => {
      const doc = await Load.findById(load._id);
      doc.refNo = "TOUCHED";
      await doc.save();
    });

    const res = await call("get", "/api/reports/loadedInYard", staff, ny);

    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].daysInYard).toBe(10);
  });

  it("shows a container past its free time as a negative countdown", async () => {
    await newLoad({
      transportStatus: "LOADED_IN_YARD",
      lastFreeDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      transportStatusHistory: [{ status: "LOADED_IN_YARD", changedAt: new Date() }],
    });

    const res = await call("get", "/api/reports/loadedInYard", staff, ny);
    expect(res.body.rows[0].lfdDaysLeft).toBe(-3);
  });

  it("sorts the longest-standing container first", async () => {
    await newLoad({
      containerNo: "OLD",
      transportStatus: "LOADED_IN_YARD",
      transportStatusHistory: [
        { status: "LOADED_IN_YARD", changedAt: new Date(Date.now() - 20 * 864e5) },
      ],
    });
    await newLoad({
      containerNo: "NEW",
      transportStatus: "LOADED_IN_YARD",
      transportStatusHistory: [
        { status: "LOADED_IN_YARD", changedAt: new Date(Date.now() - 2 * 864e5) },
      ],
    });

    const res = await call("get", "/api/reports/loadedInYard", staff, ny);
    expect(res.body.rows.map((r) => r.containerNo)).toEqual(["OLD", "NEW"]);
  });

  it("keeps empties separate from loaded containers", async () => {
    await newLoad({ transportStatus: "LOADED_IN_YARD" });
    await newLoad({ transportStatus: "EMPTY_IN_YARD" });

    const loaded = await call("get", "/api/reports/loadedInYard", staff, ny);
    const empty = await call("get", "/api/reports/emptyInYard", staff, ny);

    expect(loaded.body.rows).toHaveLength(1);
    expect(empty.body.rows).toHaveLength(1);
  });
});

describe("Exception reports", () => {
  it("catches every way an LFD can be missing", async () => {
    // Absent, null and an empty string left by a form are the same operational
    // gap; catching only one of them makes the report quietly wrong.
    await newLoad({ containerNo: "NO-FIELD" });
    await newLoad({ containerNo: "NULL", lastFreeDate: null });
    await newLoad({ containerNo: "HAS-ONE", lastFreeDate: new Date() });

    const res = await call("get", "/api/reports/withoutLfd", staff, ny);

    expect(res.body.rows.map((r) => r.containerNo).sort()).toEqual([
      "NO-FIELD",
      "NULL",
    ]);
  });

  it("lists loads with an LFD soonest first", async () => {
    await newLoad({
      containerNo: "LATER",
      lastFreeDate: new Date(Date.now() + 10 * 864e5),
    });
    await newLoad({
      containerNo: "SOONER",
      lastFreeDate: new Date(Date.now() + 2 * 864e5),
    });

    const res = await call("get", "/api/reports/withLfd", staff, ny);
    expect(res.body.rows.map((r) => r.containerNo)).toEqual(["SOONER", "LATER"]);
  });

  it("counts a load as not picked up only while it is still waiting", async () => {
    await newLoad({ containerNo: "WAITING", transportStatus: "ASSIGNED" });
    await newLoad({ containerNo: "GONE", transportStatus: "IN_TRANSIT" });

    const res = await call("get", "/api/reports/noPickup", staff, ny);
    expect(res.body.rows.map((r) => r.containerNo)).toEqual(["WAITING"]);
  });

  it("does not chase a delivered load for a missing appointment", async () => {
    // A delivered load with no appointment on file is history, not an exception.
    await newLoad({ containerNo: "PENDING", transportStatus: "NEW_LOAD" });
    await newLoad({ containerNo: "DONE", transportStatus: "DELIVERED" });

    const res = await call("get", "/api/reports/noAppointment", staff, ny);
    expect(res.body.rows.map((r) => r.containerNo)).toEqual(["PENDING"]);
  });

  it("treats a delivered load with no POD as paperwork pending", async () => {
    await newLoad({
      containerNo: "NO-POD",
      transportStatus: "DELIVERED",
      documents: [{ documentType: "Bill Of Lading", fileName: "bol.pdf" }],
    });
    await newLoad({
      containerNo: "COMPLETE",
      transportStatus: "DELIVERED",
      documents: [
        { documentType: "Proof of Delivery", fileName: "pod.pdf" },
        { documentType: "Bill Of Lading", fileName: "bol.pdf" },
      ],
    });

    const res = await call("get", "/api/reports/paperworkPending", staff, ny);

    expect(res.body.rows.map((r) => r.containerNo)).toEqual(["NO-POD"]);
    expect(res.body.rows[0].missingDocs).toBe("Proof of Delivery");
  });

  it("lists delivered loads that have not been invoiced", async () => {
    const uninvoiced = await newLoad({
      containerNo: "TO-BILL",
      transportStatus: "DELIVERED",
    });
    const invoiced = await newLoad({
      containerNo: "BILLED",
      transportStatus: "DELIVERED",
    });

    await withTenant({ locationId: String(ny._id) }, async () => {
      const doc = await Load.findById(invoiced._id);
      doc.accounting = { receivables: { invoicedAt: new Date(), lines: [] } };
      await doc.save();
    });

    const res = await call("get", "/api/reports/invoiceable", staff, ny);

    expect(res.body.rows.map((r) => r.containerNo)).toEqual(["TO-BILL"]);
    // Falls back to the headline amount when the ledger was never built out —
    // the load is still billable and omitting it would understate what is owed.
    expect(res.body.rows[0].total).toBe(1000);
  });
});

describe("Grouping", () => {
  it("groups customer-wise loads with subtotals", async () => {
    await newLoad({ customerName: "Acme Imports", amount: 1000 });
    await newLoad({ customerName: "Acme Imports", amount: 500 });
    await newLoad({ customerName: "Globex", amount: 300 });

    const res = await call("get", "/api/reports/customerWise", staff, ny);

    expect(res.body.groups).toHaveLength(2);
    // Biggest group first — most likely the one the reader opened it for.
    expect(res.body.groups[0].name).toBe("Acme Imports");
    expect(res.body.groups[0].totals.amount).toBe(1500);
  });
});

describe("CSV export", () => {
  it("downloads as a CSV attachment", async () => {
    await newLoad();

    const res = await call("get", "/api/reports/dailyEntered/export", staff, ny);

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/csv/);
    expect(res.headers["content-disposition"]).toMatch(/attachment/);
    expect(res.text).toMatch(/Load ID/);
  });

  it("neutralises a value Excel would run as a formula", () => {
    // A customer named "=cmd|..." executing on open is the textbook case.
    // The leading tab neutralises the formula while still showing the text.
    // Quoting is only added when the value also contains a comma or a quote.
    expect(csvEscape("=1+1")).toBe("\t=1+1");
    expect(csvEscape("+SUM(A1)")).toBe("\t+SUM(A1)");
    expect(csvEscape("@import")).toBe("\t@import");
    expect(csvEscape("=cmd|,x")).toBe('"\t=cmd|,x"');
  });

  it("quotes fields containing commas and quotes", () => {
    expect(csvEscape("Acme, Inc")).toBe('"Acme, Inc"');
    expect(csvEscape('He said "hi"')).toBe('"He said ""hi"""');
  });

  it("writes money as a bare number so the column stays summable", () => {
    const csv = toCsv({
      columns: [
        { key: "loadId", label: "Load ID" },
        { key: "amount", label: "Amount", type: "money" },
      ],
      rows: [{ loadId: "NY-LD-0001", amount: 1234.5 }],
      totals: { count: 1, amount: 1234.5 },
    });

    expect(csv).toMatch(/NY-LD-0001,1234.5/);
    expect(csv).not.toMatch(/\$1,234/);
    expect(csv).toMatch(/TOTAL \(1 rows\)/);
  });
});

describe("Paying a driver", () => {
  let driver;
  let load;

  beforeEach(async () => {
    let carrier;
    await withTenant({ locationId: String(ny._id) }, async () => {
      carrier = await FleetOwner.create({ carrierName: "Swift Haulage" });
      driver = await Driver.create({
        fleetOwner: carrier._id,
        name: "Ravi Kumar",
        email: "ravi@swift.com",
        payType: "FLAT",
        payRate: 450,
      });
    });

    load = await newLoad();
    await withTenant({ locationId: String(ny._id) }, async () => {
      const doc = await Load.findById(load._id);
      doc.accounting = {
        payroll: {
          driver: driver._id,
          driverName: "Ravi Kumar",
          payType: "FLAT",
          rate: 450,
          amount: 450,
          calculatedAt: new Date(),
        },
      };
      await doc.save();
    });
  });

  it("settles the loads and prepares the statement", async () => {
    const res = await call("post", "/api/reports/driver-payable/pay", staff, ny).send({
      driver: String(driver._id),
      reference: "ACH 20260815",
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(450);
    expect(res.body.loadCount).toBe(1);
    // Itemised, not a lump sum — "you were paid $450" invites the phone call
    // this email exists to avoid.
    expect(res.body.statement[0].loadId).toBe(load.loadId);

    const settled = await withTenant({ locationId: String(ny._id) }, () =>
      Load.findById(load._id),
    );
    expect(settled.accounting.payroll.settledAt).toBeTruthy();
  });

  it("does not pay the same load twice", async () => {
    await call("post", "/api/reports/driver-payable/pay", staff, ny).send({
      driver: String(driver._id),
    });

    const second = await call("post", "/api/reports/driver-payable/pay", staff, ny).send({
      driver: String(driver._id),
    });

    expect(second.statusCode).toBe(400);
    expect(second.body.message).toMatch(/nothing outstanding/i);
  });

  it("still records the payment when the driver has no email on file", async () => {
    await withTenant({ locationId: String(ny._id) }, async () => {
      const record = await Driver.findById(driver._id);
      record.email = undefined;
      await record.save();
    });

    const res = await call("post", "/api/reports/driver-payable/pay", staff, ny).send({
      driver: String(driver._id),
    });

    // The payment is a fact; the email is a courtesy. Failing the first because
    // of the second would leave the books wrong.
    expect(res.statusCode).toBe(200);
    expect(res.body.emailStatus.sent).toBe(false);
    expect(res.body.emailStatus.reason).toBe("NO_EMAIL");
  });

  it("pays only the loads named when a subset is given", async () => {
    const second = await newLoad();
    await withTenant({ locationId: String(ny._id) }, async () => {
      const doc = await Load.findById(second._id);
      doc.accounting = {
        payroll: {
          driver: driver._id,
          driverName: "Ravi Kumar",
          payType: "FLAT",
          rate: 200,
          amount: 200,
          calculatedAt: new Date(),
        },
      };
      await doc.save();
    });

    const res = await call("post", "/api/reports/driver-payable/pay", staff, ny).send({
      driver: String(driver._id),
      loadIds: [load.loadId],
    });

    expect(res.body.total).toBe(450);

    const stillOwed = await call(
      "get",
      "/api/reports/driverPayable?settledState=unsettled",
      staff,
      ny,
    );
    expect(stillOwed.body.totals.payAmount).toBe(200);
  });
});

describe("Who can run reports", () => {
  it("keeps a carrier out entirely", async () => {
    const carrierUser = await User.create({
      email: "carrier@x.com",
      password: "x",
      role: "fleetOwner",
      locations: [ny._id],
      defaultLocation: ny._id,
    });

    const res = await call("get", "/api/reports/receivables", carrierUser, ny);
    expect(res.statusCode).toBe(403);
  });

  it("separates being able to read from being able to export", async () => {
    // An export leaves the system and gets forwarded, so it is a separate grant.
    const reader = await User.create({
      email: "reader@fms.com",
      password: "x",
      role: "staff",
      locations: [ny._id],
      defaultLocation: ny._id,
      permissions: ["reports.view"],
    });

    expect((await call("get", "/api/reports/receivables", reader, ny)).statusCode).toBe(200);
    expect(
      (await call("get", "/api/reports/receivables/export", reader, ny)).statusCode,
    ).toBe(403);
  });
});
