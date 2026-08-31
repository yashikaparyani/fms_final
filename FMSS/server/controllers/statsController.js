const Load = require("../models/Load");
const User = require("../models/User");
const Bid = require("../models/bidSchema");
const FleetOwner = require("../models/FleetOwner");
const { resolveTimeZone, dayRangeInTz } = require("../utils/timezone");
const { lfdFilter } = require("../utils/lfdBuckets");
const {
  pickupDayFilter,
  accessorialFilter,
  unassignedFilter,
} = require("../utils/dashboardBuckets");
const { findCarrierFor } = require("../utils/carrierAccount");

// @desc    Get dashboard stats based on user role
// @route   GET /api/stats
// @access  Private
const getStats = async (req, res) => {
  try {
    const { role, _id } = req.user;

    if (role === "client") {
      // Client sees their own load statistics
      const totalLoads = await Load.countDocuments({ creatorId: _id });
      const pendingLoads = await Load.countDocuments({
        creatorId: _id,
        status: "PENDING_VERIFICATION",
      });
      const verifiedLoads = await Load.countDocuments({
        creatorId: _id,
        status: { $in: ["VERIFIED", "ASSIGNED"] },
      });
      const requiresChanges = await Load.countDocuments({
        creatorId: _id,
        status: "REQUIRES_CHANGES",
      });
      const activeBidding = await Load.countDocuments({
        creatorId: _id,
        bidStatus: "OPEN",
      });
      const completedBidding = await Load.countDocuments({
        creatorId: _id,
        bidStatus: "CLOSED",
      });

      // Recent loads
      const recentLoads = await Load.find({ creatorId: _id })
        .sort({ createdAt: -1 })
        .limit(5)
        .select(
          "loadId customer pickup drop status bidStatus amount createdAt",
        );

      return res.json({
        totalLoads,
        pendingLoads,
        verifiedLoads,
        requiresChanges,
        activeBidding,
        completedBidding,
        recentLoads,
      });
    }

    // if (role === "staff" || role === "admin") {
    //   // Staff/Admin sees overall statistics
    //   const totalCustomers = await User.countDocuments({ role: "client" });
    //   const totalFleetOwners = await FleetOwner.countDocuments();
    //   const totalLoads = await Load.countDocuments();
    //   const pendingLoads = await Load.countDocuments({ status: "PENDING_VERIFICATION" });
    //   const verifiedLoads = await Load.countDocuments({ status: "VERIFIED" });
    //   const requiresChanges = await Load.countDocuments({ status: "REQUIRES_CHANGES" });
    //   const upcomingBidding = await Load.countDocuments({ bidStatus: "UPCOMING", status: "VERIFIED" });
    //   const activeBidding = await Load.countDocuments({ bidStatus: "OPEN" });
    //   const closedBidding = await Load.countDocuments({ bidStatus: "CLOSED" });

    //   // Recent pending loads
    //   const recentPendingLoads = await Load.find({ status: "PENDING_VERIFICATION" })
    //     .sort({ createdAt: -1 })
    //     .limit(5)
    //     .select("loadId customer pickup drop status amount createdAt");

    //   // Recent active bidding
    //   const recentActiveBidding = await Load.find({ bidStatus: "OPEN" })
    //     .sort({ bidEndTime: 1 })
    //     .limit(5)
    //     .select("loadId customer pickup drop bidStatus bidEndTime bids");

    //   return res.json({
    //     totalCustomers,
    //     totalFleetOwners,
    //     totalLoads,
    //     pendingLoads,
    //     verifiedLoads,
    //     requiresChanges,
    //     upcomingBidding,
    //     activeBidding,
    //     closedBidding,
    //     recentPendingLoads,
    //     recentActiveBidding,
    //   });
    // }

    if (role === "staff" || role === "admin") {
      const totalCustomers = await User.countDocuments({ role: "client" });
      const totalFleetOwners = await FleetOwner.countDocuments();
      const totalLoads = await Load.countDocuments();

      // ✅ Approval status
      const pendingLoads = await Load.countDocuments({
        status: "PENDING_VERIFICATION",
      });
      const verifiedLoads = await Load.countDocuments({ status: "VERIFIED" });
      const requiresChanges = await Load.countDocuments({
        status: "REQUIRES_CHANGES",
      });

      // ✅ 🚀 Transport status (ADD THIS)

      // ✅ Only VERIFIED loads
      const baseFilter = { status: "VERIFIED" };

      const loadPlanner = await Load.countDocuments({
        ...baseFilter,
        transportStatus: "LOAD_PLANNER",
      });

      const newLoads = await Load.countDocuments({
        ...baseFilter,
        transportStatus: "NEW_LOAD",
      });

      const assignedLoads = await Load.countDocuments({
        ...baseFilter,
        transportStatus: "ASSIGNED",
      });

      // The carrier has accepted and is on their way to the pickup. It is a
      // stage of its own in the transport enum and was the one stage the
      // dashboard never reported, so a load sat in "Assigned" on the board while
      // dispatch had already been told the truck was rolling.
      const readyToPickupLoads = await Load.countDocuments({
        ...baseFilter,
        transportStatus: "READY_TO_PICKUP",
      });

      const pickedupLoads = await Load.countDocuments({
        ...baseFilter,
        transportStatus: "PICKED_UP",
      });

      const enrouteLoads = await Load.countDocuments({
        ...baseFilter,
        transportStatus: "IN_TRANSIT",
      });

      const reachedDestinationLoads = await Load.countDocuments({
        ...baseFilter,
        transportStatus: "REACHED_DESTINATION",
      });

      const deliveredLoads = await Load.countDocuments({
        ...baseFilter,
        transportStatus: "DELIVERED",
      });

      const terminatedLoads = await Load.countDocuments({
        ...baseFilter,
        transportStatus: "TERMINATED",
      });

      const paperworkPending = await Load.countDocuments({
        ...baseFilter,
        transportStatus: "PAPERWORK_PENDING",
      });

      const streetTurn = await Load.countDocuments({
        ...baseFilter,
        transportStatus: "STREET_TURN",
      });

      const emptyYard = await Load.countDocuments({
        ...baseFilter,
        transportStatus: "EMPTY_IN_YARD",
      });

      const loadedYard = await Load.countDocuments({
        ...baseFilter,
        transportStatus: "LOADED_IN_YARD",
      });

      const driverWaiting = await Load.countDocuments({
        ...baseFilter,
        transportStatus: "DRIVER_ON_WAITING",
      });

      const dropWarehouse = await Load.countDocuments({
        ...baseFilter,
        transportStatus: "DROP_IN_WAREHOUSE",
      });

      // Its own stage in the transport pipeline, set by staff — not derived
      // from delivery or paperwork state.
      const invoiceableLoads = await Load.countDocuments({
        ...baseFilter,
        transportStatus: "INVOICED",
      });

      // ─── Date-sensitive counts ───────────────────────────────────────────
      // Resolved in the viewer's timezone so "today" means the staff member's
      // today, not the server's.
      const tz = resolveTimeZone(req.query.tz);
      const today = dayRangeInTz(tz, 0);
      const dayRange = (offset) => dayRangeInTz(tz, offset);

      // Loads picking up today / tomorrow, and loads carrying accessorial
      // charges. The same filters back `GET /loads?pickupDay=…` and
      // `?accessorial=true`, so each tile and the list it opens always agree.
      const [sameDayLoads, nextDayLoads] = await Promise.all(
        ["today", "tomorrow"].map((day) =>
          Load.countDocuments(pickupDayFilter(day, dayRange)),
        ),
      );

      const accessorialLoads = await Load.countDocuments(accessorialFilter());

      // Verified loads nobody is carrying. Their status is locked until they are
      // assigned, so this is the queue that has to be worked before anything
      // else on the board can move — see utils/dashboardBuckets.js.
      const unassignedLoads = await Load.countDocuments(unassignedFilter());

      // ─── LFD buckets ─────────────────────────────────────────────────────
      // Three mutually exclusive groups; see utils/lfdBuckets.js. The same
      // filters back `GET /loads?lfd=…`, so each tile and the list it opens
      // always agree.
      const [lfdExpiredLoads, lfdTodayLoads, upcomingLfdLoads] = await Promise.all(
        ["expired", "today", "upcoming"].map((bucket) =>
          Load.countDocuments(lfdFilter(bucket, today)),
        ),
      );

      // const loadPlanner = await Load.countDocuments({ transportStatus: "LOAD_PLANNER" });
      // const newLoads = await Load.countDocuments({ transportStatus: "NEW_LOAD" });
      // const assignedLoads = await Load.countDocuments({ transportStatus: "ASSIGNED" });
      // const pickedupLoads = await Load.countDocuments({ transportStatus: "PICKED_UP" });
      // const enrouteLoads = await Load.countDocuments({ transportStatus: "IN_TRANSIT" });
      // const reachedDestinationLoads = await Load.countDocuments({ transportStatus: "REACHED_DESTINATION" });
      // const deliveredLoads = await Load.countDocuments({ transportStatus: "DELIVERED" });
      // const terminatedLoads = await Load.countDocuments({ transportStatus: "TERMINATED" });
      // const paperworkPending = await Load.countDocuments({ transportStatus: "PAPERWORK_PENDING" });
      // const streetTurn = await Load.countDocuments({ transportStatus: "STREET_TURN" });
      // const emptyYard = await Load.countDocuments({ transportStatus: "EMPTY_IN_YARD" });
      // const loadedYard = await Load.countDocuments({ transportStatus: "LOADED_IN_YARD" });
      // const driverWaiting = await Load.countDocuments({ transportStatus: "DRIVER_ON_WAITING" });
      // const dropWarehouse = await Load.countDocuments({ transportStatus: "DROP_IN_WAREHOUSE" });

      // Bidding
      const upcomingBidding = await Load.countDocuments({
        bidStatus: "UPCOMING",
        status: "VERIFIED",
      });
      const activeBidding = await Load.countDocuments({ bidStatus: "OPEN" });
      const closedBidding = await Load.countDocuments({ bidStatus: "CLOSED" });

      // Recent pending loads
      const recentPendingLoads = await Load.find({
        status: "PENDING_VERIFICATION",
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("loadId customer customerName pickup drop status amount createdAt");

      // Recent active bidding
      const recentActiveBidding = await Load.find({ bidStatus: "OPEN" })
        .sort({ bidEndTime: 1 })
        .limit(5)
        .select("loadId customer customerName pickup drop bidStatus bidEndTime bids");

      return res.json({
        totalCustomers,
        totalFleetOwners,
        totalLoads,

        // ✅ Approval
        pendingLoads,
        verifiedLoads,
        requiresChanges,

        // 🚀 Transport (THIS FIXES YOUR ISSUE)
        loadPlanner,
        newLoads,
        assignedLoads,
        readyToPickupLoads,
        unassignedLoads,
        pickedupLoads,
        enrouteLoads,
        reachedDestinationLoads,
        deliveredLoads,
        terminatedLoads,
        paperworkPending,
        streetTurn,
        emptyYard,
        loadedYard,
        driverWaiting,
        dropWarehouse,
        invoiceableLoads,

        // 📅 Date-sensitive
        sameDayLoads,
        nextDayLoads,
        accessorialLoads,

        // ⏳ Last Free Date buckets
        lfdExpiredLoads,
        lfdTodayLoads,
        upcomingLfdLoads,

        // Bidding
        upcomingBidding,
        activeBidding,
        closedBidding,

        recentPendingLoads,
        recentActiveBidding,
      });
    }

    // if (role === "fleetOwner") {
    //   // Fleet owner sees their bidding statistics
    //   const userId = _id.toString();

    //   // Get all loads where this user has placed bids
    //   const loadsWithMyBids = await Load.find({ "bids.fleetOwnerId": _id });

    //   const totalBidsPlaced = loadsWithMyBids.reduce((acc, load) => {
    //     return (
    //       acc +
    //       load.bids.filter((b) => b.fleetOwnerId.toString() === userId).length
    //     );
    //   }, 0);

    //   // Count won bids (where winningBid.fleetOwnerId matches)
    //   const wonBids = await Load.countDocuments({
    //     "winningBid.fleetOwnerId": _id,
    //     bidStatus: "CLOSED",
    //   });

    //   // Available loads with open bidding
    //   const availableLoads = await Load.countDocuments({
    //     status: "VERIFIED",
    //     bidStatus: "OPEN",
    //   });

    //   // Upcoming bidding
    //   const upcomingBidding = await Load.countDocuments({
    //     status: "VERIFIED",
    //     bidStatus: "UPCOMING",
    //   });

    //   // Recent available loads
    //   const recentAvailableLoads = await Load.find({
    //     status: "VERIFIED",
    //     bidStatus: "OPEN",
    //   })
    //     .sort({ bidEndTime: 1 })
    //     .limit(5)
    //     .select("loadId customer pickup drop amount bidEndTime bids");

    //   // My recent bids
    //   const myRecentBids = await Load.find({ "bids.fleetOwnerId": _id })
    //     .sort({ updatedAt: -1 })
    //     .limit(5)
    //     .select("loadId customer pickup drop amount bidStatus bids winningBid");

    //   return res.json({
    //     totalBidsPlaced,
    //     wonBids,
    //     availableLoads,
    //     upcomingBidding,
    //     recentAvailableLoads,
    //     myRecentBids,
    //   });
    // }

    // Drivers see their carrier's numbers: they are looking at the same fleet of
    // trips from the cab. Resolved from their account rather than from the
    // request — see utils/carrierAccount.js.
    if (role === "fleetOwner" || role === "driver") {
      const fleetOwner = await findCarrierFor(req.user);

      if (!fleetOwner) {
        return res.json({
          totalBidsPlaced: 0,
          wonBids: 0,
          availableLoads: 0,
          upcomingBidding: 0,
          activeBidding: 0,
          lostBids: 0,
          pendingBids: 0,
          cancelledBids: 0,
          activeTrips: 0,
          completedTrips: 0,
          recentAvailableLoads: [],
          myRecentBids: [],
        });
      }

      const fleetOwnerId = fleetOwner._id;

      // =========================
      // BIDS
      // =========================

      const totalBidsPlaced = await Bid.countDocuments({
        fleetOwnerId,
      });

      const wonBids = await Load.countDocuments({
        "winningBid.fleetOwnerId": fleetOwnerId,
        bidStatus: "CLOSED",
      });

      const pendingBids = await Bid.countDocuments({
        fleetOwnerId,
        status: "ACTIVE",
      });

      const lostBids = await Bid.countDocuments({
        fleetOwnerId,
        status: "REJECTED",
      });

      const cancelledBids = 0;

      // =========================
      // AVAILABLE LOADS
      // =========================

      const availableLoads = await Load.countDocuments({
        status: { $in: ["VERIFIED", "ASSIGNED"] },
        bidStatus: "OPEN",
      });

      const upcomingBidding = await Load.countDocuments({
        status: { $in: ["VERIFIED", "ASSIGNED"] },
        bidStatus: "UPCOMING",
      });

      const activeBidding = await Load.countDocuments({
        status: { $in: ["VERIFIED", "ASSIGNED"] },
        bidStatus: "OPEN",
      });

      // =========================
      // TRIPS
      // =========================

      const activeTrips = await Load.countDocuments({
        "assignedFleetOwner.fleetOwnerId": fleetOwnerId,
        transportStatus: {
          $in: [
            "ASSIGNED",
            "READY_TO_PICKUP",
            "PICKED_UP",
            "IN_TRANSIT",
            "REACHED_DESTINATION",
          ],
        },
      });

      const completedTrips = await Load.countDocuments({
        "assignedFleetOwner.fleetOwnerId": fleetOwnerId,
        transportStatus: "DELIVERED",
      });

      // =========================
      // RECENT AVAILABLE LOADS
      // =========================

      const recentAvailableLoads = await Load.find({
        bidStatus: "OPEN",
      })
        .sort({ bidEndTime: 1 })
        .limit(5)
        .select("loadId customer customerName pickup drop amount bidEndTime");

      // =========================
      // MY RECENT BIDS
      // =========================

      const myBids = await Bid.find({ fleetOwnerId })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate({
          path: "loadId",
          select:
            "loadId pickup drop amount bidStatus winningBid assignedFleetOwner",
        });

      const myRecentBids = myBids.map((bid) => ({
        ...bid.loadId.toObject(),
        myBidAmount: bid.amount,
        myBidStatus: bid.status,
      }));

      return res.json({
        totalBidsPlaced,
        wonBids,
        availableLoads,
        upcomingBidding,
        activeBidding,
        lostBids,
        pendingBids,
        cancelledBids,
        activeTrips,
        completedTrips,
        recentAvailableLoads,
        myRecentBids,
      });
    }

    res.status(400).json({ message: "Invalid role" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getWeeklyStats = async (req, res) => {
  try {
    const { role, _id } = req.user;

    if (role === "staff" || role === "admin") {
      const weeklyStats = [];

      // Use client timezone if provided, otherwise fall back to UTC
      const tz = resolveTimeZone(req.query.tz);

      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

      for (let i = 0; i < 7; i++) {
        const { start, end, dateStr: localDateStr } = dayRangeInTz(tz, i);

        const dateFilter = { $gte: start, $lt: end };

        const [delivered, pickup, drop] = await Promise.all([
          Load.countDocuments({ createdAt: dateFilter, transportStatus: "DELIVERED" }),
          // "Pick Up" is the pre-rename value; count it alongside "Pick" so the
          // chart stays continuous across loads created either side of it.
          Load.countDocuments({
            createdAt: dateFilter,
            singleType: { $in: ["Pick", "Pick Up"] },
          }),
          Load.countDocuments({
            createdAt: dateFilter,
            singleType: { $in: ["Drop", "Delivery"] },
          }),
        ]);

        // Get day-of-week from the local date string
        const [y, m, d] = localDateStr.split("-").map(Number);
        const dowIndex = new Date(y, m - 1, d).getDay();

        weeklyStats.push({
          weekDay: i === 0 ? "Today" : dayNames[dowIndex],
          date: localDateStr,
          Delivery: delivered,
          Pickup: pickup,
          Drop: drop,
        });
      }

      return res.json({ weeklyStats });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


const csvEscape = (val) => {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const downloadReport = async (req, res) => {
  try {
    const { type = "loads", startDate, endDate } = req.query;

    // Build date filter
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    const rows = [];

    if (type === "bids") {
      const bids = await Bid.find(dateFilter)
        .populate("loadId", "loadId pickup drop bidStatus winningBid")
        .populate({ path: "fleetOwnerId", select: "carrierName ratingAverage" })
        .sort({ createdAt: -1 })
        .lean();

      rows.push([
        "Load ID",
        "Fleet Owner",
        "Amount",
        "Status",
        "Rating",
        "Submitted At",
      ]);

      bids.forEach((bid) => {
        rows.push([
          bid.loadId?.loadId,
          bid.fleetOwnerId?.carrierName,
          bid.amount,
          bid.status,
          bid.fleetOwnerId?.ratingAverage || 0,
          bid.submittedAt ? new Date(bid.submittedAt).toISOString() : "",
        ]);
      });
    } else if (type === "ratings") {
      const fleetOwners = await FleetOwner.find().lean();

      rows.push([
        "Fleet Owner",
        "Average Rating",
        "Rating Count",
        "Load ID",
        "Score",
        "Remark",
        "Rated At",
      ]);

      fleetOwners.forEach((fleetOwner) => {
        const filteredRatings = (fleetOwner.ratings || []).filter((rating) => {
          if (!startDate && !endDate) return true;

          const date = new Date(rating.ratedAt);
          if (startDate && date < new Date(startDate)) return false;
          if (endDate && date > new Date(endDate)) return false;
          return true;
        });

        if (!filteredRatings.length) {
          rows.push([
            fleetOwner.carrierName,
            fleetOwner.ratingAverage || 0,
            fleetOwner.ratingCount || 0,
            "",
            "",
            "",
            "",
          ]);
          return;
        }

        filteredRatings.forEach((rating) => {
          rows.push([
            fleetOwner.carrierName,
            fleetOwner.ratingAverage || 0,
            fleetOwner.ratingCount || 0,
            rating.loadId,
            rating.score,
            rating.remark,
            rating.ratedAt ? new Date(rating.ratedAt).toISOString() : "",
          ]);
        });
      });
    } else {
      const loads = await Load.find(dateFilter)
        .populate("customer", "firstName lastName email")
        .sort({ createdAt: -1 })
        .lean();

      rows.push([
        "Load ID",
        "Customer",
        "Pickup",
        "Drop",
        "Load Status",
        "Transport Status",
        "Bid Status",
        "Assigned Fleet Owner",
        "Amount",
        "Created At",
      ]);

      loads.forEach((load) => {
        rows.push([
          load.loadId,
          `${load.customer?.firstName || ""} ${load.customer?.lastName || ""}`.trim(),
          `${load.pickup?.city || ""} ${load.pickup?.state || ""}`.trim(),
          `${load.drop?.city || ""} ${load.drop?.state || ""}`.trim(),
          load.status,
          load.transportStatus,
          load.bidStatus,
          load.assignedFleetOwner?.fleetOwnerName,
          load.amount,
          load.createdAt ? new Date(load.createdAt).toISOString() : "",
        ]);
      });
    }

    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${type}-report.csv"`,
    );

    res.send(csv);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getStats, getWeeklyStats, downloadReport };
