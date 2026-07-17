const Load = require("../models/Load");
const User = require("../models/User");
const Bid = require("../models/bidSchema");
const FleetOwner = require("../models/FleetOwner");

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
        .select("loadId customer pickup drop status amount createdAt");

      // Recent active bidding
      const recentActiveBidding = await Load.find({ bidStatus: "OPEN" })
        .sort({ bidEndTime: 1 })
        .limit(5)
        .select("loadId customer pickup drop bidStatus bidEndTime bids");

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

    if (role === "fleetOwner") {
      // Find fleet owner document using logged in user
      const fleetOwner = await FleetOwner.findOne({ userId: _id });

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
        .select("loadId customer pickup drop amount bidEndTime");

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
      const tz = req.query.tz || "UTC";

      // Helper: get start-of-day and end-of-day in the given timezone for an
      // offset of `i` days from today (in that same timezone).
      const getLocalDayBounds = (offsetDays) => {
        // Get the current date string in the target timezone (YYYY-MM-DD)
        const nowInTz = new Intl.DateTimeFormat("en-CA", {
          timeZone: tz,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());

        // Build a Date from that YYYY-MM-DD string, then add offset days
        const [year, month, day] = nowInTz.split("-").map(Number);
        const localDate = new Date(Date.UTC(year, month - 1, day + offsetDays));

        // Compute midnight in the target tz for that calendar date
        const localDateStr = new Intl.DateTimeFormat("en-CA", {
          timeZone: tz,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(localDate);

        // Parse start-of-day (00:00:00) in target tz as UTC instant
        const startOfDay = new Date(
          new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          })
            .formatToParts(new Date(`${localDateStr}T00:00:00`))
            .reduce((acc, p) => {
              if (p.type !== "literal") acc[p.type] = p.value;
              return acc;
            }, {})
        );

        // Use simple approach: treat YYYY-MM-DDT00:00:00 in that tz
        const start = new Date(`${localDateStr}T00:00:00`);
        // Adjust for tz offset by computing the UTC offset
        const tzOffset = -start.getTimezoneOffset(); // local machine offset (minutes)
        // Instead, compute properly using Intl
        const startUTC = getUTCFromLocal(`${localDateStr}T00:00:00`, tz);
        const endUTC   = getUTCFromLocal(`${localDateStr}T23:59:59.999`, tz);

        return { startUTC, endUTC, localDateStr };
      };

      const getUTCFromLocal = (localISO, timezone) => {
        // localISO like "2026-07-17T00:00:00"
        // We need to find what UTC time corresponds to midnight in `timezone`
        const formatter = new Intl.DateTimeFormat("en-US", {
          timeZone: timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        });

        // Binary search / offset trick: parse localISO as if UTC, then correct
        const guessUTC = new Date(localISO + "Z");
        const parts = formatter.formatToParts(guessUTC);
        const p = {};
        parts.forEach(({ type, value }) => { if (type !== "literal") p[type] = value; });
        const guessLocal = new Date(
          `${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute}:${p.second}Z`
        );
        const diff = guessLocal - guessUTC; // ms offset
        return new Date(new Date(localISO + "Z") - diff);
      };

      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

      for (let i = 0; i < 7; i++) {
        const { startUTC, endUTC, localDateStr } = getLocalDayBounds(i);

        const dateFilter = { $gte: startUTC, $lte: endUTC };

        const [delivered, pickup, drop] = await Promise.all([
          Load.countDocuments({ createdAt: dateFilter, transportStatus: "DELIVERED" }),
          Load.countDocuments({ createdAt: dateFilter, singleType: "Pick Up" }),
          Load.countDocuments({ createdAt: dateFilter, singleType: "Drop" }),
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
