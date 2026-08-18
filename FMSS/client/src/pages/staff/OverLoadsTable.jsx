import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api";
import LoadTable from "../../components/LoadTable";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import {
  dropDateOf,
  pickupDateOf,
  sortByPickupDate,
} from "../../utils/loadUrgency";

const { LoadIdCell, CustomerCell, AddressCell, DateCell, fmtDate } = LoadTable;

// ─── Over ─────────────────────────────────────────────────────────────────────
// Loads whose journey has ended: delivered, terminated, street-turned, or sat
// down empty in the yard. They leave All Transit on reaching one of those
// statuses and land here, so the transit tab stays a list of work still moving.
//
// Which statuses count is decided by the server (`?completed=true` — see
// COMPLETED_TRANSPORT_STATUSES in loadController). Repeating the list here would
// mean a load could fall out of All Transit without turning up in this tab.
//
// Read-only on purpose. Reopening a finished load is a status change, and that
// belongs on the transit tab where the status control already lives.
// ─────────────────────────────────────────────────────────────────────────────

// Muted throughout — this is the archive, not the work. Terminated is the one
// outcome that reads as a problem rather than a completion, so it keeps a tint.
const OUTCOME_COLORS = {
  DELIVERED:     { bg: "#f0fdf4", border: "#86efac" },
  STREET_TURN:   { bg: "#eef2ff", border: "#c7d2fe" },
  EMPTY_IN_YARD: { bg: "#f8fafc", border: "#cbd5e1" },
  TERMINATED:    { bg: "#fef2f2", border: "#fecaca" },
};

const OUTCOME_BADGES = {
  DELIVERED:     { bg: "#dcfce7", text: "#166534" },
  STREET_TURN:   { bg: "#e0e7ff", text: "#3730a3" },
  EMPTY_IN_YARD: { bg: "#e2e8f0", text: "#334155" },
  TERMINATED:    { bg: "#fee2e2", text: "#991b1b" },
};

const labelize = (value) =>
  value ? value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—";

const OutcomeBadge = ({ value }) => {
  const colors = OUTCOME_BADGES[value] || { bg: "#f3f4f6", text: "#374151" };
  return (
    <span
      className="inline-block whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {labelize(value)}
    </span>
  );
};

const carrierNameOf = (row) =>
  row.assignment?.fleetOwnerName || row.fleetOwnerName || null;

const OverLoadsTable = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [outcome, setOutcome] = useState("");

  const fetchLoads = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get("/loads", { params: { completed: true } });
      setRows(res.data);
    } catch (err) {
      console.error("Failed to fetch completed loads:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchLoads();
  }, []);

  useAutoRefresh(() => fetchLoads({ silent: true }));

  // Same pickup-date order as the other three tabs, so a load does not change
  // its reading order the moment it finishes.
  const sortedRows = useMemo(
    () =>
      sortByPickupDate(
        outcome ? rows.filter((r) => r.transportStatus === outcome) : rows,
      ),
    [rows, outcome],
  );

  const counts = useMemo(() => {
    const tally = {};
    rows.forEach((row) => {
      tally[row.transportStatus] = (tally[row.transportStatus] || 0) + 1;
    });
    return tally;
  }, [rows]);

  const trackLoad = (row) => {
    const role = JSON.parse(localStorage.getItem("user") || "{}")?.role || "staff";
    navigate(`/${role}/track-load/${row.loadId}`);
  };

  const columns = [
    { key: "load",         header: "Load",          width: "130px", render: (row) => <LoadIdCell load={row} /> },
    { key: "customer",     header: "Customer",      width: "150px", render: (row) => <CustomerCell load={row} /> },
    { key: "origin",       header: "Origin",                        render: (row) => <AddressCell data={row.pickup} /> },
    { key: "destination",  header: "Destination",                   render: (row) => <AddressCell data={row.drop} /> },
    { key: "pickupDate",   header: "Pickup Date",   width: "110px", render: (row) => <DateCell value={pickupDateOf(row)} /> },
    { key: "deliveryDate", header: "Delivery Date", width: "110px", render: (row) => <DateCell value={dropDateOf(row)} /> },
    {
      key: "carrier",
      header: "Carrier",
      width: "160px",
      render: (row) => (
        <span className="text-xs text-gray-700">{carrierNameOf(row) || "—"}</span>
      ),
    },
    {
      key: "outcome",
      header: "Outcome",
      width: "130px",
      render: (row) => <OutcomeBadge value={row.transportStatus} />,
    },
  ];

  const actions = (row) => (
    <button onClick={() => trackLoad(row)} className="btn-secondary whitespace-nowrap py-1">
      View documents
    </button>
  );

  const filters = [
    { key: "", label: "All" },
    { key: "DELIVERED", label: "Delivered" },
    { key: "TERMINATED", label: "Terminated" },
    { key: "STREET_TURN", label: "Street Turn" },
    { key: "EMPTY_IN_YARD", label: "Empty In Yard" },
  ];

  return (
    <div className="p-4 md:p-5">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-900">Over</h2>
        <p className="text-sm text-gray-500">
          Finished loads — delivered, terminated, street-turned or empty in yard,
          earliest pickup first
        </p>
      </div>

      {/* Outcome filter — the four ways a load ends are read separately as often
          as they are read together. */}
      <div className="flex flex-wrap gap-2 mb-4">
        {filters.map((f) => {
          const active = outcome === f.key;
          const count = f.key ? counts[f.key] || 0 : rows.length;

          return (
            <button
              key={f.key || "all"}
              onClick={() => setOutcome(f.key)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "bg-indigo-600 border-indigo-600 text-white"
                  : "bg-white border-gray-200 text-gray-600 hover:border-indigo-300"
              }`}
            >
              {f.label}
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  active ? "bg-white/25" : "bg-gray-100 text-gray-600"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 📱 Mobile */}
      <div className="block xl:hidden space-y-3">
        {loading ? (
          <p className="text-center text-gray-500 py-10">Loading...</p>
        ) : sortedRows.length > 0 ? (
          sortedRows.map((row) => {
            const tint = OUTCOME_COLORS[row.transportStatus] || {
              bg: "#ffffff",
              border: "#e5e7eb",
            };

            return (
              <div
                key={row.loadId}
                className="rounded-xl p-3.5"
                style={{
                  backgroundColor: tint.bg,
                  border: `1px solid ${tint.border}`,
                  borderLeft: `4px solid ${tint.border}`,
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <button
                      onClick={() => trackLoad(row)}
                      className="text-sm font-bold text-indigo-700"
                    >
                      {row.loadId}
                    </button>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {row.customerName || "—"}
                    </p>
                  </div>
                  <OutcomeBadge value={row.transportStatus} />
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  {[
                    ["Origin", [row.pickup?.city, row.pickup?.state].filter(Boolean).join(", ")],
                    ["Destination", [row.drop?.city, row.drop?.state].filter(Boolean).join(", ")],
                    ["Pickup Date", fmtDate(pickupDateOf(row))],
                    ["Delivery Date", fmtDate(dropDateOf(row))],
                    ["Container #", row.containerNo],
                    ["Carrier", carrierNameOf(row)],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="uppercase tracking-wide text-gray-400">{label}</dt>
                      <dd className="font-medium text-gray-900">{value || "—"}</dd>
                    </div>
                  ))}
                </dl>

                <button
                  onClick={() => trackLoad(row)}
                  className="btn-secondary w-full mt-3 py-1.5"
                >
                  View documents
                </button>
              </div>
            );
          })
        ) : (
          <p className="text-center text-gray-500 py-10">No finished loads yet.</p>
        )}
      </div>

      {/* 💻 Desktop */}
      <div className="hidden xl:block">
        <LoadTable
          loads={sortedRows}
          columns={columns}
          actions={actions}
          colorBy="transportStatus"
          colorMap={OUTCOME_COLORS}
          loading={loading}
          emptyMessage="No finished loads yet."
        />
      </div>
    </div>
  );
};

export default OverLoadsTable;
