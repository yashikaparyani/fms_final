import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api";
import {
  LocalShipping,
  PendingActions,
  CheckCircle,
  Warning,
  Gavel,
  Add,
} from "@mui/icons-material";
import { uiStyles } from "../../style/uiStyles";
import { StatCard, SummaryCard } from "../../components/cards/StatCard";
import QuickActionCard from "../../components/cards/QuickActionCard";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import DashboardHeader from "../../components/DashboardHeader";

const ClientDashboard = () => {
  const [stats, setStats] = useState(null);
  console.log("ClientDashboard stats:", stats); 
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // `silent` swaps the numbers in without dropping back to the full-page
  // spinner, so the background refresh is invisible.
  const fetchStats = async ({ silent = false } = {}) => {
    try {
      const res = await api.get("/stats");
      setStats(res.data);
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useAutoRefresh(() => fetchStats({ silent: true }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  const loadSummaryStats = [
    {
      label: "Total Loads",
      value: stats?.totalLoads || 0,
      color: "blue",
      onClick: () => navigate("/client/my-loads"),
    },
    {
      label: "Pending Verification",
      value: stats?.pendingLoads || 0,
      color: "yellow",
      onClick: () => navigate("/client/my-loads"),
    },
    {
      label: "Verified Loads",
      value: stats?.verifiedLoads || 0,
      color: "green",
      onClick: () => navigate("/client/my-loads-bidding"),
    },
    {
      label: "Requires Changes",
      value: stats?.requiresChanges || 0,
      color: "red",
      onClick: () => navigate("/client/my-loads"),
    },
    {
      label: "Active Bidding",
      value: stats?.activeBidding || 0,
      color: "purple",
      onClick: () => navigate("/client/my-loads-bidding"),
    },
    {
      label: "Completed Bidding",
      value: stats?.completedBidding || 0,
      color: "green",
    },
    {
      label: "Upcoming Bidding",
      value: stats?.upcomingBidding || 0,
      color: "orange",
      onClick: () => navigate("/client/my-loads-bidding"),
    },
    {
      label: "In Transit",
      value: stats?.enrouteLoads || 0,
      color: "blue",
    },
  ];

  return (
    <div className={uiStyles.page}>
      {/* Header */}
      <DashboardHeader
        title="Ship with S Line Transport"
        subtitle="Post freight, collect quotes and follow every shipment."
        stats={[
          { label: "Total loads", value: stats?.totalLoads },
          { label: "Pending", value: stats?.pendingLoads },
          { label: "Verified", value: stats?.verifiedLoads },
          { label: "In bidding", value: stats?.activeBidding },
        ]}
      />

      {/* Main Stat Cards */}
      <div className={uiStyles.grid4}>
        <StatCard
          title="Total Loads"
          value={stats?.totalLoads || 0}
          icon={<LocalShipping fontSize="large" />}
          color="blue"
          onClick={() => navigate("/client/my-loads")}
        />
        <StatCard
          title="Pending Verification"
          value={stats?.pendingLoads || 0}
          icon={<PendingActions fontSize="large" />}
          color="yellow"
          onClick={() => navigate("/client/my-loads")}
        />
        <StatCard
          title="Verified Loads"
          value={stats?.verifiedLoads || 0}
          icon={<CheckCircle fontSize="large" />}
          color="green"
          onClick={() => navigate("/client/my-loads-bidding")}
        />
        <StatCard
          title="Active Bidding"
          value={stats?.activeBidding || 0}
          icon={<Gavel fontSize="large" />}
          color="purple"
          onClick={() => navigate("/client/my-loads-bidding")}
        />
      </div>

      <div className="flex flex-col lg:flex-row lg:items-stretch gap-4">
        {/* Loads Summary */}
        <div className={`${uiStyles.card} flex-1`}>
          <div className={uiStyles.flexBetween}>
            <h2 className="h4 mb-4 text-gray-500">Loads Summary</h2>
            <button
              className="link"
              onClick={() => navigate("/client/my-loads")}
            >
              View All
            </button>
          </div>

          <div className={uiStyles.grid4}>
            {[0, 1, 2, 3].map((col) => (
              <SummaryCard
                key={col}
                stats={loadSummaryStats.filter((_, i) => i % 4 === col)}
              />
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className={`${uiStyles.card} lg:w-64 shrink-0`}>
          <h2 className="h4 mb-4 text-gray-500">Quick Actions</h2>

          <div className={uiStyles.quickActionGrid}>
            {[
              {
                label: "New Transport Order",
                icon: <Add fontSize="large" />,
                path: "/client/create-load",
                color: "blue",
              },
              {
                label: "View My Loads",
                icon: <LocalShipping fontSize="large" />,
                path: "/client/my-loads",
                color: "indigo",
              },
              {
                label: "Active Bids",
                icon: <Gavel fontSize="large" />,
                path: "/client/my-loads-bidding",
                color: "purple",
              },
              {
                label: "Review Changes",
                icon: <Warning fontSize="large" />,
                path: "/client/my-loads",
                color: "red",
              },
              {
                label: "Pending Loads",
                icon: <PendingActions fontSize="large" />,
                path: "/client/my-loads",
                color: "yellow",
              },
            ].map(({ label, icon, path, color }) => (
              <QuickActionCard
                key={`${path}-${label}`}
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
        {/* Recent Loads */}
        <div className={uiStyles.card}>
          <div className={uiStyles.cardHeader}>
            <h2 className="h4 text-gray-500">Recent Loads</h2>
            {stats?.recentLoads?.length > 4 && (
              <button
                onClick={() => navigate("/client/my-loads")}
                className="link"
              >
                View All
              </button>
            )}
          </div>

          <div className="space-y-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
            {stats?.recentLoads?.length > 0 ? (
              stats.recentLoads.slice(0, 4).map((load) => (
                <div key={load.loadId} className={uiStyles.listItem}>
                  <div>
                    <p className="text-sm font-medium">{load.loadId}</p>
                    <p className="text-muted-md">
                      {load.pickup?.city} → {load.drop?.city}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">${load.amount}</p>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        load.status === "VERIFIED"
                          ? "bg-green-100 text-green-800"
                          : load.status === "PENDING_VERIFICATION"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {load.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted text-lg p-3 bg-gray-50 rounded-lg text-center">
                No Recent Loads
              </p>
            )}
          </div>
        </div>

        {/* Active Bidding */}
        <div className={uiStyles.card}>
          <div className={uiStyles.cardHeader}>
            <h2 className="h4 text-gray-500">Active Bidding</h2>
            {stats?.recentActiveBidding?.length > 0 && (
              <button
                onClick={() => navigate("/client/my-loads-bidding")}
                className="link"
              >
                View All
              </button>
            )}
          </div>

          <div className="space-y-3">
            {stats?.recentActiveBidding?.length > 0 ? (
              stats.recentActiveBidding.slice(0, 4).map((load) => (
                <div key={load.loadId} className={uiStyles.listItem}>
                  <div>
                    <p className="text-sm font-medium">{load.loadId}</p>
                    <p className="text-muted-md">
                      {load.pickup?.city} → {load.drop?.city}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-purple-600">
                      {load.bids?.length || 0} bids
                    </p>
                    <p className="text-xs text-orange-600">
                      {load.bidStatus === "OPEN" ? "Bidding Open" : load.bidStatus}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted text-lg p-3 bg-gray-50 rounded-lg text-center">
                No Active Bids
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClientDashboard;