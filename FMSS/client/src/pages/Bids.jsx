import { useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";

// Components
import LoadsWithBiddingTable from "./LoadsWithBiddingTable";
import MyBids from "./fleetOwner/MyBids";
import WonBids from "./fleetOwner/WonBids";

// Icons
import GavelIcon from "@mui/icons-material/Gavel";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import ScheduleIcon from "@mui/icons-material/Schedule";
import HistoryIcon from "@mui/icons-material/History";

const Bids = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const userRole = useSelector((state) => state.auth.user?.role);

  const activeTab = searchParams.get("tab") || "live";

  const handleTabChange = (tabKey) => {
    setSearchParams({ tab: tabKey });
  };

  // ✅ Dynamic Tabs based on role
  const TABS = [
    {
      key: "live",
      label: "Live Bids",
      icon: <GavelIcon fontSize="small" />,
    },
    ...(userRole === "staff" || userRole === "admin"
      ? [
          {
            key: "upcoming",
            label: "Upcoming",
            icon: <ScheduleIcon fontSize="small" />,
          },
          {
            key: "expired",
            label: "Expired",
            icon: <HistoryIcon fontSize="small" />,
          },
        ]
      : []),
    ...(userRole === "fleetOwner"
      ? [
          {
            key: "myBids",
            label: "My Bids",
            icon: <LocalOfferIcon fontSize="small" />,
          },
          {
            key: "won",
            label: "Won Bids",
            icon: <EmojiEventsIcon fontSize="small" />,
          },
        ]
      : []),
  ];

  // ✅ Render tab content
  const renderTab = () => {
    switch (activeTab) {
      case "live":
        return <LoadsWithBiddingTable bidStatus="OPEN" />;
      case "upcoming":
        return <LoadsWithBiddingTable bidStatus="UPCOMING" />;
      case "expired":
        return <LoadsWithBiddingTable bidStatus="CLOSED" />;
      case "myBids":
        return <MyBids userRole={userRole} />;
      case "won":
        return <WonBids userRole={userRole} />;
      default:
        return <LoadsWithBiddingTable bidStatus="OPEN" />;
    }
  };

  const activeTabMeta = TABS.find((t) => t.key === activeTab);

  return (
    <div className="px-0 md:px-5 lg:px-0 lg:py-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-3">
        <div>
          <h1 className="text-lg sm:text-2xl font-semibold">
            Bidding Management
          </h1>

          <p className="text-xs md:text-sm text-gray-500 mt-1">
            {activeTabMeta?.key === "live"     && "Browse all loads currently open for bidding."}
            {activeTabMeta?.key === "upcoming" && "Loads with bidding scheduled but not yet started."}
            {activeTabMeta?.key === "expired"  && "Loads whose bidding window has closed."}
            {activeTabMeta?.key === "myBids"   && "Track all bids you’ve placed and their results."}
            {activeTabMeta?.key === "won"      && "View loads where you won the bidding and take action."}
          </p>
        </div>
      </div>

      {/* Card */}
      <div className="bg-white overflow-hidden">

        {/* Tabs */}
        <div className="border-b border-gray-300 bg-gray-50">
          <div className="flex gap-1 pt-2">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;

              return (
                <button
                  key={tab.key}
                  onClick={() => handleTabChange(tab.key)}
                  className={`
                    flex items-center gap-1.5 whitespace-nowrap
                    px-2 sm:px-2 py-2 text-xs md:text-sm font-medium
                    rounded-t-lg border-b-2 -mb-px transition-all
                    ${
                      isActive
                        ? "bg-indigo-100 border-indigo-600 text-indigo-600"
                        : "border-transparent text-gray-500 bg-gray-200 hover:bg-indigo-50"
                    }
                  `}
                >
                  <span className="text-base">{tab.icon}</span>
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="p-0 md:p-5">
          {renderTab()}
        </div>
      </div>
    </div>
  );
};

export default Bids;