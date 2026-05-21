// pages/ClientLoads.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import { toast } from "react-toastify";
import LoadTable from "../components/LoadTable";
import MobileCard from "../components/MobileCard";
import { useSelector } from "react-redux";

const { LoadIdCell, CustomerCell, AddressCell, DateCell, StatusBadge } =
  LoadTable;

const fmtDate = (v) =>
  v
    ? new Date(v).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

const ClientLoads = () => {
  const userRole = useSelector((state) => state.auth.user?.role);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchLoads = async () => {
      try {
        const res = await api.get("/loads");
        setRows(res.data);
      } catch {
        toast.error("Failed to fetch loads");
      } finally {
        setLoading(false);
      }
    };
    fetchLoads();
  }, []);

  // ── Desktop columns ──────────────────────────────────────────
  const columns = [
    {
      key: "load",
      header: "Load",
      width: "130px",
      render: (row) => (
        <LoadIdCell
          load={row}
          onClick={() => navigate(`/${userRole}/track-load/${row.loadId}`)}
        />
      ),
    },
    {
      key: "customer",
      header: "Customer",
      width: "150px",
      render: (row) => <CustomerCell load={row} />,
    },
    {
      key: "origin",
      header: "Origin",
      render: (row) => <AddressCell data={row.pickup} />,
    },
    {
      key: "destination",
      header: "Destination",
      render: (row) => <AddressCell data={row.drop} />,
    },
    {
      key: "truckType",
      header: "Truck Type",
      width: "110px",
      render: (row) => (
        <span className="text-xs text-gray-700">{row.truckType || "—"}</span>
      ),
    },
    {
      key: "material",
      header: "Material",
      width: "110px",
      render: (row) => (
        <span className="text-xs text-gray-700">{row.material || "—"}</span>
      ),
    },
    {
      key: "driverRequirement",
      header: "Team Required",
      width: "110px",
      render: (row) => (
        <span className="text-xs text-gray-700">{row.driverRequirement || "—"}</span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      width: "90px",
      render: (row) => (
        <span className="text-xs font-semibold text-gray-800">
          {row.amount ? `$${Number(row.amount).toLocaleString()}` : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "140px",
      render: (row) => <StatusBadge value={row.status} />,
    },
    {
      key: "changesNote",
      header: "Changes Notes",
      width: "140px",
      render: (row) => (
        <span className="text-gray-400 text-xs">{row.changesNote || "—"}</span>
      ),
    },
    {
      key: "bidStatus",
      header: "Bidding",
      width: "100px",
      render: (row) =>
        row.status === "VERIFIED" ? (
          <StatusBadge value={row.bidStatus || "N/A"} />
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        ),
    },
  ];

  const actions = (row) => (
    <div className="flex flex-col gap-1.5">
      {(row.status === "REQUIRES_CHANGES" || row.status === "DRAFT") && (
        <button
          onClick={() => navigate(`/client/edit-load/${row.loadId}`)}
          className="flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded transition"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Edit
        </button>
      )}
      <button
        onClick={() => navigate(`/${userRole}/track-load/${row.loadId}`)}
        className="flex items-center gap-1 px-3 py-1 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        View
      </button>
    </div>
  );

  const headerExtra = (
    <button
      onClick={() => navigate("/client/create-load")}
      className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition"
    >
      + New Load
    </button>
  );

  // ── Mobile badge helper ──────────────────────────────────────
  const mobileBadge = (status) => {
    const map = {
      DRAFT:              { label: "📝 Draft" },
      PENDING_VERIFICATION: { label: "⏳ Pending" },
      VERIFIED:           { label: "✓ Verified" },
      REQUIRES_CHANGES:   { label: "⚠ Changes Needed" },
    };
    return map[status] ?? { label: status };
  };

  // ── Mobile actions per row ───────────────────────────────────
  const mobileActions = (row) => {
    const acts = [];
    if (row.status === "REQUIRES_CHANGES" || row.status === "DRAFT") {
      acts.push({
        label: "✎ Edit",
        color: "#16a34a",
        onClick: () => navigate(`/client/edit-load/${row.loadId}`),
      });
    }
    acts.push({
      label: "👁 View",
      color: "#f97316",
      onClick: () => navigate(`/${userRole}/track-load/${row.loadId}`),
    });
    return acts;
  };

  return (
    <div className="p-4 md:p-6">
      {/* Changes requested banner */}
      {rows.some((r) => r.status === "REQUIRES_CHANGES") && (
        <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
          <p className="text-sm text-orange-800">
            <strong>Action Required:</strong> Some of your loads require
            changes. Please review and resubmit them.
          </p>
        </div>
      )}

      {/* Page header (mobile only — desktop header is inside LoadTable) */}
      <div className="flex items-center justify-between mb-4 xl:hidden">
        <div>
          <h2 className="text-lg font-bold text-gray-900">My Transport Orders</h2>
          <p className="text-sm text-gray-500">All your load requests</p>
        </div>
        {headerExtra}
      </div>

      {/* 📱 Mobile */}
      <div className="block xl:hidden space-y-3">
        {loading ? (
          <p className="text-center text-gray-500 py-10">Loading...</p>
        ) : rows.length > 0 ? (
          rows.map((row) => (
            <MobileCard
              key={row.loadId}
              statusKey={row.status}
              title={row.loadId}
              subtitle={row.customerName || "—"}
              badge={mobileBadge(row.status)}
              locations={[
                { label: "Origin",      data: row.pickup },
                { label: "Destination", data: row.drop },
              ]}
              fields={[
                { label: "Truck Type",    value: row.truckType },
                { label: "Material",      value: row.material },
                { label: "Amount",        value: row.amount ? `$${Number(row.amount).toLocaleString()}` : null },
                { label: "Bidding",       value: row.status === "VERIFIED" ? (row.bidStatus || "N/A") : null },
                { label: "Changes Note",  value: row.changesNote },
              ]}
              actions={mobileActions(row)}
            />
          ))
        ) : (
          <p className="text-center text-gray-500 py-10">No loads found.</p>
        )}
      </div>

      {/* 💻 Desktop */}
      <div className="hidden xl:block">
        <LoadTable
          title="My Transport Orders"
          loads={rows}
          columns={columns}
          actions={actions}
          colorBy="status"
          loading={loading}
          headerExtra={headerExtra}
          emptyMessage="No loads found."
        />
      </div>
    </div>
  );
};

export default ClientLoads;