// services/accountDeletion.js
//
// A customer, carrier or driver deleting their own account.
//
// Deletion ANONYMIZES rather than removes. The login is shut and the personal
// details on the account are wiped — name, email, phone, contacts, tax id,
// licence — but the loads, invoices, bills and payments the account took part
// in stay in the books. Those are financial and legal records: an issued invoice
// must keep saying what it said, and a carrier bill must still add up. Snapshots
// already written onto those records (the customer or carrier name printed on a
// load or an invoice) are left exactly as they were.
//
// Staff and admins cannot delete themselves: an admin removes staff from Staff
// Management, and a self-deleted admin could leave the office with nobody able
// to sign in.

const crypto = require("crypto");
const fs = require("fs");
const User = require("../models/User");
const Customer = require("../models/Customer");
const FleetOwner = require("../models/FleetOwner");
const Driver = require("../models/Driver");
const Load = require("../models/Load");
const Bid = require("../models/bidSchema");
const { runUnscoped } = require("../utils/tenantContext");
const { runningLoadsFilter } = require("../utils/carrierCapacity");
const { OFF_TRANSIT_TRANSPORT_STATUSES } = require("../config/transportStatuses");

const SELF_DELETABLE_ROLES = ["client", "fleetOwner", "driver"];

/** An address nobody can receive mail at, unique per account. */
const tombstoneEmail = (id) => `deleted-${id}@deleted.invalid`;

/** Shut one login and wipe what identifies the person behind it. */
const scrubUser = (user, label) => {
  user.firstName = label;
  user.lastName = "";
  user.email = tombstoneEmail(user._id);
  user.phone = undefined;
  user.pushTokens = [];
  // A random password nobody knows, hashed on save — belt and braces on top of
  // isDeleted, which sign-in and every authenticated request already refuse.
  user.password = crypto.randomBytes(32).toString("hex");
  user.isActive = false;
  user.isDeleted = true;
  user.deletedAt = new Date();
};

/** Wipe a driver record: name, contact details and the licence scan. */
const scrubDriver = async (driver) => {
  const scan = driver.licenseDocument?.filePath;

  driver.name = "Deleted driver";
  driver.phone = undefined;
  driver.email = undefined;
  driver.licenseNumber = undefined;
  driver.licenseDocument = undefined;
  driver.notes = undefined;
  driver.active = false;
  await driver.save();

  if (scan) fs.promises.unlink(scan).catch(() => {});

  if (driver.userId) {
    const login = await User.findById(driver.userId);
    if (login && !login.isDeleted) {
      scrubUser(login, "Deleted driver");
      await login.save();
    }
  }
};

/**
 * A load this account is in the middle of, if any.
 *
 * Deleting mid-job would strand a load on the road with nobody to update it or
 * to contact, so the account is asked to finish (or hand it back) first.
 */
const activeLoadFor = async (user) => {
  if (user.role === "client") {
    return Load.findOne({
      $or: [{ creatorId: user._id }, { customer: user._id }],
      status: "ASSIGNED",
      transportStatus: { $nin: OFF_TRANSIT_TRANSPORT_STATUSES },
    })
      .select("loadId")
      .lean();
  }

  if (user.role === "fleetOwner") {
    const carrier = await FleetOwner.findOne({ userId: user._id }).select("_id").lean();
    if (!carrier) return null;
    return Load.findOne(runningLoadsFilter(carrier._id)).select("loadId").lean();
  }

  if (user.role === "driver") {
    const driver = await Driver.findOne({ userId: user._id }).select("_id").lean();
    if (!driver) return null;
    return Load.findOne({
      "driverAssignments.driver": driver._id,
      transportStatus: { $nin: OFF_TRANSIT_TRANSPORT_STATUSES },
    })
      .select("loadId")
      .lean();
  }

  return null;
};

/**
 * Delete (anonymize) one account.
 *
 * Throws an Error with `status` and `code` for anything the caller should show:
 * a role that cannot self-delete, or a load still in progress.
 */
const deleteAccount = (userId) =>
  runUnscoped(async () => {
    const user = await User.findById(userId);
    if (!user || user.isDeleted) {
      throw Object.assign(new Error("Account not found."), { status: 404 });
    }

    if (!SELF_DELETABLE_ROLES.includes(user.role)) {
      throw Object.assign(
        new Error("Staff and admin accounts are removed by an administrator, not deleted from here."),
        { status: 403, code: "ROLE_CANNOT_SELF_DELETE" },
      );
    }

    const busy = await activeLoadFor(user);
    if (busy) {
      throw Object.assign(
        new Error(
          `Load ${busy.loadId} is still in progress on this account. ` +
            "Finish it, or ask the office to take it off you, then delete the account.",
        ),
        { status: 409, code: "ACTIVE_LOAD", loadId: busy.loadId },
      );
    }

    if (user.role === "client") {
      const customer = await Customer.findOne({ user: user._id });
      if (customer) {
        customer.customerName = "Deleted customer";
        customer.contact = undefined;
        customer.emails = {};
        customer.active = false;
        await customer.save();
      }
    }

    if (user.role === "fleetOwner") {
      const carrier = await FleetOwner.findOne({ userId: user._id });
      if (carrier) {
        // Bids still waiting on an open window are withdrawn — a deleted
        // carrier must not be able to win a load.
        const openLoads = await Load.find({ bidStatus: { $in: ["OPEN", "UPCOMING"] } })
          .select("_id")
          .lean();
        await Bid.deleteMany({
          fleetOwnerId: carrier._id,
          loadId: { $in: openLoads.map((l) => l._id) },
        });

        // Every driver on the roster goes with the carrier.
        const drivers = await Driver.find({ fleetOwner: carrier._id });
        for (const driver of drivers) await scrubDriver(driver);

        // And any driver login hung off this account without a roster entry.
        const subAccounts = await User.find({ parentAccount: user._id, isDeleted: { $ne: true } });
        for (const login of subAccounts) {
          scrubUser(login, "Deleted driver");
          await login.save();
        }

        carrier.carrierName = "Deleted carrier";
        carrier.phone = undefined;
        carrier.taxId = undefined;
        carrier.contactPersons = [];
        carrier.status = "INACTIVE";
        carrier.active = false;
        await carrier.save();
      }
    }

    if (user.role === "driver") {
      const driver = await Driver.findOne({ userId: user._id });
      if (driver) await scrubDriver(driver);
    }

    if (!user.isDeleted) {
      scrubUser(user, "Deleted user");
      await user.save();
    }

    return { role: user.role };
  });

module.exports = { deleteAccount, activeLoadFor, SELF_DELETABLE_ROLES };
