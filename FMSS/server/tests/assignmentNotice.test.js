// A carrier is told when a load is given to them — once, and only the carrier
// who is new on it. See services/assignmentNotice.js and the save hook in
// models/Load.js.

const mongoose = require("mongoose");
const { connect, closeDatabase, clearDatabase } = require("./setup");
const { seed } = require("./helpers/tenantTestContext");
const Load = require("../models/Load");
const FleetOwner = require("../models/FleetOwner");
const Notification = require("../models/Notification");
const { runUnscoped } = require("../utils/tenantContext");

const FIRST_USER = new mongoose.Types.ObjectId();
const SECOND_USER = new mongoose.Types.ObjectId();
let first;
let second;

const newLoad = (over = {}) => ({
  loadId: "LD 9001",
  createdBy: "staff",
  creatorId: new mongoose.Types.ObjectId(),
  customer: new mongoose.Types.ObjectId(),
  truckType: "Container",
  material: "Boxes",
  amount: 1000,
  ...over,
});

const assignedNotices = () =>
  runUnscoped(() => Notification.find({ type: "LOAD_ASSIGNED" }).lean());

const assign = (load, carrier) => {
  load.assignedFleetOwner = {
    fleetOwnerId: carrier._id,
    fleetOwnerName: carrier.carrierName,
    assignedAt: new Date(),
  };
  load.status = "ASSIGNED";
  return load.save();
};

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

beforeEach(async () => {
  [first, second] = await seed(() =>
    FleetOwner.create([
      { userId: FIRST_USER, carrierName: "First Carrier" },
      { userId: SECOND_USER, carrierName: "Second Carrier" },
    ]),
  );
});

describe("Telling a carrier about an assignment", () => {
  it("notifies the carrier a load is assigned to", async () => {
    await seed(async () => {
      const load = await Load.create(newLoad());
      await assign(await Load.findById(load._id), first);
    });

    const notices = await assignedNotices();
    expect(notices).toHaveLength(1);
    expect(String(notices[0].recipient)).toBe(String(FIRST_USER));
    expect(notices[0].loadId).toBe("LD 9001");
  });

  it("does not repeat it when the load is saved again", async () => {
    await seed(async () => {
      const load = await Load.create(newLoad());
      await assign(await Load.findById(load._id), first);

      const reread = await Load.findById(load._id);
      reread.material = "Pallets";
      await reread.save();
    });

    expect(await assignedNotices()).toHaveLength(1);
  });

  it("tells only the new carrier on a reassignment", async () => {
    await seed(async () => {
      const load = await Load.create(newLoad());
      await assign(await Load.findById(load._id), first);
      await assign(await Load.findById(load._id), second);
    });

    const recipients = (await assignedNotices()).map((n) => String(n.recipient));
    expect(recipients.sort()).toEqual([String(FIRST_USER), String(SECOND_USER)].sort());
  });

  it("covers a load created already assigned", async () => {
    await seed(() =>
      Load.create(
        newLoad({
          status: "ASSIGNED",
          assignedFleetOwner: { fleetOwnerId: first._id, fleetOwnerName: "First Carrier" },
        }),
      ),
    );

    expect(await assignedNotices()).toHaveLength(1);
  });
});
