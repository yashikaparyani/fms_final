import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api";
import LoadTable from "../../components/LoadTable";
import CarrierCell from "../../components/loads/CarrierCell";
import UpdateStatusModal from "../../components/loads/UpdateStatusModal";
import AssignCarrierPicker from "../../components/loads/AssignCarrierPicker";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { useCarrierAssignment } from "../../hooks/useCarrierAssignment";
import { carrierNameOnLoad } from "../../utils/loadCarrier";
import { isAssignedToCarrier, STATUS_LOCKED_REASON } from "../../utils/loadAssignment";
import { STATUS_BADGE_COLORS, STATUS_ROW_COLORS } from "../../utils/loadColorMode";
import { transportStatusLabel } from "../../utils/transportStatus";
import {
  dropDateOf,
  pickupDateOf,
  sortByDeliveryDate,
} from "../../utils/loadUrgency";

const { LoadIdCell, CustomerCell, AddressCell, DateCell, fmtDate } = LoadTable;

// ─── Over ─────────────────────────────────────────────────────────────────────
// Loads whose journey has ended: delivered, terminated, street-turned, sat down
// empty or loaded in the yard, or dropped at a warehouse. They leave All Transit
// on reaching one of those statuses and land here, so the transit tab stays a
// list of work still moving.
//
// Which statuses count is decided by the server (`?completed=true` — see
// COMPLETED_TRANSPORT_STATUSES in loadController). Repeating the list here would
// mean a load could fall out of All Transit without turning up in this tab; the
// sub-tabs below are only a filter over whatever arrives.
//
// Not read-only. A finished load is corrected here as often as anywhere else —
// booked against the wrong carrier with a settlement about to go out, or needing
// to be moved on to paperwork or invoicing — so it carries the same Reassign and
// Update Status controls All Transit does, built from the same components.
// ─────────────────────────────────────────────────────────────────────────────

// Which statuses get a sub-tab, in the order they are read. Every load that
// arrives is still counted under "All", so a status added to the server's
// completed set but not listed here is missing a sub-tab rather than missing
// from the screen.
const SUB_TABS = [
  "DELIVERED",
  "TERMINATED",
  "STREET_TURN",
  "EMPTY_IN_YARD",
  "LOADED_IN_YARD",
  "DROP_IN_WAREHOUSE",
];

const StatusBadge = ({ value }) => {
  const colors = STATUS_BADGE_COLORS[value] || {
    bg: "#f3f4f6",
    color: "#374151",
    border: "#e5e7eb",
  };
  return (
    <span
      className="inline-block whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-semibold"
      style={{
        backgroundColor: colors.bg,
        color: colors.color,
        border: `1px solid ${colors.border}`,
      }}
    >
      {transportStatusLabel(value)}
    </span>
  );
};

const OverLoadsTable = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fleetOwners, setFleetOwners] = useState([]);
  const [subTab, setSubTab] = useState("");
  const [openRow, setOpenRow] = useState(null); // reassign picker open on this load
  const [statusModal, setStatusModal] = useState(null);

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const isStaffOrAdmin = user?.role === "staff" || user?.role === "admin";

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

  const { saving, assign } = useCarrierAssignment(fetchLoads);

  useEffect(() => {
    fetchLoads();
    // The carrier list is what turns a carrier id into a phone number, and what
    // the reassign picker is chosen from.
    api
      .get("/fleet-owners")
      .then((res) => setFleetOwners(res.data))
      .catch((err) => console.error("Failed to fetch fleet owners:", err));
  }, []);

  // Hold the refresh while a picker or the status modal is open, so a row
  // cannot shift or vanish mid-action.
  useAutoRefresh(() => fetchLoads({ silent: true }), {
    enabled: !openRow && !saving && !statusModal,
  });

  // Same delivery-date order as the other three tabs, so a load does not change
  // its reading order the moment it finishes.
  const sortedRows = useMemo(
    () =>
      sortByDeliveryDate(
        subTab ? rows.filter((r) => r.transportStatus === subTab) : rows,
      ),
    [rows, subTab],
  );

  const counts = useMemo(() => {
    const tally = {};
    rows.forEach((row) => {
      tally[row.transportStatus] = (tally[row.transportStatus] || 0) + 1;
    });
    return tally;
  }, [rows]);

  const handleAssign = async (loadId, ownerId, owners) => {
    const done = await assign(loadId, ownerId, owners);
    if (done) setOpenRow(null);
  };

  // Opening a finished load is how its paperwork is read. The desktop table
  // gets this from LoadIdCell; the mobile card has to say it itself.
  const openLoad = (row) =>
    navigate(`/${user?.role || "staff"}/track-load/${row.loadId}`);

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
      width: "180px",
      render: (row) => <CarrierCell load={row} fleetOwners={fleetOwners} />,
    },
    {
      key: "loadStatus",
      header: "Load Status",
      width: "150px",
      render: (row) => <StatusBadge value={row.transportStatus} />,
    },
  ];

  const actions = (row) => {
    if (openRow === row.loadId) {
      return (
        <AssignCarrierPicker
          loadId={row.loadId}
          fleetOwners={fleetOwners}
          onConfirm={handleAssign}
          onCancel={() => setOpenRow(null)}
          saving={saving}
        />
      );
    }

    const assigned = isAssignedToCarrier(row);

    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => setOpenRow(row.loadId)}
          disabled={saving}
          className={`${assigned ? "btn-secondary-small" : "btn-primary-small"} disabled:opacity-50`}
        >
          {assigned ? "Reassign" : "Assign Load"}
        </button>

        {/* Locked until a carrier has the load, exactly as on All Transit — a
            status is a statement about a carrier. */}
        <button
          onClick={() => setStatusModal(row)}
          disabled={saving || !assigned}
          title={assigned ? undefined : STATUS_LOCKED_REASON}
          className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-300 transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          Update Status
        </button>
      </div>
    );
  };

  const subTabs = [
    { key: "", label: "All" },
    ...SUB_TABS.map((status) => ({
      key: status,
      label: transportStatusLabel(status),
    })),
  ];

  return (
    <div className="p-4 md:p-5">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-900">Over</h2>
        <p className="text-sm text-gray-500">
          Finished loads — delivered, terminated, street-turned, in the yard or
          dropped at a warehouse, earliest delivery date first
        </p>
      </div>

      {/* Sub-tabs — the ways a load ends are read separately as often as they
          are read together. */}
      <div className="flex flex-wrap gap-2 mb-4">
        {subTabs.map((tab) => {
          const active = subTab === tab.key;
          const count = tab.key ? counts[tab.key] || 0 : rows.length;

          return (
            <button
              key={tab.key || "all"}
              onClick={() => setSubTab(tab.key)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "bg-indigo-600 border-indigo-600 text-white"
                  : "bg-white border-gray-200 text-gray-600 hover:border-indigo-300"
              }`}
            >
              {tab.label}
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
            const tint = STATUS_ROW_COLORS[row.transportStatus] || {
              bg: "#ffffff",
              border: "#e5e7eb",
            };
            const assigned = isAssignedToCarrier(row);

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
                      onClick={() => openLoad(row)}
                      className="text-sm font-bold text-indigo-700 hover:underline text-left"
                    >
                      {row.loadId}
                    </button>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {row.customerName || "—"}
                    </p>
                  </div>
                  <StatusBadge value={row.transportStatus} />
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  {[
                    ["Origin", [row.pickup?.city, row.pickup?.state].filter(Boolean).join(", ")],
                    ["Destination", [row.drop?.city, row.drop?.state].filter(Boolean).join(", ")],
                    ["Pickup Date", fmtDate(pickupDateOf(row))],
                    ["Delivery Date", fmtDate(dropDateOf(row))],
                    ["Container #", row.containerNo],
                    ["Carrier", carrierNameOnLoad(row, fleetOwners)],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="uppercase tracking-wide text-gray-400">{label}</dt>
                      <dd className="font-medium text-gray-900">{value || "—"}</dd>
                    </div>
                  ))}
                </dl>

                {isStaffOrAdmin && (
                  <div className="mt-3">
                    {openRow === row.loadId ? (
                      <AssignCarrierPicker
                        loadId={row.loadId}
                        fleetOwners={fleetOwners}
                        onConfirm={handleAssign}
                        onCancel={() => setOpenRow(null)}
                        saving={saving}
                      />
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setOpenRow(row.loadId)}
                          disabled={saving}
                          className="btn-secondary flex-1 py-1.5 disabled:opacity-50"
                        >
                          {assigned ? "Reassign" : "Assign Load"}
                        </button>
                        <button
                          onClick={() => setStatusModal(row)}
                          disabled={saving || !assigned}
                          title={assigned ? undefined : STATUS_LOCKED_REASON}
                          className="btn-primary flex-1 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Update Status
                        </button>
                      </div>
                    )}
                  </div>
                )}
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
          actions={isStaffOrAdmin ? actions : undefined}
          colorBy="transportStatus"
          colorMap={STATUS_ROW_COLORS}
          loading={loading}
          emptyMessage="No finished loads yet."
        />
      </div>

      {statusModal && (
        <UpdateStatusModal
          load={statusModal}
          onClose={() => setStatusModal(null)}
          onSaved={async () => {
            setStatusModal(null);
            await fetchLoads();
          }}
        />
      )}
    </div>
  );
};

export default OverLoadsTable;
