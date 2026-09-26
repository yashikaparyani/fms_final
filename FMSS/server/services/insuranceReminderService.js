const CarrierOnboarding = require("../models/CarrierOnboarding");
const FleetOwner = require("../models/FleetOwner");
const Driver = require("../models/Driver");
const Notification = require("../models/Notification");
const { runUnscoped } = require("../utils/tenantContext");
const { today, daysBetween, formatDate } = require("../utils/dates");
const { getStaffAndAdminIds } = require("./NotificationService");

// ─── Insurance is about to lapse — chase everyone who can fix it ───────────────
// A carrier running on expired insurance is a liability nobody wants to discover
// after a claim. So the last 10 days before a policy's expiry are not left to
// chance: every day in that window the office, the carrier and the carrier's
// drivers get an in-app notification to revise it. It turns red (URGENT) inside
// the final 3 days, and stays red once expired — the one state that must not be
// quietly ignored.
//
// In-app only, by design — the request was for the notification bell, not email.
// Runs once a day from the cron (utils/cron.js); the per-day dedupe below is the
// safety net for a restart or a manual run.

// Only the last 10 days before expiry raise a reminder at all.
const REMIND_WITHIN_DAYS = 10;
// Inside the last 3 days (and once expired) it is shown in red.
const URGENT_WITHIN_DAYS = 3;

const startOfTodayUtc = () =>
  new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);

/** The soonest policy expiry on a file, or null if none carry a date. */
const soonestExpiry = (file) => {
  const dates = (file.insurance?.policies || [])
    .map((p) => p.expiryDate)
    .filter(Boolean)
    .map((d) => new Date(d));
  if (!dates.length) return null;
  return new Date(Math.min(...dates.map((d) => d.getTime())));
};

const expiryPhrase = (daysLeft, expiry) => {
  const on = formatDate(expiry);
  if (daysLeft < 0) return `expired ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? "" : "s"} ago (${on})`;
  if (daysLeft === 0) return `expires today (${on})`;
  return `expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"} (on ${on})`;
};

/**
 * Sweep every carrier's insurance and raise reminders for any in the window.
 * Returns a small summary for the cron log.
 */
const remindExpiringInsurance = async () =>
  runUnscoped(async () => {
    const files = await CarrierOnboarding.find({
      "insurance.policies.expiryDate": { $exists: true, $ne: null },
    }).lean();

    const officeIds = await getStaffAndAdminIds();
    const since = startOfTodayUtc();

    let carriersNotified = 0;
    let created = 0;

    for (const file of files) {
      const expiry = soonestExpiry(file);
      if (!expiry) continue;

      const daysLeft = daysBetween(today(), expiry);
      if (daysLeft > REMIND_WITHIN_DAYS) continue; // not close enough yet

      const fleetOwner = await FleetOwner.findById(file.fleetOwner)
        .select("carrierName userId locationId")
        .lean();
      if (!fleetOwner) continue;

      const severity = daysLeft <= URGENT_WITHIN_DAYS ? "URGENT" : "INFO";
      const carrierName = fleetOwner.carrierName || "This carrier";
      const phrase = expiryPhrase(daysLeft, expiry);

      // Who hears about it: the office, the carrier's own account, and every one
      // of their drivers who has an app login.
      const drivers = await Driver.find({
        fleetOwner: fleetOwner._id,
        userId: { $exists: true, $ne: null },
        active: { $ne: false },
      })
        .select("userId")
        .lean();

      const recipients = [
        ...officeIds.map((id) => ({ id, role: "staff" })),
        ...(fleetOwner.userId ? [{ id: fleetOwner.userId, role: "fleetOwner" }] : []),
        ...drivers.map((d) => ({ id: d.userId, role: "driver" })),
      ].filter((r) => r.id);

      if (!recipients.length) continue;

      // Already reminded today? Skip those recipients — one nudge per day.
      const already = await Notification.find({
        type: "INSURANCE_EXPIRING",
        fleetOwner: fleetOwner._id,
        createdAt: { $gte: since },
        recipient: { $in: recipients.map((r) => r.id) },
      })
        .select("recipient")
        .lean();
      const done = new Set(already.map((n) => String(n.recipient)));

      const docs = recipients
        .filter((r) => !done.has(String(r.id)))
        .map((r) => ({
          recipient: r.id,
          recipientRole: r.role,
          type: "INSURANCE_EXPIRING",
          severity,
          fleetOwner: fleetOwner._id,
          // Filed under the carrier's location so the right office sees it, the
          // same way a load notification is filed under the load's location.
          locationId: fleetOwner.locationId,
          title:
            severity === "URGENT"
              ? `Insurance expiring — ${carrierName}`
              : `Insurance expiry due — ${carrierName}`,
          message:
            r.role === "fleetOwner"
              ? `Your insurance ${phrase}. Please get it revised and have your agency refile it.`
              : r.role === "driver"
                ? `Your carrier ${carrierName}'s insurance ${phrase}. Ask them to get it revised.`
                : `${carrierName}'s insurance ${phrase}. Chase them to revise it.`,
        }));

      if (docs.length) {
        await Notification.insertMany(docs);
        created += docs.length;
        carriersNotified += 1;
      }
    }

    return { carriersNotified, created, considered: files.length };
  });

module.exports = { remindExpiringInsurance };
