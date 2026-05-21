import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api";
import {
  People,
  LocalShipping,
  PendingActions,
  CheckCircle,
  Gavel,
  PersonAdd,
  Add,
  DirectionsCar,
  Settings,
  Timer,
} from "@mui/icons-material";
import AddBoxOutlinedIcon from "@mui/icons-material/AddBoxOutlined";
import { uiStyles } from "../../style/uiStyles";
import {
  StatCard,
  SummaryCard,
  WeeklySummaryCard,
} from "../../components/cards/StatCard";
import QuickActionCard from "../../components/cards/QuickActionCard";

const StaffDashboard = () => {
  const [stats, setStats] = useState(null);
  console.log("StaffDashboard stats:", stats); 
  const [weeklyStats, setWeeklyStats] = useState([]); 
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

useEffect(() => {
  const fetchStats = async () => {
    try {
      const [statsRes, weeklyRes] = await Promise.all([
        api.get("/stats"),
        api.get("/stats/weekly"),
      ]);
      setStats(statsRes.data);
      setWeeklyStats(weeklyRes.data.weeklyStats); 
      console.log("Weekly Stats:", weeklyRes.data.weeklyStats);
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
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

  // const weekSummaryStats = [
  //   { weekDay: "Monday", Delivery: 0, Pickup: 0, Drop: 0, Round: 0 },
  //   { weekDay: "Tuesday", Delivery: 0, Pickup: 0, Drop: 0, Round: 0 },
  //   { weekDay: "Wednesday", Delivery: 0, Pickup: 0, Drop: 0, Round: 0 },
  //   { weekDay: "Thursday", Delivery: 0, Pickup: 0, Drop: 0, Round: 0 },
  //   { weekDay: "Friday", Delivery: 0, Pickup: 0, Drop: 0, Round: 0 },
  //   { weekDay: "Saturday", Delivery: 0, Pickup: 0, Drop: 0, Round: 0 },
  //   { weekDay: "Sunday", Delivery: 0, Pickup: 0, Drop: 0, Round: 0 },
  // ];

  const transportStatus = [
    "LOAD_PLANNER",
    "NEW_LOAD",
    "ASSIGNED",
    "PICKED_UP",
    "IN_TRANSIT",
    "REACHED_DESTINATION",
    "DELIVERED",
    "TERMINATED",
    "PAPERWORK_PENDING",
    "INVOICED",
    "STREET_TURN",
    "EMPTY_IN_YARD",
    "LOADED_IN_YARD",
    "DRIVER_ON_WAITING",
    "DROP_IN_WAREHOUSE",
  ];

  // All 48 load summary stats
  const loadSummaryStats = [
    {
      label: "Load Planner",
      value: stats?.loadPlanner || 0,
      color: "blue",
      onClick: () => navigate("/staff/loads?transportStatus=LOAD_PLANNER"),
    },
    {
      label: "New",
      value: stats?.newLoads || 0,
      color: "blue",
      onClick: () => navigate("/staff/loads?transportStatus=NEW_LOAD"),
    },
    {
      label: "Assigned",
      value: stats?.assignedLoads || 0,
      color: "indigo",
      onClick: () => navigate("/staff/loads?transportStatus=ASSIGNED"),
    },
    {
      label: "Picked Up",
      value: stats?.pickedupLoads || 0,
      color: "indigo",
      onClick: () => navigate("/staff/loads?transportStatus=PICKED_UP"),
    },
    {
      label: "En-route",
      value: stats?.enrouteLoads || 0,
      color: "blue",
      onClick: () => navigate("/staff/loads?transportStatus=IN_TRANSIT"),
    },
    {
      label: "Reached Destination",
      value: stats?.reachedDestinationLoads || 0,
      onClick: () => navigate("/staff/loads?transportStatus=REACHED_DESTINATION"),
      color: "green",
    },
    {
      label: "Driver on Waiting",
      value: stats?.driverWaiting || 0,
      color: "yellow",
    },
    {
      label: "Drop in Warehouse",
      value: stats?.dropWarehouse || 0,
      color: "gray",
    },
    { label: "Loaded in Yard", value: stats?.loadedYard || 0, color: "gray" },
    { label: "Empty in Yard", value: stats?.emptyYard || 0, color: "gray" },
    {
      label: "Delivered",
      value: stats?.deliveredLoads || 0,
      color: "green",
      onClick: () => navigate("/staff/loads?transportStatus=DELIVERED"),
    },
    { label: "Terminated", value: stats?.terminatedLoads || 0, color: "red" },
    {
      label: "Paperwork Pending",
      value: stats?.paperworkPending || 0,
      color: "yellow",
    },
    {
      label: "Street Turn",
      value: stats?.streetTurn || 0,
      color: "orange",
      onClick: () => navigate("/staff/loads?status=street-turn"),
    },
    {
      label: "Invoiceable",
      value: stats?.invoiceableLoads || 0,
      color: "purple",
    },
    {
      label: "Same Day Loads",
      value: stats?.sameDayLoads || 0,
      color: "orange",
    },
    { label: "Next Day Loads", value: stats?.nextDayLoads || 0, color: "blue" },
    {
      label: "Accessorial Charges",
      value: stats?.accessorialLoads || 0,
      color: "yellow",
    },
    {
      label: "Today's LFD Loads",
      value: stats?.todayLfdLoads || 0,
      color: "red",
    },
    {
      label: "LFD Expired Loads",
      value: stats?.lfdExpiredLoads || 0,
      color: "red",
      onClick: () => navigate("/staff/loads?status=lfd-expired"),
    },
    {
      label: "Pending Verification",
      value: stats?.pendingLoads || 0,
      color: "yellow",
      onClick: () => navigate("/staff/pending-loads"),
    },
    {
      label: "Verified Loads",
      value: stats?.verifiedLoads || 0,
      color: "green",
      onClick: () => navigate("/staff/verified-loads"),
    },
    {
      label: "Requires Changes",
      value: stats?.requiresChanges || 0,
      color: "red",
    },
    {
      label: "Upcoming Bidding",
      value: stats?.upcomingBidding || 0,
      color: "orange",
      onClick: () => navigate("/staff/verified-loads"),
    },
    {
      label: "Active Bidding",
      value: stats?.activeBidding || 0,
      color: "purple",
      onClick: () => navigate("/staff/bidding-loads"),
    },
  ];

  return (
  
  <div className={uiStyles.page}>
    {/* Header */}
    <div className={uiStyles.flexBetween}>
      <div>
        <h1 className="page-title">Staff Dashboard</h1>
        <p className="page-subtitle">
          Manage customers, fleet owners, and transport orders.
        </p>
      </div>
    </div>

    {/* Main Stat Cards */}
    <div className={uiStyles.grid4}>
      <StatCard
        title="Total Customers"
        value={stats?.totalCustomers || 0}
        icon={<People fontSize="large" />}
        color="blue"
        onClick={() => navigate("/staff/customers")}
      />
      <StatCard
        title="Fleet Owners"
        value={stats?.totalFleetOwners || 0}
        icon={<DirectionsCar fontSize="large" />}
        color="green"
        onClick={() => navigate("/staff/fleet-owners")}
      />
      <StatCard
        title="Total Loads"
        value={stats?.totalLoads || 0}
        icon={<LocalShipping fontSize="large" />}
        color="yellow"
      />
      <StatCard
        title="Active Bidding"
        value={stats?.activeBidding || 0}
        icon={<Gavel fontSize="large" />}
        color="purple"
        onClick={() => navigate("/staff/bidding-loads")}
      />
    </div>

    <div className="flex flex-col lg:flex-row lg:items-stretch gap-4">
      {/* Loads Summary */}
      <div className={`${uiStyles.card} flex-1`}>
        <div className={uiStyles.flexBetween}>
          <h2 className="h4 mb-4 text-gray-500">Loads Summary</h2>
          <button className="link" onClick={()=>navigate("/staff/loads?transportStatus=All")}>View All</button>
          </div>

        <div className={uiStyles.grid4}>
          {[0, 1, 2, 3].map((col) => (
            <SummaryCard
              key={col}
              stats={loadSummaryStats.filter((_, i) => i % 4 === col)}
            />
          ))}
        </div>

        <div className={uiStyles.weekleyGrid}>
          {weeklyStats.map((col) => (
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
              label: "Create Customer",
              icon: <PersonAdd fontSize="large" />,
              path: "/staff/create-customer",
              color: "green",
            },
            {
              label: "Add Fleet Owner",
              icon: <DirectionsCar fontSize="large" />,
              path: "/staff/create-fleet-owner",
              color: "blue",
            },
            {
              label: "Create Load",
              icon: <Add fontSize="large" />,
              path: "/staff/create-load",
              color: "indigo",
            },
            {
              label: "Review Pending",
              icon: <PendingActions fontSize="large" />,
              path: "/staff/pending-loads",
              color: "yellow",
            },
            {
              label: "Email Settings",
              icon: <Settings fontSize="large" />,
              path: "/staff/email-config",
              color: "gray",
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
      {/* Pending */}
      <div className={uiStyles.card}>
        <div className={uiStyles.cardHeader}>
          <h2 className="h4 text-gray-500">Pending Verification</h2>
          {stats?.recentPendingLoads?.length > 4 &&(<button
            onClick={() => navigate("/staff/pending-loads")}
            className="link"
          >
            View All
          </button>)}
        </div>

        <div className="space-y-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
          {stats?.recentPendingLoads?.length > 0 ? (
            stats.recentPendingLoads.slice(0, 4).map((load) => (
              <div key={load.loadId} className={uiStyles.listItem}>
                <div>
                  <p className="text-sm font-medium">{load.loadId}</p>
                  <p className="text-muted-md">
                    {load.pickup?.city} → {load.drop?.city}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">${load.amount}</p>
                  <p className="text-muted">{load.customer}</p>
                </div>
              </div>
            ))
          ) : (
            <p className="text-muted text-lg p-3 bg-gray-50 rounded-lg text-center">
              No Pending Loads
            </p>
          )}
        </div>
      </div>

      {/* Active Bidding */}
      <div className={uiStyles.card}>
        <div className={uiStyles.cardHeader}>
          <h2 className="h4 text-gray-500">Active Bidding</h2>
          {stats?.recentActiveBidding?.length > 0 && (<button
            onClick={() => navigate("/staff/bidding-loads")}
            className="link"
          >
            View All
          </button>)}
        </div>

        <div className="space-y-3">
          {stats?.recentActiveBidding?.length > 0 ? (
            stats.recentActiveBidding.slice(0,4).map((load) => (
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
                    Ends in: {formatTimeRemaining(load.bidEndTime)}
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

    // <div className="space-y-6">
    //   {/* Header */}
    //   <div className="flex items-center justify-between">
    //     <div>
    //       <h1 className="page-title">Staff Dashboard</h1>
    //       <p className="page-subtitle">
    //         Manage customers, fleet owners, and transport orders.
    //       </p>
    //     </div>
    //     {/* <div className="flex gap-2">
    //       <button
    //         type="button"
    //         className={`btn-primary ${loading ? "btn-disabled" : ""}`}
    //         onClick={() => navigate("/staff/create-customer")}
    //         disabled={loading}
    //       >
    //         <PersonAdd fontSize="small" /> Add Customer
    //       </button>
    //       <button
    //         type="button"
    //         className={`btn-primary ${loading ? "btn-disabled" : ""}`}
    //         onClick={() => navigate("/staff/create-fleet-owner")}
    //         disabled={loading}
    //       >
    //         <DirectionsCar fontSize="small" /> Add Fleet Owner
    //       </button>
    //       <button
    //         type="button"
    //         className={`btn-primary ${loading ? "btn-disabled" : ""}`}
    //         onClick={() => navigate("/staff/create-load")}
    //         disabled={loading}
    //       >
    //         <AddBoxOutlinedIcon fontSize="small" /> Add New Load
    //       </button>
    //     </div> */}
    //   </div>

    //   {/* Main Stat Cards */}
    //   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
    //     <StatCard
    //       title="Total Customers"
    //       value={stats?.totalCustomers || 0}
    //       icon={<People fontSize="large" />}
    //       color="blue"
    //       onClick={() => navigate("/staff/customers")}
    //     />
    //     <StatCard
    //       title="Fleet Owners"
    //       value={stats?.totalFleetOwners || 0}
    //       icon={<DirectionsCar fontSize="large" />}
    //       color="green"
    //       onClick={() => navigate("/staff/fleet-owners")}
    //     />
    //     <StatCard
    //       title="Total Loads"
    //       value={stats?.totalLoads || 0}
    //       icon={<LocalShipping fontSize="large" />}
    //       color="yellow"
    //     />
    //     <StatCard
    //       title="Active Bidding"
    //       value={stats?.activeBidding || 0}
    //       icon={<Gavel fontSize="large" />}
    //       color="purple"
    //       onClick={() => navigate("/staff/bidding-loads")}
    //     />
    //   </div>

    //   <div className="flex flex-col lg:flex-row lg:items-stretch gap-4">
    //     {/* Loads Summary */}
    //     <div className="bg-white rounded-xl shadow-sm p-6 flex-1 ">
    //       <h2 className="h4 mb-4 text-gray-500">Loads Summary</h2>
    //       <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
    //         {[0, 1, 2, 3].map((col) => (
    //           <SummaryCard
    //             key={col}
    //             stats={loadSummaryStats.filter((_, i) => i % 4 === col)}
    //           />
    //         ))}

    //         {/* {loadSummaryStats.map(({ label, value, color, onClick }) => (
    //     <SummaryCard key={label} label={label} value={value} color={color} onClick={onClick} />
    //   ))} */}
    //       </div>
    //       <div className="grid grid-cols-2 md:grid-cols-7 gap-3 mt-3">
    //         {weekSummaryStats.map((col) => (
    //           <WeeklySummaryCard key={col} stats={col} />
    //         ))}
    //       </div>
    //     </div>

    //     {/* Quick Actions */}
    //     <div className="bg-white rounded-xl shadow-sm p-6 lg:w-64 shrink-0">
    //       <h2 className="h4 mb-4 text-gray-500">Quick Actions</h2>
    //       <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
    //         {[
    //           {
    //             label: "Create Customer",
    //             icon: <PersonAdd fontSize="large" />,
    //             path: "/staff/create-customer",
    //             color: "green",
    //           },
    //           {
    //             label: "Add Fleet Owner",
    //             icon: <DirectionsCar fontSize="large" />,
    //             path: "/staff/create-fleet-owner",
    //             color: "blue",
    //           },
    //           {
    //             label: "Create Load",
    //             icon: <Add fontSize="large" />,
    //             path: "/staff/create-load",
    //             color: "indigo",
    //           },
    //           {
    //             label: "Review Pending",
    //             icon: <PendingActions fontSize="large" />,
    //             path: "/staff/pending-loads",
    //             color: "yellow",
    //           },
    //           {
    //             label: "Email Settings",
    //             icon: <Settings fontSize="large" />,
    //             path: "/staff/email-config",
    //             color: "gray",
    //           },
    //         ].map(({ label, icon, path, color }) => (
    //           <QuickActionCard
    //             key={path}
    //             label={label}
    //             icon={icon}
    //             color={color}
    //             onClick={() => navigate(path)}
    //           />
    //         ))}
    //       </div>
    //     </div>
    //   </div>
    //   {/* Recent Lists */}
    //   <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
    //     <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
    //       <div className="flex items-center justify-between mb-4">
    //         <h2 className="h4 mb-4 text-gray-500">Pending Verification</h2>
    //         <button
    //           onClick={() => navigate("/staff/pending-loads")}
    //           className="link"
    //         >
    //           View All
    //         </button>
    //       </div>
    //       <div className="space-y-3 gap-3 grid  grid-cols-1 lg:grid-cols-3">
    //         {stats?.recentPendingLoads?.length > 0 ? (
    //           stats.recentPendingLoads.map((load) => (
    //             <div
    //               key={load.loadId}
    //               className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
    //             >
    //               <div>
    //                 <p className="text-sm font-medium">{load.loadId}</p>
    //                 <p className="text-muted-md">
    //                   {load.pickup?.city} → {load.drop?.city}
    //                 </p>
    //               </div>
    //               <div className="text-right">
    //                 <p className="text-sm font-medium">${load.amount}</p>
    //                 <p className="text-muted">{load.customer}</p>
    //               </div>
    //             </div>
    //           ))
    //         ) : (
    //           <p className="text-muted text-lg p-3 bg-gray-50 rounded-lg text-center">
    //             {" "}
    //             No Pending Loads{" "}
    //           </p>
    //         )}
    //       </div>
    //     </div>

    //     <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
    //       <div className="flex items-center justify-between mb-4">
    //         <h2 className="h4 mb-4 text-gray-500">Active Bidding</h2>
    //         <button
    //           onClick={() => navigate("/staff/bidding-loads")}
    //           className="link"
    //         >
    //           View All
    //         </button>
    //       </div>
    //       <div className="space-y-3">
    //         {stats?.recentActiveBidding?.length > 0 ? (
    //           stats.recentActiveBidding.map((load) => (
    //             <div
    //               key={load.loadId}
    //               className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
    //             >
    //               <div>
    //                 <p className="text-sm font-medium">{load.loadId}</p>
    //                 <p className="text-muted-md">
    //                   {load.pickup?.city} → {load.drop?.city}
    //                 </p>
    //               </div>
    //               <div className="text-right">
    //                 <p className="text-sm font-medium text-purple-600">
    //                   {load.bids?.length || 0} bids
    //                 </p>
    //                 <p className="text-xs text-orange-600">
    //                   Ends in: {formatTimeRemaining(load.bidEndTime)}
    //                 </p>
    //               </div>
    //             </div>
    //           ))
    //         ) : (
    //           <p className="text-muted text-lg p-3 bg-gray-50 rounded-lg text-center">
    //             {" "}
    //             No Active Bids{" "}
    //           </p>
    //         )}
    //       </div>
    //     </div>
    //   </div>
    // </div>
  );
};

export default StaffDashboard;
