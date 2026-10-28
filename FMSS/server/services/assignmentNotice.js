const FleetOwner = require("../models/FleetOwner");
const Notification = require("../models/Notification");
const { sendPush } = require("./pushService");
const { runUnscoped } = require("../utils/tenantContext");

/**
 * Tell a carrier a load has just been given to them.
 *
 * Until this, a carrier learnt about an assignment by opening the app and
 * looking — and when the dashboard failed to load, they did not learn at all.
 * A push with the load number gets them to it whatever state their home
 * screen is in.
 *
 * Called from the Load model's save hook (models/Load.js) rather than from the
 * handlers, because a load reaches a carrier through five of them — award,
 * accept, offer acceptance, direct assignment and split legs — and a sixth
 * would be written without it.
 *
 * Best effort: the assignment has already been saved, and a carrier with no
 * login or no registered phone is not a reason to fail it.
 *
 * @param {object} load
 * @param {Array} fleetOwnerIds  Carriers newly on this load — not everyone on it.
 */
const notifyNewCarriers = async (load, fleetOwnerIds) => {
  if (!fleetOwnerIds.length) return;

  try {
    const carriers = await runUnscoped(() =>
      FleetOwner.find({ _id: { $in: fleetOwnerIds } }).select("userId").lean(),
    );
    const userIds = carriers.map((c) => c.userId).filter(Boolean);
    if (!userIds.length) return;

    const title = `New load assigned: ${load.loadId}`;
    const message =
      `${load.loadId} has been assigned to you. ` +
      `Open Assigned Bids in the app to confirm it.`;

    // locationId set here so the tenant plugin does not need a request context
    // to file it — the load already knows where it belongs.
    await Notification.create(
      userIds.map((recipient) => ({
        type: "LOAD_ASSIGNED",
        title,
        message,
        load: load._id,
        loadId: load.loadId,
        recipient,
        recipientRole: "fleetOwner",
        locationId: load.locationId,
      })),
    );

    await sendPush({
      userIds,
      title,
      body: message,
      data: { type: "LOAD_ASSIGNED", loadId: load.loadId },
    });
  } catch (error) {
    console.warn(`[assignment-notice] ${load.loadId}: ${error.message}`);
  }
};

module.exports = { notifyNewCarriers };
