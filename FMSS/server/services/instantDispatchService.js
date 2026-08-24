const mongoose = require("mongoose");
const Load = require("../models/Load");
const Address = require("../models/common/Address");
const Notification = require("../models/Notification");
const { runUnscoped } = require("../utils/tenantContext");
const { settingsFor } = require("./dispatchSettingsService");
const { splitAmount } = require("./commissionService");
const { findNearbyCarriers } = require("./nearbyDriversService");
const { sendPush } = require("./pushService");
const { sendInstantDispatchOffer } = require("./emailService");

// ─── Instant dispatch ─────────────────────────────────────────────────────────
// The "find me a truck now" route. Instead of verifying the load, scheduling a
// bid window and waiting for carriers to come to it, the load is offered
// straight to the carriers whose drivers are already near the pickup. First to
// accept has it.
//
// Everything after acceptance is the ordinary flow: the carrier is the assigned
// fleet owner, their driver runs it, the transport statuses, documents, POD and
// invoicing all behave exactly as they do on a load that came out of bidding.
// That is the point — this changes how a load finds a carrier, not what happens
// once it has one.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Where to search from.
 *
 * The pickup's pinned coordinates, off the Address record the stop points at.
 * A load whose pickup was typed rather than pinned has no coordinates, and
 * there is nothing honest to do with that — guessing from the city centre would
 * offer the load to trucks that may be an hour from the actual dock. The caller
 * turns this into a message telling them to pin it.
 */
const originFor = async (load) => {
  const addressId = load.pickup?.addressId || load.pickups?.[0]?.addressId;
  if (!addressId || !mongoose.isValidObjectId(addressId)) return null;

  const address = await Address.findById(addressId).select("lat lng").lean();

  if (!Number.isFinite(address?.lat) || !Number.isFinite(address?.lng)) return null;

  return { latitude: address.lat, longitude: address.lng };
};

/**
 * Tell one carrier about a load that is up for grabs.
 *
 * Three channels, and all three are best effort: a carrier who cannot be
 * emailed still gets the in-app notification, and a bounced email must not stop
 * the next carrier being told. What each channel did is recorded on the offer
 * so "nobody answered" and "nobody was reachable" stay different answers.
 */
const notifyCarrier = async ({ load, carrier, driver, distanceMiles, payout, expiresAt }) => {
  const title = "Load available near your driver";
  const message =
    `${load.loadId}: ${load.pickup?.city || "pickup"} → ${load.drop?.city || "delivery"}. ` +
    `$${payout.toLocaleString("en-US")} to you. ` +
    `${driver?.name ? `${driver.name} is ` : "Your nearest truck is "}${distanceMiles} mi away. ` +
    `Accept before ${expiresAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.`;

  const channels = [];

  // ── In-app ────────────────────────────────────────────────────────────────
  try {
    if (carrier.userId) {
      await Notification.create({
        recipient: carrier.userId,
        recipientRole: "fleetOwner",
        type: "INSTANT_DISPATCH_OFFERED",
        title,
        message,
        load: load._id,
        loadId: load.loadId,
      });
      channels.push({ channel: "in-app", sent: true });
    } else {
      channels.push({
        channel: "in-app",
        sent: false,
        reason: "carrier has no login",
      });
    }
  } catch (error) {
    channels.push({ channel: "in-app", sent: false, reason: error.message });
  }

  // ── Email ─────────────────────────────────────────────────────────────────
  const email =
    carrier.contactPersons?.find((c) => c.isPrimary)?.email ||
    carrier.contactPersons?.[0]?.email ||
    carrier.email;

  if (email) {
    try {
      const result = await sendInstantDispatchOffer({
        to: email,
        load,
        carrierName: carrier.carrierName,
        driverName: driver?.name,
        distanceMiles,
        payout,
        expiresAt,
      });
      channels.push({
        channel: "email",
        sent: !!result?.sent,
        reason: result?.reason || undefined,
      });
    } catch (error) {
      channels.push({ channel: "email", sent: false, reason: error.message });
    }
  } else {
    channels.push({ channel: "email", sent: false, reason: "no email on file" });
  }

  // ── Push ──────────────────────────────────────────────────────────────────
  // The channel that actually matters for a dispatcher who is not at a desk.
  // Reports "no device registered" until the phone app starts sending tokens —
  // see services/pushService.js.
  const push = await sendPush({
    userIds: [carrier.userId].filter(Boolean),
    title,
    body: message,
    data: { type: "INSTANT_DISPATCH_OFFERED", loadId: load.loadId },
  });
  channels.push({ channel: "push", sent: push.sent, reason: push.reason });

  return channels;
};

/**
 * Put a load out to the carriers near its pickup.
 *
 * Returns `{ ok: false, reason }` for the things that are a normal state of the
 * world rather than a fault — no coordinates, nobody in range, the branch has
 * the feature switched off. The caller turns those into something a customer
 * can act on, and the load stays untouched.
 */
const requestInstantDispatch = async (load, { requestedBy, branchId } = {}) => {
  const settings = await settingsFor(branchId || load.locationId);

  if (!settings.instantDispatchEnabled) {
    return { ok: false, reason: "Instant dispatch is switched off for this location." };
  }

  const origin = await originFor(load);
  if (!origin) {
    return {
      ok: false,
      reason:
        "The pickup address has no map pin, so we cannot tell which drivers are near it. Pinpoint the pickup on the map, or post this load for bidding instead.",
    };
  }

  // The split is stamped before anybody is told anything, so every carrier is
  // offered the same figure and that figure survives a later rate change.
  const split = splitAmount(load.amount, settings.commissionPercent);

  const nearby = await findNearbyCarriers({
    latitude: origin.latitude,
    longitude: origin.longitude,
    radiusMiles: settings.searchRadiusMiles,
    maxAgeHours: settings.positionMaxAgeHours,
  });

  if (!nearby.length) {
    return {
      ok: false,
      reason: `No carrier has a driver within ${settings.searchRadiusMiles} miles of the pickup who has reported a position in the last ${settings.positionMaxAgeHours} hours.`,
      searched: { radiusMiles: settings.searchRadiusMiles },
    };
  }

  const expiresAt = new Date(Date.now() + settings.offerWindowMinutes * 60 * 1000);

  load.dispatchMode = "INSTANT";
  load.commission = { ...split, stampedAt: new Date() };
  load.instantDispatch = {
    requestedAt: new Date(),
    requestedBy,
    radiusMiles: settings.searchRadiusMiles,
    positionMaxAgeHours: settings.positionMaxAgeHours,
    origin,
    expiresAt,
    status: "PENDING",
    offers: nearby.map((row) => ({
      fleetOwnerId: row.fleetOwner._id,
      fleetOwnerName: row.fleetOwner.carrierName,
      driverId: row.driver._id,
      driverName: row.driver.name,
      distanceMiles: row.distanceMiles,
      positionRecordedAt: row.recordedAt,
      response: "PENDING",
    })),
  };

  // A load out to carriers is not waiting on the office to verify it — that is
  // the whole difference between the two routes.
  load.status = "VERIFIED";
  load.bidStatus = "CLOSED";

  await load.save();

  // Told after the load is saved, never before: a carrier who accepts an offer
  // the database does not know about is the one failure here that cannot be
  // apologised away.
  for (const row of nearby) {
    const channels = await notifyCarrier({
      load,
      carrier: row.fleetOwner,
      driver: row.driver,
      distanceMiles: row.distanceMiles,
      payout: split.carrierAmount,
      expiresAt,
    });

    const offer = load.instantDispatch.offers.find(
      (o) => String(o.fleetOwnerId) === String(row.fleetOwner._id),
    );
    if (offer) offer.channels = channels;
  }

  await load.save();

  return {
    ok: true,
    offered: nearby.length,
    expiresAt,
    commission: split,
    radiusMiles: settings.searchRadiusMiles,
  };
};

/**
 * Hand a load nobody took back to the ordinary bid flow.
 *
 * Not a failure state — it is the answer to "we tried the fast route and no
 * truck was free", and the load still needs moving. It re-enters at
 * PENDING_VERIFICATION so the office picks it up exactly as if it had been
 * posted for bidding in the first place, and the commission stamp is cleared
 * because the bid flow prices loads its own way.
 */
const fallBackToBidding = async (load) => {
  load.instantDispatch.status = "EXPIRED";
  load.instantDispatch.fellBackAt = new Date();
  load.dispatchMode = "BID";
  load.commission = undefined;
  load.status = "PENDING_VERIFICATION";
  load.bidStatus = "UPCOMING";

  await load.save();
  return load;
};

/**
 * Expire every offer whose window has closed.
 *
 * Runs unscoped and across branches because it is a sweep, not a request — see
 * the cron wiring in index.js. Each load is handled on its own so one bad
 * document cannot stop the rest being released.
 */
const expireStaleOffers = async () => {
  const stale = await runUnscoped(() =>
    Load.find({
      dispatchMode: "INSTANT",
      "instantDispatch.status": "PENDING",
      "instantDispatch.expiresAt": { $lt: new Date() },
    }).limit(200),
  );

  const results = [];

  for (const load of stale) {
    try {
      await runUnscoped(() => fallBackToBidding(load));
      results.push({ loadId: load.loadId, ok: true });
    } catch (error) {
      results.push({ loadId: load.loadId, ok: false, reason: error.message });
    }
  }

  return results;
};

module.exports = {
  requestInstantDispatch,
  fallBackToBidding,
  expireStaleOffers,
  originFor,
};
