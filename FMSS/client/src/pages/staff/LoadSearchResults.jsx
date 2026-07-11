import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import LoadTable from "../../components/LoadTable";
import MobileCard from "../../components/MobileCard";
import { dropDateOf, pickupDateOf } from "../../utils/loadUrgency";

const { LoadIdCell, CustomerCell, AddressCell, DateCell } = LoadTable;

const fmtDate = (v) =>
  v ? new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;

// Which tab a result would normally live under, so a mixed list stays legible.
const TAB_OF_STATUS = {
  PENDING_VERIFICATION: { key: "pending",  label: "Pending",             className: "bg-amber-100 text-amber-800" },
  VERIFIED:             { key: "verified", label: "Dispatch Management", className: "bg-green-100 text-green-800" },
  ASSIGNED:             { key: "assigned", label: "All Transit",         className: "bg-blue-100 text-blue-800" },
};

const TAB_ROW_COLOR = {
  pending:  { bg: "#fffbeb", border: "#f59e0b" },
  verified: { bg: "#edf9ee", border: "#22c55e" },
  assigned: { bg: "#eff6ff", border: "#3b82f6" },
};

const tabOf = (row) => TAB_OF_STATUS[row.status] || null;

const TabBadge = ({ row }) => {
  const tab = tabOf(row);
  if (!tab) return <span className="text-gray-400 text-xs">—</span>;
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${tab.className}`}>
      {tab.label}
    </span>
  );
};

/**
 * Flat, cross-tab result list for a load search. Rows keep the tint of the tab
 * they belong to, so a mixed list still reads as three groups at a glance.
 */
const LoadSearchResults = ({ term, results, loading, onClear }) => {
  const navigate = useNavigate();
  const role = useSelector((state) => state.auth.user?.role);

  // Group counts give the "3 tabs mixed" result an at-a-glance breakdown.
  const counts = results.reduce((acc, row) => {
    const tab = tabOf(row);
    if (tab) acc[tab.key] = (acc[tab.key] || 0) + 1;
    return acc;
  }, {});

  const rows = results.map((row) => ({ ...row, tabKey: tabOf(row)?.key }));

  const columns = [
    { key: "load",        header: "Load",         width: "11%", render: (row) => <LoadIdCell load={row} /> },
    { key: "tab",         header: "Found In",     width: "10%", render: (row) => <TabBadge row={row} /> },
    { key: "customer",    header: "Customer",     width: "12%", render: (row) => <CustomerCell load={row} /> },
    { key: "origin",      header: "Origin",       width: "15%", render: (row) => <AddressCell data={row.pickup} /> },
    { key: "pickupDate",  header: "Pickup Date",  width: "9%",  render: (row) => <DateCell value={pickupDateOf(row)} showExpiry /> },
    { key: "destination", header: "Destination",  width: "15%", render: (row) => <AddressCell data={row.drop} /> },
    { key: "deliveryDate",header: "Delivery Date",width: "9%",  render: (row) => <DateCell value={dropDateOf(row)} /> },
    { key: "truckType",   header: "Truck Type",   width: "8%",  render: (row) => <span className="text-xs text-gray-700">{row.truckType || "—"}</span> },
    { key: "refNo",       header: "Ref No",       width: "7%",  render: (row) => <span className="text-xs text-gray-700">{row.refNo || "—"}</span> },
    { key: "lastFreeDate",header: "Last Free Date",width: "9%", render: (row) => <DateCell value={row.lastFreeDate} showExpiry /> },
  ];

  const actions = (row) => (
    <button
      onClick={() => navigate(`/${role}/track-load/${row.loadId}`)}
      className="px-3 py-1 text-xs font-semibold whitespace-nowrap text-white bg-indigo-600 hover:bg-indigo-700 rounded transition"
    >
      View
    </button>
  );

  return (
    <div className="p-4 md:p-5">
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            {loading ? "Searching…" : `${results.length} result${results.length === 1 ? "" : "s"}`}
            {!loading && <span className="font-normal text-gray-500"> for “{term}”</span>}
          </h2>
          {!loading && results.length > 0 && (
            <p className="text-sm text-gray-500">
              {["pending", "verified", "assigned"]
                .filter((k) => counts[k])
                .map((k) => {
                  const label = Object.values(TAB_OF_STATUS).find((t) => t.key === k).label;
                  return `${counts[k]} in ${label}`;
                })
                .join(" · ")}
            </p>
          )}
        </div>
        <button onClick={onClear} className="btn-secondary self-start sm:self-auto whitespace-nowrap">
          ✕ Clear search
        </button>
      </div>

      {/* 📱 Mobile */}
      <div className="block xl:hidden space-y-3">
        {loading ? (
          <p className="text-center text-gray-500 py-10">Searching…</p>
        ) : rows.length > 0 ? (
          rows.map((row) => (
            <MobileCard
              key={row.loadId}
              colorStyle={{
                ...(TAB_ROW_COLOR[row.tabKey] || { bg: "#ffffff", border: "#e5e7eb" }),
                badge: { bg: "#e0e7ff", text: "#3730a3" },
              }}
              title={row.loadId}
              subtitle={row.customerName || "—"}
              badge={{ label: tabOf(row)?.label || "—" }}
              locations={[
                { label: "Origin",      data: row.pickup },
                { label: "Destination", data: row.drop },
              ]}
              fields={[
                { label: "Pickup Date",   value: fmtDate(pickupDateOf(row)) },
                { label: "Delivery Date", value: fmtDate(dropDateOf(row)) },
                { label: "Truck Type",    value: row.truckType },
                { label: "Ref No",        value: row.refNo },
                { label: "Container #",   value: row.containerNo },
                { label: "Last Free Date",value: fmtDate(row.lastFreeDate) },
              ]}
              actions={[
                { label: "View", color: "#4f46e5", onClick: () => navigate(`/${role}/track-load/${row.loadId}`) },
              ]}
            />
          ))
        ) : (
          <p className="text-center text-gray-500 py-10">No loads match “{term}”.</p>
        )}
      </div>

      {/* 💻 Desktop */}
      <div className="hidden xl:block">
        <LoadTable
          loads={rows}
          columns={columns}
          actions={actions}
          colorBy="tabKey"
          colorMap={TAB_ROW_COLOR}
          loading={loading}
          emptyMessage={`No loads match “${term}”.`}
        />
      </div>
    </div>
  );
};

export default LoadSearchResults;
