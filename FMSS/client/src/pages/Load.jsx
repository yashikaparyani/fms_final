import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PendingLoadsTable from "./staff/PendingLoadsTable";
import VerifiedLoadsTable from "./staff/VerifiedLoadsTable";
import AssignedLoadsTable from "./staff/AssignedLoadsTable";
import LoadSearchResults from "./staff/LoadSearchResults";
import { PendingActions, CheckCircle, LocationOn, Search, Close } from "@mui/icons-material";
import api from "../api";
import { notify } from "../utils/swal";

const TABS = [
 
  { key: "pending", label: "Pending", icon: <PendingActions fontSize="small" /> },
  { key: "verified", label: "Dispatch Management", icon: <CheckCircle fontSize="small" /> },
 { key: "assigned", label: "All Transit", icon: <LocationOn fontSize="small" /> },];

const Load = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "pending";

  // `q` is the *committed* term, only written when the user submits. The input
  // box has its own state so typing does not fire a request per keystroke.
  const term = searchParams.get("q") || "";
  const [input, setInput] = useState(term);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Keep the box in step with the URL (back/forward, or a shared link).
  useEffect(() => {
    setInput(term);
  }, [term]);

  useEffect(() => {
    if (!term) {
      setResults([]);
      return;
    }

    let cancelled = false;
    setSearching(true);

    api
      .get("/loads", { params: { q: term } })
      .then((res) => {
        if (!cancelled) setResults(res.data);
      })
      .catch(() => {
        if (!cancelled) {
          setResults([]);
          notify.error("Search failed. Please try again.");
        }
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });

    // A term typed over an in-flight request must not be overwritten by it.
    return () => {
      cancelled = true;
    };
  }, [term]);

  const handleTabChange = (tabKey) => {
    // Choosing a tab leaves the search behind.
    setSearchParams({ tab: tabKey });
  };

  const submitSearch = (e) => {
    e?.preventDefault();
    const next = input.trim();
    if (!next) {
      clearSearch();
      return;
    }
    setSearchParams({ tab: activeTab, q: next });
  };

  const clearSearch = () => {
    setInput("");
    setSearchParams({ tab: activeTab });
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
            {term
              ? "Searching across Pending, Dispatch Management and All Transit."
              : (
                <>
                  {activeTabMeta?.key === "pending" &&
                    "Review and verify incoming loads before scheduling."}
                  {activeTabMeta?.key === "verified" &&
                    "Loads cleared for bidding — schedule or monitor here."}
                  {activeTabMeta?.key === "assigned" &&
                    "Loads assigned to carriers — manage or reassign here."}
                </>
              )}
          </p>
        </div>

        {/* Cross-tab load search */}
        <form onSubmit={submitSearch} className="flex items-stretch gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search load ID, container, ref, city, customer…"
              aria-label="Search loads"
              className="w-full sm:w-80 pl-3 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            {input && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
              >
                <Close fontSize="small" />
              </button>
            )}
          </div>
          <button type="submit" className="btn-primary flex items-center gap-1 whitespace-nowrap">
            <Search fontSize="small" />
            Search
          </button>
        </form>
      </div>

      {/* Card */}
      <div className="bg-white overflow-hidden">

        {/* Tabs */}
        <div className="border-b border-gray-300 bg-gray-50">
          <div className="flex gap-1 pt-2">
            {TABS.map((tab) => {
              // While a search is showing, no tab owns the content below.
              const isActive = !term && activeTab === tab.key;

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
          {term ? (
            <LoadSearchResults
              term={term}
              results={results}
              loading={searching}
              onClear={clearSearch}
            />
          ) : (
            renderTab()
          )}
        </div>
      </div>
    </div>
  );
};

export default Load;