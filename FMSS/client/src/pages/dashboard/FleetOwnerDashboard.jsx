import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api";
import {
  Gavel,
  EmojiEvents,
  LocalShipping,
  Timer,
  TrendingUp,
  Schedule,
  DirectionsCar,
  CheckCircle,
  PendingActions,
  Cancel,
} from "@mui/icons-material";
import { uiStyles } from "../../style/uiStyles";
import {
  StatCard,
  SummaryCard,
  WeeklySummaryCard,
} from "../../components/cards/StatCard";
import QuickActionCard from "../../components/cards/QuickActionCard";

const FleetOwnerDashboard = () => {
  const [stats, setStats] = useState(null);
  console.log("FleetOwnerDashboard stats:", stats); 
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.get("/stats");
        setStats(res.data);
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600" />
      </div>
    );
  }

  const formatTimeRemaining = (endTime) => {
    if (!endTime) return "N/A";
    const diff = new Date(endTime) - new Date();
    if (diff <= 0) return "Ended";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m`;
  };

  const user = JSON.parse(localStorage.getItem("user"));

  const weekSummaryStats = [
    { weekDay: "Monday", Won: 0, Lost: 0, Placed: 0, Active: 0 },
    { weekDay: "Tuesday", Won: 0, Lost: 0, Placed: 0, Active: 0 },
    { weekDay: "Wednesday", Won: 0, Lost: 0, Placed: 0, Active: 0 },
    { weekDay: "Thursday", Won: 0, Lost: 0, Placed: 0, Active: 0 },
    { weekDay: "Friday", Won: 0, Lost: 0, Placed: 0, Active: 0 },
    { weekDay: "Saturday", Won: 0, Lost: 0, Placed: 0, Active: 0 },
    { weekDay: "Sunday", Won: 0, Lost: 0, Placed: 0, Active: 0 },
  ];

  const bidSummaryStats = [
    {
      label: "Available Loads",
      value: stats?.availableLoads || 0,
      color: "green",
      onClick: () => navigate("/fleetOwner/available-bids"),
    },
    {
      label: "Upcoming Bidding",
      value: stats?.upcomingBidding || 0,
      color: "blue",
      onClick: () => navigate("/fleetOwner/available-bids"),
    },
    {
      label: "Active Bidding",
      value: stats?.activeBidding || 0,
      color: "purple",
      onClick: () => navigate("/fleetOwner/available-bids"),
    },
    {
      label: "Total Bids Placed",
      value: stats?.totalBidsPlaced || 0,
      color: "indigo",
      onClick: () => navigate("/fleetOwner/my-bids"),
    },
    {
      label: "Won Bids",
      value: stats?.wonBids || 0,
      color: "green",
      onClick: () => navigate("/fleetOwner/my-bids?status=won"),
    },
    {
      label: "Lost Bids",
      value: stats?.lostBids || 0,
      color: "red",
      onClick: () => navigate("/fleetOwner/my-bids?status=lost"),
    },
    {
      label: "Pending Bids",
      value: stats?.pendingBids || 0,
      color: "yellow",
      onClick: () => navigate("/fleetOwner/my-bids?status=pending"),
    },
    {
      label: "Cancelled Bids",
      value: stats?.cancelledBids || 0,
      color: "gray",
    },
    {
      label: "Active Trips",
      value: stats?.activeTrips || 0,
      color: "blue",
      onClick: () => navigate("/fleetOwner/trips"),
    },
    {
      label: "Completed Trips",
      value: stats?.completedTrips || 0,
      color: "green",
      onClick: () => navigate("/fleetOwner/trips?status=completed"),
    },
    {
      label: "Total Vehicles",
      value: stats?.totalVehicles || 0,
      color: "gray",
      onClick: () => navigate("/fleetOwner/vehicles"),
    },
    {
      label: "Available Vehicles",
      value: stats?.availableVehicles || 0,
      color: "green",
      onClick: () => navigate("/fleetOwner/vehicles"),
    },
  ];

  return (
    <div className={uiStyles.page}>
      {/* Header */}
      <div className={uiStyles.flexBetween}>
        <div>
          <h1 className="page-title">Fleet Owner Dashboard</h1>
          <p className="page-subtitle">
            Find loads, place bids, and manage your fleet.
          </p>
        </div>
      </div>

      {/* Main Stat Cards */}
      <div className={uiStyles.grid4}>
        <StatCard
          title="Available Loads"
          value={stats?.availableLoads || 0}
          icon={<LocalShipping fontSize="large" />}
          color="green"
          onClick={() => navigate("/fleetOwner/available-bids")}
        />
        <StatCard
          title="Total Bids Placed"
          value={stats?.totalBidsPlaced || 0}
          icon={<Gavel fontSize="large" />}
          color="purple"
          onClick={() => navigate("/fleetOwner/my-bids")}
        />
        <StatCard
          title="Won Bids"
          value={stats?.wonBids || 0}
          icon={<EmojiEvents fontSize="large" />}
          color="yellow"
          onClick={() => navigate("/fleetOwner/my-bids?status=won")}
        />
        <StatCard
          title="Active Trips"
          value={stats?.activeTrips || 0}
          icon={<TrendingUp fontSize="large" />}
          color="blue"
          onClick={() => navigate("/fleetOwner/trips")}
        />
      </div>

      <div className="flex flex-col lg:flex-row lg:items-stretch gap-4">
        {/* Bids Summary */}
        <div className={`${uiStyles.card} flex-1`}>
          <h2 className="h4 mb-4 text-gray-500">Bids & Fleet Summary</h2>

          <div className={uiStyles.grid4}>
            {[0, 1, 2, 3].map((col) => (
              <SummaryCard
                key={col}
                stats={bidSummaryStats.filter((_, i) => i % 4 === col)}
              />
            ))}
          </div>

          <div className={uiStyles.weekleyGrid}>
            {weekSummaryStats.map((col) => (
              <WeeklySummaryCard key={col.weekDay} stats={col} />
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className={`${uiStyles.card} lg:w-64 shrink-0`}>
          <h2 className="h4 mb-4 text-gray-500">Quick Actions</h2>

          <div className={uiStyles.quickActionGrid}>
            {[
              {
                label: "Available Loads",
                icon: <LocalShipping fontSize="large" />,
                path: "/fleetOwner/available-bids",
                color: "green",
              },
              {
                label: "My Bids",
                icon: <Gavel fontSize="large" />,
                path: "/fleetOwner/my-bids",
                color: "purple",
              },
              {
                label: "My Trips",
                icon: <TrendingUp fontSize="large" />,
                path: "/fleetOwner/trips",
                color: "blue",
              },
              {
                label: "My Vehicles",
                icon: <DirectionsCar fontSize="large" />,
                path: "/fleetOwner/vehicles",
                color: "indigo",
              },
              {
                label: "Upcoming Bids",
                icon: <Schedule fontSize="large" />,
                path: "/fleetOwner/available-bids?status=upcoming",
                color: "yellow",
              },
            ].map(({ label, icon, path, color }) => (
              <QuickActionCard
                key={path}
                label={label}
                icon={icon}
                color={color}
                onClick={() => navigate(path)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Recent Lists */}
      <div className={`${uiStyles.grid2} items-stretch`}>
        {/* Live Bidding */}
        <div className={uiStyles.card}>
          <div className={uiStyles.cardHeader}>
            <h2 className="h4 text-gray-500">🔥 Live Bidding</h2>
            <button
              onClick={() => navigate("/fleetOwner/available-bids")}
              className="link"
            >
              View All
            </button>
          </div>

          <div className="space-y-3">
            {stats?.recentAvailableLoads?.length > 0 ? (
              stats.recentAvailableLoads.map((load) => (
                <div
                  key={load.loadId}
                  className={uiStyles.listItem}
                  onClick={() =>
                    navigate(`/fleetOwner/place-bid/${load.loadId}`)
                  }
                  style={{ cursor: "pointer" }}
                >
                  <div>
                    <p className="text-sm font-medium">{load.loadId}</p>
                    <p className="text-muted-md">
                      {load.pickup?.city} → {load.drop?.city}
                    </p>
                    <p className="text-muted">{load.customer}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">${load.amount}</p>
                    <p className="text-xs text-purple-600">
                      {load.bids?.length || 0} bids
                    </p>
                    <p className="text-xs text-orange-600">
                      Ends in: {formatTimeRemaining(load.bidEndTime)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted text-lg p-3 bg-gray-50 rounded-lg text-center">
                No Live Loads
              </p>
            )}
          </div>
        </div>

        {/* My Recent Bids */}
        <div className={uiStyles.card}>
          <div className={uiStyles.cardHeader}>
            <h2 className="h4 text-gray-500">My Recent Bids</h2>
            <button
              onClick={() => navigate("/fleetOwner/my-bids")}
              className="link"
            >
              View All
            </button>
          </div>

          <div className="space-y-3">
            {stats?.myRecentBids?.length > 0 ? (
              stats.myRecentBids.map((load) => {
                const myBid = load.bids?.find(
                  (b) => b.fleetOwnerId?.toString() === user?.id
                );
                const isWinner =
                  load.winningBid?.fleetOwnerId?.toString() === user?.id;

                return (
                  <div key={load.loadId} className={uiStyles.listItem}>
                    <div>
                      <p className="text-sm font-medium">{load.loadId}</p>
                      <p className="text-muted-md">
                        {load.pickup?.city} → {load.drop?.city}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        ${myBid?.amount || "N/A"}
                      </p>
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          isWinner
                            ? "bg-green-100 text-green-800"
                            : load.bidStatus === "OPEN"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {isWinner ? "🏆 WON" : load.bidStatus}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-muted text-lg p-3 bg-gray-50 rounded-lg text-center">
                No Recent Bids
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FleetOwnerDashboard;