const mongoose = require("mongoose");
const Load = require("../models/Load");
const Driver = require("../models/Driver");
const FleetOwner = require("../models/FleetOwner");
const Notification = require("../models/Notification");
const { sendPush } = require("./pushService");
const { getStaffAndAdminIds } = require("./NotificationService");
const { runUnscoped, withTenant } = require("../utils/tenantContext");
const { formatDateNumeric } = require("../utils/dates");
const {
  missingRequiredDocuments,
  hasDriverSubmittedPaperwork,
} = require("../config/paperwork");

// ─── Chasing the paperwork ────────────────────────────────────────────────────
// Everything that tells somebody a document is outstanding, in one place.
//
// There are two conversations here and they run in opposite directions:
//
//   office → carrier   "we still need the Bill of Lading", "this photo is
//                       unreadable, send another"
//   system → office    "this load was delivered on Tuesday and nobody has
//                       moved it to paperwork"
//
// The second one exists because the first one cannot start without it. A load
// left sitting at DELIVERED is invisible to the paperwork queue, so the driver
// is never chased, so the load is never invoiced — and nothing about that looks
// like a fault to anybody until the month-end numbers come up short.
//
// ── Why nothing here throws ──────────────────────────────────────────────────
// These are called from the middle of a status change and a document upload. A
// driver marking a load delivered must not see an error because a push token
// has expired, and an approval must not roll back because one recipient has no
// login. Every send reports what happened and returns; the caller records it.
// ─────────────────────────────────────────────────────────────────────────────

const idsOf = (values) => {
  const seen = new Set();
  const out = [];

  for (const value of values) {
    if (!value) continue;
    const id = String(value);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(new mongoose.Types.ObjectId(id));
  }

  return out;
};

/**
 * Every carrier-side login that should hear about this load's documents.
 *
 * Both the carriers and their drivers: the driver is the one holding the phone
 * with the photo on it, and the carrier's office is the one who chases them
 * when they do not answer. Sending to only one of them puts the message where
 * whichever of the two is not reading it that week.
 *
 * Legs included — a split load has more than one carrier, and each of them owes
 * their own documents.
 */
const carrierSideRecipients = async (load) => {
  const fleetOwnerIds = [
    load.assignedFleetOwner?.fleetOwnerId,
    ...(load.assignments || []).map((leg) => leg.fleetOwnerId),
  ].filter(Boolean);

  const driverIds = (load.driverAssignments || [])
    .map((assignment) => assignment.driver)
    .filter(Boolean);

  const [carriers, drivers] = await Promise.all([
    fleetOwnerIds.length
      ? FleetOwner.find({ _id: { $in: fleetOwnerIds } }).select("userId").lean()
      : [],
    driverIds.length
      ? Driver.find({ _id: { $in: driverIds } }).select("userId").lean()
      : [],
  ]);

  return {
    carrierUserIds: idsOf(carriers.map((c) => c.userId)),
    driverUserIds: idsOf(drivers.map((d) => d.userId)),
  };
};

/** A one-line "what is still missing", for the body of a chaser. */
const outstandingSummary = (load) => {
  const missing = missingRequiredDocuments(load);
  if (missing.length) return `Still missing: ${missing.join(", ")}.`;
  return hasDriverSubmittedPaperwork(load)
    ? "The documents on file need another look."
    : "No documents have been uploaded yet.";
};

/**
 * Send one message to everybody on the carrier side of a load.
 *
 * In-app for the record, push because a driver is not at a desk. Returns what
 * actually went out so the caller can store it against the load.
 */
const notifyCarrierSide = async ({ load, type, title, message }) => {
  const { carrierUserIds, driverUserIds } = await carrierSideRecipients(load);
  const recipients = [...carrierUserIds, ...driverUserIds];

  if (!recipients.length) {
    return {
      sent: false,
      recipients: 0,
      reason: "nobody on the carrier side has a login",
    };
  }

  const base = { type, title, message, load: load._id, loadId: load.loadId };

  // `create` with an array, not `insertMany`: the tenant-scope plugin stamps
  // locationId from a pre("validate") hook, which insertMany does not run. See
  // the note above notifyOffice.
  try {
    await Notification.create([
      ...carrierUserIds.map((recipient) => ({
        ...base,
        recipient,
        recipientRole: "fleetOwner",
      })),
      ...driverUserIds.map((recipient) => ({
        ...base,
        recipient,
        recipientRole: "driver",
      })),
    ]);
  } catch (error) {
    return { sent: false, recipients: recipients.length, reason: error.message };
  }

  // Best-effort on top of the in-app record, which has already been written —
  // a dead push token does not mean the message failed to arrive.
  await sendPush({
    userIds: recipients,
    title,
    body: message,
    data: { type, loadId: load.loadId },
  }).catch(() => null);

  return { sent: true, recipients: recipients.length };
};

/**
 * Tell the office something happened to a load's documents.
 *
 * `Notification.create(array)` rather than `insertMany`, throughout this file.
 * The tenant-scope plugin stamps locationId from a pre("validate") hook, and
 * insertMany does not run validate hooks — under the current Mongoose its
 * pre("insertMany") hook does not fire correctly either. A notification written
 * without a locationId is invisible to every scoped read: it would be stored
 * successfully and then never appear in anybody's bell.
 */
const notifyOffice = async ({ load, type, title, message }) => {
  const recipients = await getStaffAndAdminIds();
  if (!recipients.length) {
    return { sent: false, recipients: 0, reason: "no staff or admin accounts" };
  }

  try {
    await Notification.create(
      recipients.map((recipient) => ({
        recipient,
        recipientRole: "staff",
        type,
        title,
        message,
        load: load._id,
        loadId: load.loadId,
      })),
    );
  } catch (error) {
    return { sent: false, recipients: recipients.length, reason: error.message };
  }

  return { sent: true, recipients: recipients.length };
};

// ─── Office → carrier ─────────────────────────────────────────────────────────

/** "We are still waiting on your documents." Sent by hand from the load screen. */
const sendDocumentReminder = async ({ load, note }) =>
  notifyCarrierSide({
    load,
    type: "PAPERWORK_REMINDER",
    title: `Documents needed for ${load.loadId}`,
    message:
      `${load.loadId} was delivered and its paperwork is outstanding. ` +
      `${outstandingSummary(load)}` +
      (note ? ` Note from the office: "${note}"` : ""),
  });

/** "This is not right — here is what to fix." */
const notifyChangesRequested = async ({ load, note }) =>
  notifyCarrierSide({
    load,
    type: "PAPERWORK_CHANGES_REQUESTED",
    title: `Document changes needed on ${load.loadId}`,
    message:
      `The office reviewed the paperwork for ${load.loadId} and needs it corrected: ` +
      `"${note}". Upload the corrected document from the load screen.`,
  });

/** "Signed off." Also the notice that the documents have stopped being editable. */
const notifyPaperworkApproved = async ({ load }) =>
  notifyCarrierSide({
    load,
    type: "PAPERWORK_APPROVED",
    title: `Paperwork approved for ${load.loadId}`,
    message:
      `The paperwork for ${load.loadId} has been approved and the load is now ready to invoice. ` +
      `Its documents are locked and can no longer be changed.`,
  });

// ─── Carrier → office ─────────────────────────────────────────────────────────

/** A driver has uploaded something on a load that is waiting for review. */
const notifyPaperworkSubmitted = async ({ load, documentType }) =>
  notifyOffice({
    load,
    type: "PAPERWORK_SUBMITTED",
    title: `Paperwork to review on ${load.loadId}`,
    message:
      `${documentType} was uploaded to ${load.loadId}. ` +
      `${outstandingSummary(load)} Review it to approve the load for invoicing.`,
  });

// ─── The nudge that starts the whole thing ────────────────────────────────────

/**
 * How long a load may sit at DELIVERED before the office is reminded about it.
 *
 * Twelve hours rather than one: a driver marks a load delivered at the door and
 * the documents follow when they stop for the night. Reminding the office an
 * hour later would be reminding them about something that is not late yet, and
 * a reminder that is usually premature is a reminder people learn to dismiss.
 */
const REMIND_AFTER_HOURS = 12;

/** Don't chase the same load more than once a day. */
const REPEAT_EVERY_HOURS = 24;

const hoursSince = (date) =>
  date ? (Date.now() - new Date(date).getTime()) / 36e5 : Infinity;

const lastMoveReminderAt = (load) => {
  const times = (load.paperwork?.reminders || [])
    .filter((reminder) => reminder.kind === "MOVE_TO_PAPERWORK")
    .map((reminder) => new Date(reminder.sentAt).getTime())
    .filter((time) => Number.isFinite(time));

  return times.length ? Math.max(...times) : null;
};

/**
 * Remind the office about every delivered load nobody has moved on.
 *
 * Runs unscoped: a load does not stop being un-invoiced because the branch that
 * booked it is not the one whose session triggered the sweep. Same reasoning as
 * the bidding sweep in utils/cron.js.
 *
 * `dryRun` reports what it would send without sending it.
 */
const remindDeliveredLoads = async ({ dryRun = false } = {}) =>
  runUnscoped(async () => {
    const cutoff = new Date(Date.now() - REMIND_AFTER_HOURS * 36e5);

    const stale = await Load.find({
      transportStatus: "DELIVERED",
      deliveredAt: { $lte: cutoff },
    });

    const results = {
      considered: stale.length,
      sent: 0,
      failed: 0,
      skipped: 0,
      rows: [],
    };

    for (const load of stale) {
      if (hoursSince(lastMoveReminderAt(load)) < REPEAT_EVERY_HOURS) {
        results.skipped += 1;
        continue;
      }

      if (dryRun) {
        results.sent += 1;
        results.rows.push({ loadId: load.loadId, wouldSend: true });
        continue;
      }

      const delivered = load.deliveredAt
        ? formatDateNumeric(load.deliveredAt)
        : "recently";

      // Written inside the load's OWN location, not in the unscoped context the
      // sweep is running in. A notification created while unscoped is stamped
      // with no locationId (see plugins/tenantScope.js, which skips stamping
      // rather than guessing), and a notification with no location is invisible
      // to every scoped read — so it would be written successfully and then
      // never appear in anybody's bell. Silent, and exactly the failure this
      // reminder exists to prevent.
      const status = await withTenant({ locationId: load.locationId }, () =>
        notifyOffice({
          load,
          type: "PAPERWORK_DUE",
          title: `Move ${load.loadId} to Paperwork Pending`,
          message:
            `${load.loadId} was delivered on ${delivered} and is still sitting at Delivered. ` +
            `Move it to Paperwork Pending so its documents can be collected and checked.`,
        }),
      );

      // Recorded whether or not it landed, for the same reason the invoice
      // chasers are — see `reminders` on the Load model.
      load.paperwork = load.paperwork || {};
      load.paperwork.reminders = load.paperwork.reminders || [];
      load.paperwork.reminders.push({
        sentAt: new Date(),
        kind: "MOVE_TO_PAPERWORK",
        recipients: status.recipients,
        sent: status.sent,
        reason: status.sent ? "" : status.reason || "",
      });
      await load.save();

      if (status.sent) results.sent += 1;
      else results.failed += 1;

      results.rows.push({
        loadId: load.loadId,
        sent: status.sent,
        recipients: status.recipients,
        reason: status.sent ? null : status.reason,
      });
    }

    return results;
  });

module.exports = {
  REMIND_AFTER_HOURS,
  REPEAT_EVERY_HOURS,
  carrierSideRecipients,
  outstandingSummary,
  sendDocumentReminder,
  notifyChangesRequested,
  notifyPaperworkApproved,
  notifyPaperworkSubmitted,
  remindDeliveredLoads,
};
