import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
// ── Status → row colour mapping ──────────────────────────────
const statusRowColor = {
  // Transport status colours
  ASSIGNED: { bg: "#fff0f0", border: "#ffcccc" }, // red-ish
  PICKED_UP: { bg: "#e8f4fd", border: "#b3d9f2" }, // sky-blue
  IN_TRANSIT: { bg: "#e8f4fd", border: "#b3d9f2" },
  REACHED_DESTINATION: { bg: "#edf9ee", border: "#b5e8b7" },
  DELIVERED: { bg: "#edf9ee", border: "#b5e8b7" }, // green
  NEW_LOAD: { bg: "#fffbeb", border: "#fde68a" }, // yellow
  LOAD_PLANNER: { bg: "#fffbeb", border: "#fde68a" },

  // Bid status colours
  OPEN: { bg: "#edf9ee", border: "#b5e8b7" },
  UPCOMING: { bg: "#fffbeb", border: "#fde68a" },
  CLOSED: { bg: "#f3f4f6", border: "#d1d5db" },

  // Load verification status
  VERIFIED: { bg: "#edf9ee", border: "#b5e8b7" },
  PENDING_VERIFICATION: { bg: "#fffbeb", border: "#fde68a" },
  REQUIRES_CHANGES: { bg: "#fff0f0", border: "#ffcccc" },
  REJECTED: { bg: "#fff0f0", border: "#ffcccc" },
  DRAFT: { bg: "#f3f4f6", border: "#d1d5db" },
};

const defaultRowColor = { bg: "#ffffff", border: "#e5e7eb" };

const getRowColor = (load, colorBy, colorMap) => {
  const val = load[colorBy];
  return (colorMap || statusRowColor)[val] || defaultRowColor;
};

// ── Formatters ───────────────────────────────────────────────
const fmtDate = (v) => {
  if (!v) return null;
  return new Date(v).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
};

const fmtDateTime = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

// Compare calendar days, not instants: a date stored at midnight would
// otherwise read as expired for the whole of the day it actually falls on.
const isExpired = (v) => {
  if (!v) return false;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return false;
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
};

// ── Address Cell ─────────────────────────────────────────────
const AddressCell = ({ data, label }) => {
  if (!data) {
    return <span className="text-gray-400 italic text-xs">Not set</span>;
  }

  if (typeof data === "string") {
    const text = data.trim();
    return text ? (
      <span className="text-xs text-gray-700">{text}</span>
    ) : (
      <span className="text-gray-400 italic text-xs">Not set</span>
    );
  }

  const company = data.company || data.companyName || "";
  const address = data.address || data.street || "";
  const city = data.city || "";
  const state = data.state || "";
  const zip = data.zip || data.zipCode || "";
  const cityLine = [city, state, zip].filter(Boolean).join(", ");

  if (!company && !address && !cityLine) {
    return <span className="text-gray-400 italic text-xs">Not set</span>;
  }

  return (
    <div className="leading-tight space-y-0.5">
      {company && <div className="font-bold text-gray-900 text-xs">{company}</div>}
      {address && <div className="text-xs text-gray-700">{address}</div>}
      {cityLine && <div className="text-xs text-gray-600">{cityLine}</div>}
    </div>
  );
};

// ── Container / Load ID cell ─────────────────────────────────
// ── Container / Load ID cell ─────────────────────────────────
const LoadIdCell = ({ load, onClick }) => {
  const navigate = useNavigate();
  const userRole = useSelector((state) => state.auth.user?.role);
 const handleClick = onClick ?? (() => navigate(`/${userRole}/track-load/${load.loadId}`));
  return (                  
    <div className="leading-tight">
      <div className="font-bold text-indigo-700 text-sm">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleClick();
          }}
          className="cursor-pointer hover:underline text-left"
        >
          {load.loadId}
        </button>
      </div>
      {load.containerNo && (
        <div className="text-blue-600 font-semibold text-xs mt-0.5">
          {load.containerNo}
        </div>
      )}
      {load.transportStatus && load.transportStatus !== "NEW_LOAD" && (
        <span
          className="inline-block mt-1 px-1.5 py-0.5 text-[10px] font-bold rounded"
          style={{
            backgroundColor:
              load.transportStatus === "DELIVERED"
                ? "#dcfce7"
                : load.transportStatus === "PICKED_UP" ||
                    load.transportStatus === "IN_TRANSIT"
                  ? "#dbeafe"
                  : "#fef3c7",
            color:
              load.transportStatus === "DELIVERED"
                ? "#166534"
                : load.transportStatus === "PICKED_UP" ||
                    load.transportStatus === "IN_TRANSIT"
                  ? "#1e40af"
                  : "#92400e",
          }}
        >
          {load.transportStatus.replace(/_/g, " ")}
        </span>
      )}
    </div>
  );  // ← closing return
};

// ── Customer Cell ────────────────────────────────────────────
const CustomerCell = ({ load }) => (
  <div className="leading-tight">
    <div className="font-semibold text-gray-900 text-sm">
      {load.customerName || "—"}
    </div>
    {(load.pickup?.city || load.pickup?.state) && (
      <div className="text-[11px] text-gray-500 mt-0.5">
        {[load.pickup?.city, load.pickup?.state].filter(Boolean).join(", ")}
      </div>
    )}
  </div>
);

// ── Date Cell ────────────────────────────────────────────────
const DateCell = ({ value, showExpiry }) => {
  if (!value) return <span className="text-gray-400">-</span>;
  const expired = showExpiry && isExpired(value);
  return (
    <div className="leading-tight">
      <span
        className={`text-xs font-semibold ${expired ? "text-red-600" : "text-gray-700"}`}
      >
        {fmtDate(value)}
      </span>
      {expired && (
        <div className="text-[10px] text-red-500 font-medium">EXPIRED</div>
      )}
    </div>
  );
};

// ── Status Badge ─────────────────────────────────────────────
const StatusBadge = ({ value, colorMap }) => {
  if (!value) return <span className="text-gray-400">-</span>;
  const colours = {
    VERIFIED: { bg: "#dcfce7", text: "#166534" },
    PENDING_VERIFICATION: { bg: "#fef3c7", text: "#92400e" },
    REQUIRES_CHANGES: { bg: "#fee2e2", text: "#991b1b" },
    REJECTED: { bg: "#fee2e2", text: "#991b1b" },
    DRAFT: { bg: "#f3f4f6", text: "#374151" },
    OPEN: { bg: "#dcfce7", text: "#166534" },
    UPCOMING: { bg: "#fef3c7", text: "#92400e" },
    CLOSED: { bg: "#e5e7eb", text: "#374151" },
    ASSIGNED: { bg: "#dbeafe", text: "#1e40af" },
    PICKED_UP: { bg: "#e0f2fe", text: "#075985" },
    IN_TRANSIT: { bg: "#e0f2fe", text: "#075985" },
    DELIVERED: { bg: "#dcfce7", text: "#166534" },
    ...colorMap,
  };
  const c = colours[value] || { bg: "#f3f4f6", text: "#374151" };
  const label = value.replace(/_/g, " ");
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-[11px]  whitespace-nowrap"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {label}
    </span>
  );
};

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
const LoadTable = ({
  loads,
  columns,
  actions,
  colorBy = "transportStatus",
  // Optional { [value]: { bg, border } } map, letting a caller tint rows by
  // something other than a status (e.g. an urgency bucket).
  colorMap,
  loading = false,
  pageSize = 10,
  emptyMessage = "No loads found.",
  headerExtra,
  title,
  subtitle,
}) => {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(pageSize);

  const totalPages = Math.ceil(loads.length / rowsPerPage);
  const paginatedLoads = loads.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage,
  );

  return (
    <div className="w-full">
      {/* Header */}
      {(title || headerExtra) && (
        <div className="flex items-center justify-between mb-4">
          <div>
            {title && (
              <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            )}
            {subtitle && (
              <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          {headerExtra}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <svg className="animate-spin h-6 w-6 mr-2" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
          Loading…
        </div>
      ) : loads.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          {emptyMessage}
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="border border-gray-300 rounded-lg overflow-x-auto bg-white shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-slate-700 to-slate-800 text-white">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap border-r border-slate-600 last:border-r-0"
                      style={
                        col.width
                          ? { width: col.width, minWidth: col.width }
                          : {}
                      }
                    >
                      {col.header}
                    </th>
                  ))}
                  {actions && (
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap border-l border-slate-600" style={{ minWidth: "140px" }}>
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {paginatedLoads.map((load, idx) => {
                  const rowColor = getRowColor(load, colorBy, colorMap);
                  return (
                    <tr
                      key={load.loadId || load._id}
                      className="border-b border-gray-200 hover:brightness-95 transition-all"
                      style={{
                        backgroundColor: rowColor.bg,
                        borderLeft: `3px solid ${rowColor.border}`,
                      }}
                    >
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className="px-3 py-2.5 align-top border-r border-gray-200 last:border-r-0"
                          style={
                            col.width
                              ? { width: col.width, minWidth: col.width }
                              : {}
                          }
                        >
                          {col.render(load)}
                        </td>
                      ))}
                      {actions && (
                        <td className="px-3 py-2.5 align-middle whitespace-nowrap border-l border-gray-200" style={{ minWidth: "140px" }}>
                          {actions(load)}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <span>Rows per page:</span>
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(Number(e.target.value));
                  setPage(0);
                }}
                className="border rounded px-2 py-1 text-sm"
              >
                {[5, 10, 20, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <span>
                {loads.length === 0
                  ? "0 of 0"
                  : `${page * rowsPerPage + 1}–${Math.min(
                      (page + 1) * rowsPerPage,
                      loads.length,
                    )} of ${loads.length}`}
              </span>
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-gray-100"
              >
                ‹
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-gray-100"
              >
                ›
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ── Export helpers for pages to use ──────────────────────────
LoadTable.LoadIdCell = LoadIdCell;
LoadTable.CustomerCell = CustomerCell;
LoadTable.AddressCell = AddressCell;
LoadTable.DateCell = DateCell;
LoadTable.StatusBadge = StatusBadge;
LoadTable.fmtDate = fmtDate;
LoadTable.fmtDateTime = fmtDateTime;

export default LoadTable;
