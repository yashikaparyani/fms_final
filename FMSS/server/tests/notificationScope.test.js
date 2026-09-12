// Notifications, bulk inserts and locations.
//
// Two production failures this protects against:
//
//   1. "next is not a function" on every new load. The tenant plugin's
//      insertMany hook was written for Mongoose 8, where middleware received a
//      `next` callback. Mongoose 9 passes the documents instead, so the hook
//      called the docs array and every bulk insert of a scoped model threw —
//      which is how staff stopped hearing about new loads.
//
//   2. "Cannot create a Notification while viewing all locations" whenever an
//      admin in the all-locations view changed a load's status. A notification
//      about a load belongs to the load's location, not the viewer's.

const mongoose = require("mongoose");
const { connect, closeDatabase, clearDatabase } = require("./setup");
const { withTenant } = require("../utils/tenantContext");
const Notification = require("../models/Notification");
const Load = require("../models/Load");
const { notifyLoadCreated } = require("../services/NotificationService");
const User = require("../models/User");

const NY = new mongoose.Types.ObjectId();
const LA = new mongoose.Types.ObjectId();

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

/** A bare load document filed under `locationId`, bypassing load validation. */
const loadIn = async (locationId) => {
  const _id = new mongoose.Types.ObjectId();
  await Load.collection.insertOne({ _id, loadId: `LD ${String(_id).slice(-4)}`, locationId });
  return { _id, loadId: `LD ${String(_id).slice(-4)}`, locationId };
};

const unscopedNotifications = () =>
  withTenant({ unscoped: true }, () => Notification.find({}).lean());

describe("Bulk inserting notifications", () => {
  it("works under a single location, stamping it on every row", async () => {
    const recipients = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];

    await withTenant({ locationId: NY }, () =>
      Notification.insertMany(
        recipients.map((recipient) => ({
          recipient,
          recipientRole: "staff",
          type: "LOAD_CREATED",
          title: "t",
          message: "m",
        })),
      ),
    );

    const rows = await unscopedNotifications();
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => String(row.locationId) === String(NY))).toBe(true);
  });

  it("still refuses a row with no location when nothing says where it belongs", async () => {
    await expect(
      withTenant({ allLocations: true }, () =>
        Notification.insertMany([
          {
            recipient: new mongoose.Types.ObjectId(),
            recipientRole: "staff",
            type: "LOAD_CREATED",
            title: "t",
            message: "m",
          },
        ]),
      ),
    ).rejects.toThrow(/all locations/i);
  });

  it("notifies staff about a new load instead of throwing", async () => {
    const load = await loadIn(NY);
    await withTenant({ unscoped: true }, () =>
      User.collection.insertMany([
        { role: "staff", isActive: true, email: "s1@x.com" },
        { role: "admin", isActive: true, email: "a1@x.com" },
      ]),
    );

    await withTenant({ locationId: NY }, () =>
      notifyLoadCreated({ load, customerName: "TSL" }),
    );

    const rows = await unscopedNotifications();
    expect(rows).toHaveLength(2);
  });
});

describe("A notification about a load is filed where the load is", () => {
  it("can be created while viewing all locations", async () => {
    const load = await loadIn(NY);

    await withTenant({ allLocations: true }, () =>
      Notification.create({
        recipient: new mongoose.Types.ObjectId(),
        recipientRole: "client",
        type: "LOAD_CREATED",
        title: "t",
        message: "m",
        load: load._id,
        loadId: load.loadId,
      }),
    );

    const [row] = await unscopedNotifications();
    expect(String(row.locationId)).toBe(String(NY));
  });

  it("goes to the load's location, not the one the user is looking at", async () => {
    const load = await loadIn(NY);

    await withTenant({ locationId: LA }, () =>
      Notification.insertMany([
        {
          recipient: new mongoose.Types.ObjectId(),
          recipientRole: "staff",
          type: "LOAD_CREATED",
          title: "t",
          message: "m",
          load: load._id,
          loadId: load.loadId,
        },
      ]),
    );

    const [row] = await unscopedNotifications();
    expect(String(row.locationId)).toBe(String(NY));
  });
});
