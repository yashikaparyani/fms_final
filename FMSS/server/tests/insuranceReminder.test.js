// Insurance expiry reminders: a policy inside its last 10 days chases the office,
// the carrier and the carrier's drivers in-app, every day, turning urgent (red)
// inside the last 3 days and once it has lapsed.

const mongoose = require("mongoose");
const { connect, closeDatabase, clearDatabase } = require("./setup");
const { seed, TEST_LOCATION_ID } = require("./helpers/tenantTestContext");
const { runUnscoped } = require("../utils/tenantContext");

const User = require("../models/User");
const FleetOwner = require("../models/FleetOwner");
const Driver = require("../models/Driver");
const CarrierOnboarding = require("../models/CarrierOnboarding");
const Notification = require("../models/Notification");

const { remindExpiringInsurance } = require("../services/insuranceReminderService");

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

let admin;
let carrier;
let carrierUser;
let driverUser;

const daysFromNow = (n) => {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
};

// A carrier with a userId + drivers + an onboarding file whose policy expires in
// `daysLeft` days.
const setup = async (daysLeft) => {
  admin = await User.create({
    email: "office@fms.com",
    password: "password123",
    role: "admin",
    isActive: true,
  });
  carrierUser = await User.create({
    email: "carrier@sline.com",
    password: "password123",
    role: "fleetOwner",
    isActive: true,
  });
  driverUser = await User.create({
    email: "driver@sline.com",
    password: "password123",
    role: "driver",
    isActive: true,
  });

  await seed(async () => {
    carrier = await FleetOwner.create({
      carrierName: "S Line",
      userId: carrierUser._id,
    });
    await Driver.create({
      name: "Ramesh",
      fleetOwner: carrier._id,
      userId: driverUser._id,
    });
    await CarrierOnboarding.create({
      fleetOwner: carrier._id,
      insurance: {
        submittedAt: new Date(),
        policies: [
          { coverage: "autoLiability", limit: 1000000, expiryDate: daysFromNow(daysLeft) },
        ],
      },
    });
  });
};

const notifsFor = (userId) =>
  runUnscoped(() =>
    Notification.find({ recipient: userId, type: "INSURANCE_EXPIRING" }).lean(),
  );

describe("remindExpiringInsurance", () => {
  it("reminds the office, the carrier and the driver inside the last 10 days", async () => {
    await setup(5);

    const result = await remindExpiringInsurance();
    expect(result.created).toBe(3); // admin + carrier + driver

    expect(await notifsFor(admin._id)).toHaveLength(1);
    expect(await notifsFor(carrierUser._id)).toHaveLength(1);
    expect(await notifsFor(driverUser._id)).toHaveLength(1);

    const carrierNote = (await notifsFor(carrierUser._id))[0];
    expect(carrierNote.severity).toBe("INFO"); // 5 days out — not urgent yet
    expect(carrierNote.message).toMatch(/your insurance/i);
  });

  it("marks the reminder URGENT inside the last 3 days", async () => {
    await setup(2);
    await remindExpiringInsurance();

    const note = (await notifsFor(carrierUser._id))[0];
    expect(note.severity).toBe("URGENT");
  });

  it("stays URGENT once the policy has already expired", async () => {
    await setup(-1);
    await remindExpiringInsurance();

    const note = (await notifsFor(admin._id))[0];
    expect(note.severity).toBe("URGENT");
    expect(note.message).toMatch(/expired/i);
  });

  it("says nothing while expiry is more than 10 days away", async () => {
    await setup(20);
    const result = await remindExpiringInsurance();

    expect(result.created).toBe(0);
    expect(await notifsFor(carrierUser._id)).toHaveLength(0);
  });

  it("does not remind the same recipient twice in one day", async () => {
    await setup(5);
    await remindExpiringInsurance();
    const second = await remindExpiringInsurance();

    expect(second.created).toBe(0);
    expect(await notifsFor(carrierUser._id)).toHaveLength(1);
  });
});
