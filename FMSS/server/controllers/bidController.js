const Load = require("../models/Load");
const Bid = require("../models/bidSchema");
const FleetOwner = require("../models/FleetOwner");
const mongoose = require("mongoose");
const {
  carrierAvailability,
  atCapacityMessage,
} = require("../utils/carrierCapacity");

// @desc    Place or update a bid on a load
// @route   POST /api/loads/:loadId/bids
// @access  Private (FleetOwner)
const placeOrUpdateBid = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount) {
      return res.status(400).json({ message: "Bid amount is required" });
    }

    const fleetOwner = await FleetOwner.findOne({ userId: req.user._id });
    if (!fleetOwner) {
      return res
        .status(403)
        .json({ message: "Only fleet owners can place bids" });
    }

    // ─── One truck, one load ─────────────────────────────────────────────────
    // A carrier with every truck committed cannot take another load, so letting
    // them bid on one produces an offer that could never be awarded. The board
    // is already hidden from them (see getLoads); this is the same rule at the
    // write end, for a stale tab or a direct call.
    const availability = await carrierAvailability(fleetOwner._id);
    if (availability.atCapacity) {
      return res.status(409).json({
        code: "CARRIER_AT_CAPACITY",
        message: atCapacityMessage(availability),
      });
    }

    // Load is looked up by your custom string loadId (e.g. "LD 0001")
    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) {
      return res.status(404).json({ message: "Load not found" });
    }

    const now = new Date();
    if (
      load.bidStatus !== "OPEN" ||
      now < load.bidStartTime ||
      now > load.bidEndTime
    ) {
      return res
        .status(400)
        .json({ message: "Bidding is not active for this load" });
    }

    // Upsert: update if exists, create if not
    const bid = await Bid.findOneAndUpdate(
      {
        loadId: load._id,
        fleetOwnerId: fleetOwner._id,
      },
      {
        $set: {
          fleetOwnerName: fleetOwner.carrierName,
          amount,
          //deliveryDate,
          submittedAt: now,
          status: "ACTIVE",
        },
      },
      {
        returnDocument: "after",
        upsert: true,
        runValidators: true,
      },
    );

    const isNew = bid.createdAt.getTime() === bid.updatedAt?.getTime();
    return res.status(isNew ? 201 : 200).json({
      message: isNew ? "Bid placed successfully" : "Bid updated successfully",
      bid,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get my bid for a load
// @route   GET /api/loads/:loadId/bids/my
// @access  Private (FleetOwner)
const getMyBid = async (req, res) => {
  try {
    const fleetOwner = await FleetOwner.findOne({ userId: req.user._id });
    if (!fleetOwner) {
      return res.status(403).json({ message: "Fleet owner not found" });
    }

    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) {
      return res.status(404).json({ message: "Load not found" });
    }

    const myBid = await Bid.findOne({
      loadId: load._id,
      fleetOwnerId: fleetOwner._id,
    });

    res.json({ myBid: myBid || null });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getBidsForFleetOwner = async (req, res) => {
  try {
    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) {
      return res.status(404).json({ message: "Load not found" });
    }

    const bids = await Bid.find({ loadId: load._id });
    if (!bids.length) return res.json([]);

    const now = new Date();

    const fleetOwnerIds = bids.map((b) => b.fleetOwnerId);
    const fleetOwners = await FleetOwner.find({
      _id: { $in: fleetOwnerIds },
    }).populate("userId", "firstName lastName");

    const foMap = {};
    fleetOwners.forEach((fo) => {
      foMap[fo._id.toString()] = {
        rating: fo.rating || 0,
        name: fo.userId
          ? `${fo.userId.firstName} ${fo.userId.lastName}`.trim()
          : fo.carrierName || "Unknown",
      };
    });

    const amounts = bids.map((b) => b.amount);
    const ratings = bids.map(
      (b) => foMap[b.fleetOwnerId.toString()]?.rating || 0,
    );

    const minAmount = Math.min(...amounts),
      maxAmount = Math.max(...amounts);
    const minRating = Math.min(...ratings),
      maxRating = Math.max(...ratings);

    const scoredBids = bids.map((bid) => {
      const foData = foMap[bid.fleetOwnerId.toString()] || {};
      const rating = foData.rating || 0;

      const amountScore =
        maxAmount === minAmount
          ? 1
          : (maxAmount - bid.amount) / (maxAmount - minAmount);

      const ratingScore =
        maxRating === minRating
          ? 1
          : (rating - minRating) / (maxRating - minRating);

      return {
        ...bid.toObject(),
        fleetOwnerName: foData.name || "Unknown",
        rating,
        score: 0.7 * amountScore + 0.3 * ratingScore,
      };
    });

    scoredBids.sort((a, b) => b.score - a.score);

    // ✅ CASE 1: ACTIVE WINDOW → return ranked list
    if (
      load.bidStatus === "OPEN" &&
      now >= load.bidStartTime &&
      now <= load.bidEndTime
    ) {
      return res.json(scoredBids);
    }

    // ✅ CASE 2: WINDOW CLOSED → close bidding only (no auto-allotment)
    if (now > load.bidEndTime) {
      if (load.bidStatus === "OPEN") {
        load.bidStatus = "CLOSED";
        await load.save();
      }
    }

    return res.json(scoredBids);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getBidsForLoad = async (req, res) => {
  try {
    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) return res.status(404).json({ message: "Load not found" });

    const bids = await Bid.find({ loadId: load._id });
    if (!bids.length) return res.json([]);

    const now = new Date();

    const fleetOwnerIds = bids.map((b) => b.fleetOwnerId);
    const fleetOwners = await FleetOwner.find({
      _id: { $in: fleetOwnerIds },
    }).populate("userId", "firstName lastName");

    const foMap = {};
    fleetOwners.forEach((fo) => {
      foMap[fo._id.toString()] = {
        rating: fo.rating || 0,
        name: fo.userId
          ? `${fo.userId.firstName} ${fo.userId.lastName}`.trim()
          : fo.carrierName || "Unknown",
      };
    });

    const amounts = bids.map((b) => b.amount);
    const ratings = bids.map(
      (b) => foMap[b.fleetOwnerId.toString()]?.rating || 0,
    );

    const minAmount = Math.min(...amounts),
      maxAmount = Math.max(...amounts);
    const minRating = Math.min(...ratings),
      maxRating = Math.max(...ratings);

    const scoredBids = bids.map((bid) => {
      const foData = foMap[bid.fleetOwnerId.toString()] || {};
      const rating = foData.rating || 0;

      const amountScore =
        maxAmount === minAmount
          ? 1
          : (maxAmount - bid.amount) / (maxAmount - minAmount);

      const ratingScore =
        maxRating === minRating
          ? 1
          : (rating - minRating) / (maxRating - minRating);

      return {
        ...bid.toObject(),
        fleetOwnerName: foData.name || "Unknown",
        rating,
        score: 0.7 * amountScore + 0.3 * ratingScore,
      };
    });

    scoredBids.sort((a, b) => b.score - a.score);

    // ── OPEN window → return ranked list ─────────────────────────────
    if (
      load.bidStatus === "OPEN" &&
      now >= load.bidStartTime &&
      now <= load.bidEndTime
    ) {
      return res.json(scoredBids);
    }

    // ── WINDOW CLOSED → close bidding only (no auto-allotment) ─────────────
    if (now > load.bidEndTime) {
      if (load.bidStatus === "OPEN") {
        load.bidStatus = "CLOSED";
        await load.save();
      }
    }

    return res.json(scoredBids);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getWonBidsByFleetOwner = async (req, res) => {
  try {
    const userId = req.user.id;

    // Find logged-in fleet owner
    const fleetOwner = await FleetOwner.findOne({ userId }).populate(
      "userId",
      "firstName lastName",
    );

    if (!fleetOwner) {
      return res.status(404).json({ message: "Fleet owner not found" });
    }

    // ✅ Match by fleetOwnerId — never by name (names can mismatch)
    const wonLoads = await Load.find({
      "winningBid.fleetOwnerId": fleetOwner._id,
      bidStatus: "CLOSED",
    }).sort({ updatedAt: -1 });

    res.status(200).json(wonLoads);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMyAllBidsWithStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    const fleetOwner = await FleetOwner.findOne({ userId });

    if (!fleetOwner) {
      return res.status(404).json({ message: "Fleet owner not found" });
    }

    const bids = await Bid.find({
      fleetOwnerId: fleetOwner._id,
    }).lean();

    if (!bids.length) return res.json([]);

    const loadIds = bids.map((b) => b.loadId);

    const loads = await Load.find({
      _id: { $in: loadIds },
    }).lean();

    const loadMap = {};
    loads.forEach((l) => {
      loadMap[l._id.toString()] = l;
    });

    const result = bids
      .map((bid) => {
        const load = loadMap[bid.loadId.toString()];
        if (!load) return null;

        const hasWinner = !!load.winningBid;

        const isWinner =
          hasWinner &&
          load.winningBid.fleetOwnerId.toString() === fleetOwner._id.toString();

        const isAssignedToMe =
          load.assignedFleetOwner?.fleetOwnerId?.toString() ===
          fleetOwner._id.toString();

        const accepted =
          isAssignedToMe && load.transportStatus === "READY_TO_PICKUP";

        // Only a still-open offer is worth surfacing; once answered the amount
        // above already reflects the outcome.
        const pendingOffer =
          bid.negotiation?.status === "PENDING"
            ? {
                amount: bid.negotiation.amount,
                previousAmount: bid.negotiation.previousAmount,
                offeredAt: bid.negotiation.offeredAt,
              }
            : null;

        return {
          bidId: bid._id,
          amount: bid.amount,
          bidStatus: bid.status,
          negotiation: pendingOffer,

          loadId: load.loadId,
          pickup: load.pickup,
          drop: load.drop,
          truckType: load.truckType,

          bidPlacedAt: bid.submittedAt,
          bidClosedAt: load.bidEndTime,

          // ✅ FINAL RESULT FIX
          result: !hasWinner ? "PENDING" : isWinner ? "WON" : "LOST",

          accepted,

          transportStatus: load.transportStatus,
        };
      })
      .filter(Boolean);

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// const getMyAllBidsWithStatus = async (req, res) => {
//   try {
//     // ✅ Cast to ObjectId — req.user.id is a string, userId field is ObjectId
//     const userId = new mongoose.Types.ObjectId(req.user.id);

//     const fleetOwner = await FleetOwner.findOne({ userId });

//     if (!fleetOwner) {
//       return res.status(404).json({ message: "Fleet owner not found" });
//     }

//     const fleetOwnerMongoId = fleetOwner._id.toString();

//     // Debug — remove after confirming
//     console.log("Logged-in fleetOwnerMongoId:", fleetOwnerMongoId);

//     const bids = await Bid.find({ fleetOwnerId: fleetOwner._id }).lean();
//     if (!bids.length) return res.json([]);

//     const loadIds = bids.map((b) => b.loadId);
//     const loads = await Load.find({ _id: { $in: loadIds } }).lean();

//     const loadMap = {};
//     loads.forEach((l) => {
//       loadMap[l._id.toString()] = l;
//     });

//     const result = bids.map((bid) => {
//       const load = loadMap[bid.loadId.toString()];
//       if (!load) return null;

//       // Debug — remove after confirming
//       console.log(`Load ${load.loadId} | winningBid.fleetOwnerId:`,
//         load.winningBid?.fleetOwnerId?.toString(),
//         "| current fleet owner:", fleetOwnerMongoId
//       );

//       let finalResult = "PENDING";

//       if (load.winningBid?.fleetOwnerId) {
//         const winnerId = load.winningBid.fleetOwnerId.toString();
//         finalResult = winnerId === fleetOwnerMongoId ? "WON" : "LOST";
//       }

//       const isAccepted =
//         finalResult === "WON" &&
//         load.transportStatus === "READY_TO_PICKUP";

//       return {
//         bidId:           bid._id,
//         amount:          bid.amount,
//         bidStatus:       bid.status,

//         loadId:          load.loadId,
//         loadMongoId:     load._id,

//         pickup:          load.pickup,
//         drop:            load.drop,
//         truckType:       load.truckType,

//         bidPlacedAt:     bid.submittedAt,
//         bidClosedAt:     load.bidEndTime,

//         result:          finalResult,
//         accepted:        isAccepted,

//         transportStatus: load.transportStatus,
//       };
//     }).filter(Boolean);

//     res.status(200).json(result);
//   } catch (error) {
//     console.error("getMyAllBidsWithStatus error:", error);
//     res.status(500).json({ message: error.message });
//   }
// };

// @desc    Accept a winning bid
// @route   PUT /api/loads/:loadId/bids/:bidId/accept
// @access  Private (Client/Staff)
const acceptBid = async (req, res) => {
  try {
    const load = await Load.findOne({ loadId: req.params.loadId });
    if (!load) {
      return res.status(404).json({ message: "Load not found" });
    }

    const winningBid = await Bid.findById(req.params.bidId);
    if (!winningBid || winningBid.loadId.toString() !== load._id.toString()) {
      return res.status(404).json({ message: "Bid not found for this load" });
    }

    // Mark winning bid
    winningBid.status = "WINNING";
    await winningBid.save();

    // Reject all other bids for this load
    await Bid.updateMany(
      { loadId: load._id, _id: { $ne: winningBid._id } },
      { $set: { status: "REJECTED" } },
    );

    // Snapshot onto load (so you don't lose the data if bid is deleted later)
    load.winningBid = {
      id: winningBid._id,
      fleetOwnerId: winningBid.fleetOwnerId,
      fleetOwnerName: winningBid.fleetOwnerName,
      amount: winningBid.amount,
      submittedAt: winningBid.submittedAt,
    };
    // Keep the carrier payout on the load in step with the settled bid — the
    // apps read vendorRate for it, and the pre-bid target would be a different
    // number than the one that was agreed.
    load.vendorRate = winningBid.amount;
    load.bidStatus = "CLOSED";
    load.status = "ASSIGNED";
    load.assignedFleetOwner = {
      fleetOwnerId: winningBid.fleetOwnerId,
      fleetOwnerName: winningBid.fleetOwnerName,
      assignedAt: new Date(),
    };

    await load.save();

    res.json({ message: "Bid accepted", load });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  placeOrUpdateBid,
  getMyBid,
  getBidsForFleetOwner,
  getBidsForLoad,
  acceptBid,
  getWonBidsByFleetOwner,
  getMyAllBidsWithStatus,
};
