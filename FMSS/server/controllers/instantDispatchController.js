const Load = require("../models/Load");
const Notification = require("../models/Notification");
const FleetOwner = require("../models/FleetOwner");
const { findCarrierFor } = require("../utils/carrierAccount");
const { runUnscoped } = require("../utils/tenantContext");
const {
  requestInstantDispatch,
  fallBackToBidding,
} = require("../services/instantDispatchService");
const { settingsFor, saveSettings } = require("../services/dispatchSettingsService");

// ─── Instant dispatch ─────────────────────────────────────────────────────────
// The carrier's side of the "find me a truck now" route, plus the office's
// dials behind it.
//
// The load itself is offered when it is created — see createLoad, which calls
// requestInstantDispatch when the customer picks that route. What lives here is
// what happens next: carriers seeing what they have been offered, taking it,
// turning it down, and the office setting the rate.
// ─────────────────────────────────────────────────────────────────────────────

/** What a carrier is shown about a load they have been offered. */
const offerView = (load, offer) => ({
  loadId: load.loadId,
  _id: load._id,
  // The payout, never the customer's figure. What the customer pays is not the
  // carrier's business, and putting it in front of them invites an argument
  // about the split on every load.
  payout: load.commission?.carrierAmount ?? null,
  pickup: {
    company: load.pickup?.company || "",
    city: load.pickup?.city || "",
    state: load.pickup?.state || "",
    pickupDate: load.pickup?.pickupDate || null,
  },
  drop: {
    company: load.drop?.company || "",
    city: load.drop?.city || "",
    state: load.drop?.state || "",
    deliveryDate: load.drop?.deliveryDate || null,
  },
  truckType: load.truckType || "",
  material: load.material || "",
  containerType: load.containerType || "",
  weight: load.weight || "",
  isUrgent: !!load.isUrgent,

  distanceMiles: offer?.distanceMiles ?? null,
  nearestDriver: offer?.driverName || "",
  offeredAt: offer?.notifiedAt || load.instantDispatch?.requestedAt || null,
  expiresAt: load.instantDispatch?.expiresAt || null,
  response: offer?.response || "PENDING",
});

// @desc    Loads this carrier has been offered on instant dispatch
// @route   GET /api/instant-dispatch/offers
// @access  Private (fleetOwner, driver)
//
// Only live offers: one that expired or that another carrier took is not
// something to show as available. A carrier who taps a dead offer and is told
// "too late" learns to distrust the screen.
const getMyOffers = async (req, res) => {
  try {
    const carrier = await findCarrierFor(req.user);

    if (!carrier) {
      return res.status(404).json({
        message: "No carrier profile is linked to your account.",
      });
    }

    const loads = await Load.find({
      dispatchMode: "INSTANT",
      "instantDispatch.status": "PENDING",
      "instantDispatch.expiresAt": { $gt: new Date() },
      "instantDispatch.offers": {
        $elemMatch: { fleetOwnerId: carrier._id, response: { $ne: "DECLINED" } },
      },
    })
      .sort({ "instantDispatch.expiresAt": 1 })
      .lean();

    res.json(
      loads.map((load) => {
        const offer = (load.instantDispatch?.offers || []).find(
          (o) => String(o.fleetOwnerId) === String(carrier._id),
        );
        return offerView(load, offer);
      }),
    );
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Take a load that was offered
// @route   POST /api/instant-dispatch/:loadId/accept
// @access  Private (fleetOwner, driver)
//
// First carrier to accept has it. Two dispatchers tapping Accept in the same
// second is not a rare case on a good load, so the win is decided by a single
// conditional update rather than by read-then-write: the filter requires the
// offer to still be PENDING and unexpired, and MongoDB applies that atomically.
// The second caller matches nothing and is told the load has gone.
const acceptOffer = async (req, res) => {
  try {
    const carrier = await findCarrierFor(req.user);

    if (!carrier) {
      return res.status(404).json({
        message: "No carrier profile is linked to your account.",
      });
    }

    const now = new Date();

    const claimed = await Load.findOneAndUpdate(
      {
        loadId: req.params.loadId,
        dispatchMode: "INSTANT",
        // The guard. Anything that has already been accepted, expired or
        // cancelled fails the filter and nothing is written.
        "instantDispatch.status": "PENDING",
        "instantDispatch.expiresAt": { $gt: now },
        "instantDispatch.offers": {
          $elemMatch: { fleetOwnerId: carrier._id, response: { $ne: "DECLINED" } },
        },
      },
      {
        $set: {
          "instantDispatch.status": "ACCEPTED",
          "instantDispatch.acceptedBy": {
            fleetOwnerId: carrier._id,
            fleetOwnerName: carrier.carrierName,
            acceptedAt: now,
            acceptedByUser: req.user._id,
          },
          // From here the load is an ordinary assigned load. Nothing downstream
          // — transport statuses, documents, POD, invoicing — needs to know it
          // arrived by instant dispatch rather than by winning a bid.
          assignedFleetOwner: {
            fleetOwnerId: carrier._id,
            fleetOwnerName: carrier.carrierName,
            assignedAt: now,
          },
          status: "ASSIGNED",
          transportStatus: "ASSIGNED",
        },
        $push: {
          transportStatusHistory: {
            status: "ASSIGNED",
            changedAt: now,
            changedBy: req.user._id,
            note: `Accepted on instant dispatch by ${carrier.carrierName}`,
          },
        },
      },
      { new: true },
    );

    if (!claimed) {
      // Distinguish the three ways this legitimately fails, because "no" and
      // "too late" and "not for you" call for different things being done.
      const load = await Load.findOne({ loadId: req.params.loadId }).lean();

      if (!load || load.dispatchMode !== "INSTANT") {
        return res.status(404).json({ message: "That load is not on instant dispatch." });
      }

      const wasOffered = (load.instantDispatch?.offers || []).some(
        (o) => String(o.fleetOwnerId) === String(carrier._id),
      );

      if (!wasOffered) {
        return res.status(403).json({ message: "This load was not offered to you." });
      }

      if (load.instantDispatch?.status === "ACCEPTED") {
        return res.status(409).json({
          message: "Another carrier took this load first.",
          code: "ALREADY_TAKEN",
        });
      }

      return res.status(410).json({
        message: "This offer has closed. The load has gone back out for bidding.",
        code: "OFFER_EXPIRED",
      });
    }

    // Mark this carrier's own offer row as the accepted one. Done as a second
    // write rather than in the claim: positional updates on the matched array
    // element cannot be combined with the $elemMatch filter above without
    // making the guard harder to read than the thing it guards.
    await Load.updateOne(
      { _id: claimed._id, "instantDispatch.offers.fleetOwnerId": carrier._id },
      {
        $set: {
          "instantDispatch.offers.$.response": "ACCEPTED",
          "instantDispatch.offers.$.respondedAt": now,
        },
      },
    );

    // Tell the carriers who lost. Silence would leave a live-looking offer on
    // their screen for a load that is gone.
    await notifyLosers(claimed, carrier._id);

    // And tell the office, who otherwise learn about the assignment by noticing
    // it.
    await notifyOffice(claimed, carrier);

    res.json({
      message: `You have load ${claimed.loadId}. Assign a driver and confirm when you are ready to roll.`,
      loadId: claimed.loadId,
      payout: claimed.commission?.carrierAmount ?? null,
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

/** Everyone else who was offered it, so a dead offer stops looking live. */
const notifyLosers = async (load, winnerId) => {
  const losers = (load.instantDispatch?.offers || []).filter(
    (o) => String(o.fleetOwnerId) !== String(winnerId),
  );

  if (!losers.length) return;

  const carriers = await FleetOwner.find({
    _id: { $in: losers.map((o) => o.fleetOwnerId) },
  })
    .select("userId")
    .lean();

  const recipients = carriers.map((c) => c.userId).filter(Boolean);
  if (!recipients.length) return;

  await Notification.insertMany(
    recipients.map((recipient) => ({
      recipient,
      recipientRole: "fleetOwner",
      type: "INSTANT_DISPATCH_TAKEN",
      title: "Load already taken",
      message: `Load ${load.loadId} was accepted by another carrier.`,
      load: load._id,
      loadId: load.loadId,
    })),
  ).catch(() => {
    // Housekeeping. A carrier who does not get this sees the offer drop off
    // their list on the next refresh anyway.
  });
};

/** The office did not assign this load, so they are told who has it. */
const notifyOffice = async (load, carrier) => {
  try {
    const User = require("../models/User");
    const staff = await runUnscoped(() =>
      User.find({ role: { $in: ["admin", "staff"] }, isActive: true })
        .select("_id")
        .lean(),
    );

    if (!staff.length) return;

    await Notification.insertMany(
      staff.map((user) => ({
        recipient: user._id,
        recipientRole: user.role,
        type: "INSTANT_DISPATCH_ACCEPTED",
        title: "Instant dispatch accepted",
        message:
          `${carrier.carrierName} took load ${load.loadId} on instant dispatch. ` +
          `Customer $${(load.commission?.customerAmount ?? 0).toLocaleString("en-US")}, ` +
          `carrier $${(load.commission?.carrierAmount ?? 0).toLocaleString("en-US")}, ` +
          `commission $${(load.commission?.commissionAmount ?? 0).toLocaleString("en-US")}.`,
        load: load._id,
        loadId: load.loadId,
      })),
    );
  } catch {
    /* best effort — never undo an acceptance over a notification */
  }
};

// @desc    Turn down an offer
// @route   POST /api/instant-dispatch/:loadId/decline
// @access  Private (fleetOwner, driver)
//
// Not required — an offer nobody answers expires by itself. It exists so a
// carrier can clear something they know they cannot take off their own screen,
// and so "six carriers said no" is distinguishable from "six carriers never
// looked", which is the difference between a pricing problem and a reach one.
const declineOffer = async (req, res) => {
  try {
    const carrier = await findCarrierFor(req.user);

    if (!carrier) {
      return res.status(404).json({
        message: "No carrier profile is linked to your account.",
      });
    }

    const updated = await Load.findOneAndUpdate(
      {
        loadId: req.params.loadId,
        dispatchMode: "INSTANT",
        "instantDispatch.status": "PENDING",
        "instantDispatch.offers.fleetOwnerId": carrier._id,
      },
      {
        $set: {
          "instantDispatch.offers.$.response": "DECLINED",
          "instantDispatch.offers.$.respondedAt": new Date(),
          "instantDispatch.offers.$.declineReason": String(req.body.reason || "").trim(),
        },
      },
      { new: true },
    );

    if (!updated) {
      return res.status(404).json({ message: "That offer is no longer open." });
    }

    // Everyone offered it has now said no, so there is nothing to wait for —
    // release it to bidding rather than let the window run down with the
    // customer waiting on an answer that is already known.
    const allDeclined = (updated.instantDispatch.offers || []).every(
      (o) => o.response === "DECLINED",
    );

    if (allDeclined) {
      await fallBackToBidding(updated);
    }

    res.json({ message: "Offer declined." });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Offer a load that already exists to nearby carriers
// @route   POST /api/instant-dispatch/:loadId/request
// @access  Private (client, staff, admin)
//
// The retry path. A load created for bidding, or one whose offer window ran out,
// can be pushed to nearby carriers without being re-created.
const requestForLoad = async (req, res) => {
  try {
    const load = await Load.findOne({ loadId: req.params.loadId });

    if (!load) {
      return res.status(404).json({ message: "Load not found" });
    }

    if (load.assignedFleetOwner?.fleetOwnerId) {
      return res
        .status(400)
        .json({ message: "That load already has a carrier assigned." });
    }

    if (load.instantDispatch?.status === "PENDING") {
      return res.status(400).json({
        message: "That load is already out to carriers.",
        expiresAt: load.instantDispatch.expiresAt,
      });
    }

    const result = await requestInstantDispatch(load, {
      requestedBy: req.user._id,
      branchId: load.locationId,
    });

    if (!result.ok) {
      return res.status(422).json({ message: result.reason, ...result });
    }

    res.json({
      message: `Offered to ${result.offered} carrier${result.offered === 1 ? "" : "s"} near the pickup.`,
      ...result,
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// ══ Office settings ═══════════════════════════════════════════════════════════

// @desc    The dials for this location, and what they are inherited from
// @route   GET /api/instant-dispatch/settings
// @access  Private (staff, admin)
const getSettings = async (req, res) => {
  try {
    // `branch` empty means the house default row, which is what an admin edits
    // to move every location at once.
    const branchId = req.query.branch || null;
    res.json(await settingsFor(branchId));
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Change them
// @route   PUT /api/instant-dispatch/settings
// @access  Private (admin)
//
// Admin only. The commission rate is what the business earns per load, and it
// is not something a staff account should be able to move.
const updateSettings = async (req, res) => {
  try {
    const branchId = req.body.branch || null;
    const settings = await saveSettings(branchId, req.body, req.user._id);

    res.json({
      message: branchId
        ? "Settings saved for this location."
        : "Default settings saved. Locations without their own settings follow these.",
      ...settings,
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

module.exports = {
  getMyOffers,
  acceptOffer,
  declineOffer,
  requestForLoad,
  getSettings,
  updateSettings,
};
