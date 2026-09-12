// What a driver is owed on one load, counted once.
//
// Driver pay can be recorded as the load's payroll figure, as ledger lines
// stamped with the driver, or — in practice — both. The Driver Payable Report
// added them together, so a run entered in both places printed at double. These
// pin the rule in driverChargesFor that stops that.

const mongoose = require("mongoose");
const { driverChargesFor } = require("../config/reportDefinitions");

const DRIVER = new mongoose.Types.ObjectId();
const OTHER_DRIVER = new mongoose.Types.ObjectId();

const loadWith = ({ payroll = {}, lines = [] }) => ({
  accounting: {
    payroll: { driver: DRIVER, driverName: "Ajaib Singh", ...payroll },
    payables: { lines },
  },
});

describe("Counting a driver's pay once", () => {
  it("uses the payroll figure when nothing is on the ledger", () => {
    const result = driverChargesFor(loadWith({ payroll: { amount: 262.5 } }));

    expect(result.total).toBe(262.5);
    expect(result.charges.map((c) => c.label)).toEqual(["Driver pay"]);
  });

  it("does not add the payroll figure when the pay is already a ledger line", () => {
    const result = driverChargesFor(
      loadWith({
        payroll: { amount: 262.5 },
        lines: [{ chargeType: "linehaul", amount: 262.5, driverId: DRIVER }],
      }),
    );

    // The bug: this used to be 525.
    expect(result.total).toBe(262.5);
    expect(result.charges).toHaveLength(1);
  });

  it("keeps payroll as the pay when the ledger only holds extras", () => {
    const result = driverChargesFor(
      loadWith({
        payroll: { amount: 262.5 },
        lines: [{ chargeType: "detention", amount: 40, driverId: DRIVER }],
      }),
    );

    expect(result.total).toBe(302.5);
    expect(result.charges).toHaveLength(2);
  });

  it("ignores lines owed to a different driver", () => {
    const result = driverChargesFor(
      loadWith({
        payroll: { amount: 262.5 },
        lines: [{ chargeType: "linehaul", amount: 300, driverId: OTHER_DRIVER }],
      }),
    );

    expect(result.total).toBe(262.5);
  });
});

describe("Paid and open", () => {
  it("treats an advance as paid, never as a charge", () => {
    const result = driverChargesFor(
      loadWith({
        payroll: { amount: 262.5 },
        lines: [{ chargeType: "advance", amount: 100, driverId: DRIVER }],
      }),
    );

    expect(result.total).toBe(262.5);
    expect(result.paid).toBe(100);
    expect(result.openBalance).toBe(162.5);
  });

  it("reads paid state per charge", () => {
    const result = driverChargesFor(
      loadWith({
        payroll: { amount: 262.5, settledAt: new Date() },
        lines: [{ chargeType: "detention", amount: 40, driverId: DRIVER }],
      }),
    );

    expect(result.paid).toBe(262.5);
    expect(result.openBalance).toBe(40);
  });

  it("never reports more paid than owed", () => {
    const result = driverChargesFor(
      loadWith({
        payroll: { amount: 100, settledAt: new Date() },
        lines: [{ chargeType: "advance", amount: 50, driverId: DRIVER }],
      }),
    );

    expect(result.paid).toBe(100);
    expect(result.openBalance).toBe(0);
  });
});

// ─── Carriers ────────────────────────────────────────────────────────────────
const { carrierChargesFor } = require("../config/reportDefinitions");

const CARRIER_A = new mongoose.Types.ObjectId();
const CARRIER_B = new mongoose.Types.ObjectId();

describe("What each carrier is owed", () => {
  it("leaves driver pay off the carrier's sheet", () => {
    const [entry] = carrierChargesFor({
      assignedFleetOwner: { fleetOwnerId: CARRIER_A, fleetOwnerName: "Redline" },
      accounting: {
        payables: {
          lines: [
            { chargeType: "linehaul", amount: 800 },
            { chargeType: "linehaul", amount: 262.5, driverId: DRIVER },
          ],
        },
      },
    });

    // Counting the driver line here too would bill the load twice.
    expect(entry.total).toBe(800);
    expect(entry.carrierName).toBe("Redline");
  });

  it("gives each carrier on a split load their own entry", () => {
    const entries = carrierChargesFor({
      assignments: [
        { fleetOwnerId: CARRIER_A, fleetOwnerName: "Redline" },
        { fleetOwnerId: CARRIER_B, fleetOwnerName: "Gulf Drayage" },
      ],
      accounting: {
        payables: {
          lines: [
            { chargeType: "linehaul", amount: 500, fleetOwnerId: CARRIER_A },
            { chargeType: "linehaul", amount: 300, fleetOwnerId: CARRIER_B },
            { chargeType: "detention", amount: 50, fleetOwnerId: CARRIER_B },
          ],
        },
      },
    });

    const byName = Object.fromEntries(entries.map((e) => [e.carrierName, e.total]));
    expect(byName).toEqual({ Redline: 500, "Gulf Drayage": 350 });
  });

  it("counts everything paid once the payables side was settled as a whole", () => {
    const [entry] = carrierChargesFor({
      assignedFleetOwner: { fleetOwnerId: CARRIER_A, fleetOwnerName: "Redline" },
      accounting: {
        payables: {
          paidAt: new Date(),
          lines: [{ chargeType: "linehaul", amount: 800 }],
        },
      },
    });

    expect(entry.paid).toBe(800);
    expect(entry.openBalance).toBe(0);
  });

  it("treats a carrier advance as paid, not as a charge", () => {
    const [entry] = carrierChargesFor({
      assignedFleetOwner: { fleetOwnerId: CARRIER_A, fleetOwnerName: "Redline" },
      accounting: {
        payables: {
          lines: [
            { chargeType: "linehaul", amount: 800 },
            { chargeType: "advance", amount: 200 },
          ],
        },
      },
    });

    expect(entry.total).toBe(800);
    expect(entry.paid).toBe(200);
    expect(entry.openBalance).toBe(600);
  });
});
