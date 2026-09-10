// Paying the drivers out of a load's payables.
//
// A load handed over part way has two drivers and each is owed their own
// figure, on their own day. So driver pay is lines on the payables ledger
// naming a person, rather than a separate payroll record — one place answering
// "what does this load cost us", and one save that cannot leave two ledgers
// disagreeing.
//
// The rule worth protecting is that paying somebody is not an edit. The screen
// submits the whole side on every save, so a save must carry payment state
// forward rather than take it from the submission — otherwise an admin fixing a
// fuel figure silently un-pays a driver who was settled last week.

const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const { connect, closeDatabase, clearDatabase } = require("./setup");
const { seed, TEST_LOCATION_ID } = require("./helpers/tenantTestContext");
const { withTenant } = require("../utils/tenantContext");
const Load = require("../models/Load");

const STAFF_ID = new mongoose.Types.ObjectId();
const DRIVER_A = new mongoose.Types.ObjectId();
const DRIVER_B = new mongoose.Types.ObjectId();

jest.mock("../middleware/auth", () =>
  require("./helpers/tenantTestContext").authMock({ defaultRole: "admin" }),
);

const {
  getLoadAccounting,
  savePayables,
  payDriver,
} = require("../controllers/accountingController");

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = { _id: STAFF_ID, role: "admin" };
  next();
});

const scoped = (handler) => (req, res) =>
  withTenant({ locationId: TEST_LOCATION_ID }, () => handler(req, res));

app.get("/api/accounting/loads/:loadId", scoped(getLoadAccounting));
app.put("/api/accounting/loads/:loadId/payables", scoped(savePayables));
app.put(
  "/api/accounting/loads/:loadId/payables/drivers/:driverId/pay",
  scoped(payDriver),
);

const makeLoad = (over = {}) =>
  seed(() =>
    Load.create({
      loadId: "LD 0001",
      createdBy: "staff",
      creatorId: STAFF_ID,
      customer: new mongoose.Types.ObjectId(),
      truckType: "Container",
      material: "Boxes",
      amount: 1000,
      status: "ASSIGNED",
      transportStatus: "DELIVERED",
      driverAssignments: [
        { driver: DRIVER_A, driverName: "Ana Ruiz", driverCode: "D-01" },
        { driver: DRIVER_B, driverName: "Bo Chen", driverCode: "D-02" },
      ],
      ...over,
    }),
  );

const reload = () => seed(() => Load.findOne({ loadId: "LD 0001" }));
const books = () => request(app).get("/api/accounting/loads/LD 0001");

const driverLines = () => [
  { chargeType: "driverPay", amount: 300, driverId: String(DRIVER_A), driverName: "Ana Ruiz" },
  { chargeType: "driverPay", amount: 250, driverId: String(DRIVER_B), driverName: "Bo Chen" },
];

const rowFor = (body, driverId) =>
  body.driverPayables.find((r) => r.driverId === String(driverId));

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe("Every driver on the load shows in the payables", () => {
  it("lists them before anybody has costed them", async () => {
    await makeLoad();

    const res = await books();

    expect(res.body.driverPayables).toHaveLength(2);
    // A driver nobody has costed is a gap to fill, not an absence — so they are
    // present at zero rather than missing.
    expect(rowFor(res.body, DRIVER_A)).toMatchObject({
      driverName: "Ana Ruiz",
      driverCode: "D-01",
      amount: 0,
      uncosted: true,
      paid: false,
    });
  });

  it("keeps each driver's amount separate", async () => {
    await makeLoad();

    await request(app)
      .put("/api/accounting/loads/LD 0001/payables")
      .send({ lines: driverLines() });

    const res = await books();
    expect(rowFor(res.body, DRIVER_A).amount).toBe(300);
    expect(rowFor(res.body, DRIVER_B).amount).toBe(250);
    expect(res.body.payables.totals.total).toBe(550);
  });

  it("adds up several lines owed to the same driver", async () => {
    await makeLoad();

    await request(app)
      .put("/api/accounting/loads/LD 0001/payables")
      .send({
        lines: [
          ...driverLines(),
          {
            chargeType: "driverPay",
            amount: 50,
            note: "Detention",
            driverId: String(DRIVER_A),
            driverName: "Ana Ruiz",
          },
        ],
      });

    const res = await books();
    expect(rowFor(res.body, DRIVER_A)).toMatchObject({ amount: 350, lineCount: 2 });
  });

  it("still shows a driver who was costed and then taken off the load", async () => {
    await makeLoad();
    await request(app)
      .put("/api/accounting/loads/LD 0001/payables")
      .send({ lines: driverLines() });

    await seed(async () => {
      const load = await Load.findOne({ loadId: "LD 0001" });
      load.driverAssignments = [load.driverAssignments[0]];
      await load.save();
    });

    const res = await books();
    const gone = rowFor(res.body, DRIVER_B);

    // The money is real, so the row stays and says why it looks odd — it is
    // exactly the one somebody needs to look at and correct.
    expect(gone).toMatchObject({ amount: 250, onLoad: false, driverName: "Bo Chen" });
  });
});

describe("Paying one driver", () => {
  const cost = () =>
    request(app)
      .put("/api/accounting/loads/LD 0001/payables")
      .send({ lines: driverLines() });

  it("settles that driver and leaves the other owed", async () => {
    await makeLoad();
    await cost();

    const res = await request(app)
      .put(`/api/accounting/loads/LD 0001/payables/drivers/${DRIVER_A}/pay`)
      .send({ paid: true });

    expect(res.status).toBe(200);
    expect(rowFor(res.body.accounting, DRIVER_A).paid).toBe(true);
    expect(rowFor(res.body.accounting, DRIVER_B).paid).toBe(false);
  });

  it("moves every line owed to that driver together", async () => {
    await makeLoad();
    await request(app)
      .put("/api/accounting/loads/LD 0001/payables")
      .send({
        lines: [
          ...driverLines(),
          {
            chargeType: "driverPay",
            amount: 50,
            note: "Detention",
            driverId: String(DRIVER_A),
            driverName: "Ana Ruiz",
          },
        ],
      });

    await request(app)
      .put(`/api/accounting/loads/LD 0001/payables/drivers/${DRIVER_A}/pay`)
      .send({ paid: true });

    const load = await reload();
    const theirs = load.accounting.payables.lines.filter(
      (line) => String(line.driverId) === String(DRIVER_A),
    );
    expect(theirs).toHaveLength(2);
    expect(theirs.every((line) => line.paidAt)).toBe(true);
  });

  it("refuses to pay a driver nobody has costed", async () => {
    await makeLoad();

    const res = await request(app)
      .put(`/api/accounting/loads/LD 0001/payables/drivers/${DRIVER_A}/pay`)
      .send({ paid: true });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("DRIVER_NOT_COSTED");
  });

  it("can be put back — paying the wrong person is an ordinary mistake", async () => {
    await makeLoad();
    await cost();
    await request(app)
      .put(`/api/accounting/loads/LD 0001/payables/drivers/${DRIVER_A}/pay`)
      .send({ paid: true });

    const res = await request(app)
      .put(`/api/accounting/loads/LD 0001/payables/drivers/${DRIVER_A}/pay`)
      .send({ paid: false });

    expect(rowFor(res.body.accounting, DRIVER_A).paid).toBe(false);
  });
});

// A fuel surcharge is quoted both ways in the real world — a flat $85, or "18%
// of linehaul". Both end up as a cash amount so nothing downstream has to know
// the difference; what the percentage buys is that a linehaul correction moves
// the surcharge with it instead of leaving a stale figure nobody notices.
describe("Fuel surcharge quoted as a percentage", () => {
  const withFuel = (fuel) =>
    request(app)
      .put("/api/accounting/loads/LD 0001/payables")
      .send({ lines: [{ chargeType: "linehaul", amount: 1000 }, fuel] });

  const fuelLine = (body) =>
    body.payables.lines.find((l) => l.chargeType === "fuelSurcharge");

  it("works the cash figure out from the rate", async () => {
    await makeLoad();

    await withFuel({ chargeType: "fuelSurcharge", basis: "PERCENT", rate: 18 });

    const res = await books();
    expect(fuelLine(res.body)).toMatchObject({ basis: "PERCENT", rate: 18, amount: 180 });
    expect(res.body.payables.totals.total).toBe(1180);
  });

  it("still takes a flat amount", async () => {
    await makeLoad();

    await withFuel({ chargeType: "fuelSurcharge", amount: 85 });

    const res = await books();
    expect(fuelLine(res.body)).toMatchObject({ basis: "AMOUNT", amount: 85 });
    expect(res.body.payables.totals.total).toBe(1085);
  });

  it("follows the linehaul when it is corrected", async () => {
    await makeLoad();
    await withFuel({ chargeType: "fuelSurcharge", basis: "PERCENT", rate: 18 });

    await request(app)
      .put("/api/accounting/loads/LD 0001/payables")
      .send({
        lines: [
          { chargeType: "linehaul", amount: 1200 },
          // The browser sends back the amount it last saw. It is recomputed
          // rather than trusted, which is the whole point.
          { chargeType: "fuelSurcharge", basis: "PERCENT", rate: 18, amount: 180 },
        ],
      });

    const res = await books();
    expect(fuelLine(res.body).amount).toBe(216);
  });

  // The percentage is of the linehaul, never the total — 18% of a total that
  // already contains the fuel is circular, and line order would decide it.
  it("takes the percentage of the linehaul, not of the running total", async () => {
    await makeLoad();

    await request(app)
      .put("/api/accounting/loads/LD 0001/payables")
      .send({
        lines: [
          { chargeType: "linehaul", amount: 1000 },
          { chargeType: "detention", amount: 500 },
          { chargeType: "fuelSurcharge", basis: "PERCENT", rate: 10 },
        ],
      });

    const res = await books();
    expect(fuelLine(res.body).amount).toBe(100);
  });

  it("refuses to treat a cash-only charge as a percentage", async () => {
    await makeLoad();

    await request(app)
      .put("/api/accounting/loads/LD 0001/payables")
      .send({
        lines: [
          { chargeType: "linehaul", amount: 1000 },
          { chargeType: "detention", basis: "PERCENT", rate: 50, amount: 75 },
        ],
      });

    const res = await books();
    const detention = res.body.payables.lines.find((l) => l.chargeType === "detention");
    // Taken as the $75 it actually is, rather than silently becoming $500.
    expect(detention).toMatchObject({ basis: "AMOUNT", amount: 75 });
  });
});

describe("Saving the payables does not disturb who has been paid", () => {
  it("carries a settled driver's payment through an unrelated edit", async () => {
    await makeLoad();
    await request(app)
      .put("/api/accounting/loads/LD 0001/payables")
      .send({ lines: driverLines() });
    await request(app)
      .put(`/api/accounting/loads/LD 0001/payables/drivers/${DRIVER_A}/pay`)
      .send({ paid: true });

    // Somebody adds a fuel line and saves the whole side again.
    await request(app)
      .put("/api/accounting/loads/LD 0001/payables")
      .send({
        lines: [...driverLines(), { chargeType: "fuelSurcharge", amount: 40 }],
      });

    const res = await books();
    expect(rowFor(res.body, DRIVER_A).paid).toBe(true);
    expect(rowFor(res.body, DRIVER_B).paid).toBe(false);
  });

  it("ignores a payment state sent by the browser", async () => {
    await makeLoad();

    // Nobody has been paid; the submission claims otherwise.
    await request(app)
      .put("/api/accounting/loads/LD 0001/payables")
      .send({
        lines: driverLines().map((line) => ({
          ...line,
          paidAt: new Date().toISOString(),
        })),
      });

    const res = await books();
    expect(rowFor(res.body, DRIVER_A).paid).toBe(false);
    expect(rowFor(res.body, DRIVER_B).paid).toBe(false);
  });
});
