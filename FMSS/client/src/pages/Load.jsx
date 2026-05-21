import { useSearchParams } from "react-router-dom";
import PendingLoadsTable from "./staff/PendingLoadsTable";
import VerifiedLoadsTable from "./staff/VerifiedLoadsTable";
import AssignedLoadsTable from "./staff/AssignedLoadsTable";
import { PendingActions, CheckCircle, LocationOn } from "@mui/icons-material";

const TABS = [
 
  { key: "pending", label: "Pending", icon: <PendingActions fontSize="small" /> },
  { key: "verified", label: "Verified", icon: <CheckCircle fontSize="small" /> },
 { key: "assigned", label: "Assigned", icon: <LocationOn fontSize="small" /> },];

const Load = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "pending";
 
  const handleTabChange = (tabKey) => {
    setSearchParams({ tab: tabKey });
  };

  const renderTab = () => {
    switch (activeTab) {
      case "pending":
        return <PendingLoadsTable />;
      case "verified":
        return <VerifiedLoadsTable />;
      case "assigned":
        return <AssignedLoadsTable />;
      default:
        return <PendingLoadsTable />;
    }
  };

  const activeTabMeta = TABS.find((t) => t.key === activeTab);

  return (
    <div className="px-0 md:px-5 lg:px-0 lg:py-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-3">
        <div>
          <h1 className="text-lg sm:text-2xl font-semibold">
            Load Management
          </h1>

          <p className="text-xs md:text-sm text-gray-500 mt-1">
            {activeTabMeta?.key === "pending" &&
              "Review and verify incoming loads before scheduling."}
            {activeTabMeta?.key === "verified" &&
              "Loads cleared for bidding — schedule or monitor here."}
            {activeTabMeta?.key === "assigned" &&
              "Loads assigned to carriers — manage or reassign here."}
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

export default Load;