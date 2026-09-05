const Invoice = require("../models/Invoice");
const mail = require("./accountingMailService");
const { runUnscoped } = require("../utils/tenantContext");
// The ladder is measured in whole days from the due date, and "already chased
// today" means today on the US business clock — see utils/dates.js.
const { daysBetween, toDateKey, todayKey } = require("../utils/dates");

// ─── Automatic payment reminders ──────────────────────────────────────────────
// A nightly sweep over every unpaid customer invoice, sending the chaser that is
// due today and no other.
//
// ── The schedule, and why it is fixed ────────────────────────────────────────
// Reminders go out on a ladder measured from the DUE date, not the issue date:
//
//   −3 days   a courtesy note that it is about to fall due
//    +1 day   it is now late
//    +7 days  a week late
//   +15 days  escalated wording
//   +30 days  final reminder
//   then every 30 days
//
// The ladder is deliberately not configurable per customer. A settings screen
// for it would be a screen nobody ever opens holding rules nobody remembers,
// and the wording already escalates on its own — see REMINDER_TONE in
// accountingEmailTemplates.js.
//
// ── Sending at most one reminder per invoice per day ─────────────────────────
// The sweep is idempotent by checking what it already sent. If it runs twice —
// a restart, an overlapping schedule, a manual trigger — an invoice that was
// chased this morning is skipped this afternoon. Getting this wrong does not
// produce a bug report; it produces a customer receiving four identical demands
// in one day, which costs the relationship the reminders were meant to protect.
//
// ── Customer invoices only ───────────────────────────────────────────────────
// AP bills are what WE owe. Emailing a carrier a reminder that we have not paid
// them is not a thing anybody wants automated. Those surface on the payables
// screen for a human to act on instead.
// ─────────────────────────────────────────────────────────────────────────────

// Days relative to the due date. Negative is before it.
const LADDER = [-3, 1, 7, 15, 30];

// After the last rung, chase monthly rather than stopping — an unpaid invoice
// does not become less unpaid by being ignored.
const REPEAT_EVERY = 30;

/**
 * True if today is a rung on the ladder for this invoice.
 *
 * `daysFromDue` is negative before the due date and positive after it.
 */
const isDueForReminder = (daysFromDue) => {
  if (LADDER.includes(daysFromDue)) return true;

  // Past the last rung: every 30 days from it.
  const last = LADDER[LADDER.length - 1];
  return daysFromDue > last && (daysFromDue - last) % REPEAT_EVERY === 0;
};

/**
 * Whole days between the due date and today, ignoring the time of day.
 *
 * Counted between calendar days rather than by dividing a millisecond
 * difference, which lands a day out whenever the clocks change in between — and
 * a ladder that misses its rung by one day simply never fires.
 */
const daysFromDueOf = (invoice) => {
  if (!invoice.dueDate) return null;
  return daysBetween(invoice.dueDate, todayKey());
};

/**
 * Whether this invoice has already been chased today, however it was chased.
 *
 * "Today" is the business day, not the server's. A host in another timezone
 * would otherwise roll over at its own midnight and send a second round of
 * chasers to customers who were already chased that morning.
 */
const chasedToday = (invoice) => {
  const today = todayKey();

  return (invoice.reminders || []).some(
    (reminder) => toDateKey(reminder.sentAt) === today,
  );
};

/**
 * Send every reminder that falls due today.
 *
 * Runs unscoped: this is a sweep outside any request, and it must genuinely act
 * on every branch — an invoice does not stop being overdue because the office
 * that raised it is not the one whose session triggered the sweep. Same
 * reasoning as the bidding sweep in utils/cron.js.
 *
 * `dryRun` reports what it would send without sending it, which is how you check
 * the ladder against real data without mailing a hundred customers to find out.
 */
const sendDueReminders = async ({ dryRun = false } = {}) =>
  runUnscoped(async () => {
    const open = await Invoice.find({
      direction: "AR",
      status: { $in: ["SENT", "PARTIAL"] },
      balance: { $gt: 0 },
      dueDate: { $exists: true },
    });

    const results = { considered: open.length, sent: 0, failed: 0, skipped: 0, rows: [] };

    for (const invoice of open) {
      const daysFromDue = daysFromDueOf(invoice);

      if (daysFromDue === null || !isDueForReminder(daysFromDue)) {
        results.skipped += 1;
        continue;
      }

      if (chasedToday(invoice)) {
        results.skipped += 1;
        continue;
      }

      const daysOverdue = Math.max(daysFromDue, 0);

      if (dryRun) {
        results.rows.push({
          invoiceNumber: invoice.invoiceNumber,
          to: invoice.party?.email || "",
          daysOverdue,
          wouldSend: true,
        });
        results.sent += 1;
        continue;
      }

      let status;
      try {
        status = await mail.sendReminder({ invoice, daysOverdue });
      } catch (error) {
        status = { sent: false, message: error.message, to: invoice.party?.email || "" };
      }

      // Recorded either way. A run of failures against one address is the thing
      // that tells somebody the customer's email is wrong — if only successes
      // were logged, that account would just look quietly un-chased.
      invoice.reminders.push({
        sentAt: new Date(),
        to: status.to || invoice.party?.email || "",
        trigger: "AUTO",
        daysOverdue,
        sent: !!status.sent,
        note: status.sent ? "" : status.message || "",
      });

      await invoice.save();

      if (status.sent) results.sent += 1;
      else results.failed += 1;

      results.rows.push({
        invoiceNumber: invoice.invoiceNumber,
        to: status.to || invoice.party?.email || "",
        daysOverdue,
        sent: !!status.sent,
        reason: status.sent ? null : status.message || status.reason,
      });
    }

    return results;
  });

module.exports = {
  LADDER,
  REPEAT_EVERY,
  isDueForReminder,
  daysFromDueOf,
  chasedToday,
  sendDueReminders,
};
