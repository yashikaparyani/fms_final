const cron = require("node-cron");
const Load = require("../models/Load");
const { sendBidWon, sendBiddingNowOpen } = require("../services/emailService");
const { notifyBiddingClosed, notifyBiddingScheduled } = require("../services/NotificationService");
const FleetOwner = require("../models/FleetOwner");
const { runUnscoped } = require("./tenantContext");
const { drainQueue } = require("../services/whatsappService");
const { expireStaleOffers } = require("../services/instantDispatchService");

const startCronJobs = () => {
  // Run every minute.
  //
  // The sweep runs outside any request, so there is no active location — and it
  // must genuinely act on every branch: bidding windows close on their own
  // schedule wherever the load lives. runUnscoped is therefore correct here, not
  // a workaround. Everything inside stays unscoped, including the saves.
  cron.schedule("* * * * *", () => runUnscoped(async () => {
    try {
      const now = new Date();

      // 1. Auto-open UPCOMING bids when start time arrives
      const upcomingLoads = await Load.find({
        bidStatus: "UPCOMING",
        bidStartTime: { $lte: now },
      });

      if (upcomingLoads.length > 0) {
        console.log(`Opening bidding for ${upcomingLoads.length} loads.`);

        for (const load of upcomingLoads) {
          load.bidStatus = "OPEN";
          await load.save();
          console.log(`Opened bidding for ${load.loadId}`);
          notifyBiddingScheduled({ load, type: "BIDDING_OPENED" }).catch(console.error);

          // Notify fleet owners
          const fleetOwners = await FleetOwner.find({ status: 'ACTIVE' });
          for (const owner of fleetOwners) {
            const email = owner.contactPersons?.find(c => c.isPrimary)?.email || owner.contactPersons?.[0]?.email;
            if (email) {
              await sendBiddingNowOpen({ load, email });
            }
          }
        }
      }

      // 2. Find all loads that are OPEN and their bidEndTime has passed
      const expiredLoads = await Load.find({
        bidStatus: "OPEN",
        bidEndTime: { $lte: now },
      });

      if (expiredLoads.length > 0) {
        console.log(`Found ${expiredLoads.length} loads with expired bidding.`);

        for (const load of expiredLoads) {
          load.bidStatus = "CLOSED"; // Close bidding whether bids exist or not

          await load.save();
          console.log(`Closed bidding for ${load.loadId}.`);
        }
      }

      // 3. Safety-net: email the acceptance mail to any AWARDED winner that
      //    hasn't been mailed yet. (Allotment stays MANUAL — this only mails
      //    loads where staff/admin already awarded a winner.)
      const awardedUnmailed = await Load.find({
        bidStatus: "CLOSED",
        "winningBid.fleetOwnerId": { $ne: null },
        acceptanceMailSent: { $ne: true },
      });

      for (const load of awardedUnmailed) {
        try {
          const fleetOwner = await FleetOwner.findById(load.winningBid.fleetOwnerId);
          if (!fleetOwner) continue;

          const email =
            fleetOwner.contactPersons?.find((c) => c.isPrimary)?.email ||
            fleetOwner.contactPersons?.[0]?.email;
          if (!email) continue;

          await sendBidWon({ load, fleetOwner, winningBid: load.winningBid, email });
          load.acceptanceMailSent = true;
          load.acceptanceMailSentAt = new Date();
          await load.save();
          console.log(`Sent bid acceptance mail to winner of ${load.loadId}.`);
        } catch (mailErr) {
          console.error(`Failed acceptance mail for ${load.loadId}:`, mailErr.message);
        }
      }
    } catch (error) {
      console.error("Error running cron jobs", error);
    }
  }));
  // ── Instant dispatch offers ───────────────────────────────────────────────
  // An offer nobody took has to actually stop being an offer. Left alone, the
  // load would sit forever in a state where no carrier can accept it and the
  // office is not looking at it either — the customer waiting on a truck that
  // was never coming. This releases it back to bidding.
  //
  // Its own schedule for the same reason as the outbox: a slow email must not
  // hold up bid closing. expireStaleOffers opens its own unscoped context.
  cron.schedule("* * * * *", async () => {
    try {
      const results = await expireStaleOffers();
      if (results.length) {
        const failed = results.filter((r) => !r.ok);
        console.log(
          `Instant dispatch: ${results.length - failed.length} offer(s) expired to bidding` +
            (failed.length ? `, ${failed.length} failed` : ""),
        );
      }
    } catch (error) {
      console.error("Instant dispatch expiry failed:", error.message);
    }
  });

  // ── WhatsApp outbox ───────────────────────────────────────────────────────
  // Its own schedule rather than folded into the sweep above: a slow Meta call
  // must not hold up bid closing, and the queue drains at its own rate limit.
  // drainQueue opens its own unscoped context — the outbox spans every branch.
  cron.schedule("* * * * *", async () => {
    try {
      const result = await drainQueue();
      if (result.sent || result.failed) {
        console.log(
          `WhatsApp queue: ${result.sent} sent, ${result.failed} failed.`,
        );
      }
    } catch (error) {
      console.error("WhatsApp queue drain failed:", error.message);
    }
  });

  console.log(
    "Cron jobs initialized (auto-open bids, auto-close & select winner, instant dispatch expiry, WhatsApp queue).",
  );
};

module.exports = startCronJobs;
