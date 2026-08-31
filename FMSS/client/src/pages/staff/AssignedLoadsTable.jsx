import { useEffect, useMemo, useState } from "react";
import api from "../../api";
import LoadTable from "../../components/LoadTable";
import MobileCard from "../../components/MobileCard";
import CarrierCell from "../../components/loads/CarrierCell";
import UpdateStatusModal from "../../components/loads/UpdateStatusModal";
import AssignCarrierPicker from "../../components/loads/AssignCarrierPicker";
import { LfdCell, UrgencyBadge } from "../../components/UrgencyCells";
import LoadColorModeToggle from "../../components/LoadColorModeToggle";
import { useCarrierAssignment } from "../../hooks/useCarrierAssignment";
import { carrierOnLoad } from "../../utils/loadCarrier";
import {
  STATUS_ROW_COLORS,
  rowColorFor,
  useLoadColorMode,
  STATUS_LABEL,
} from "../../utils/loadColorMode";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import {
  URGENCY_COLORS,
  URGENCY_LABEL,
  dropDateOf,
  isLfdAlarming,
  pickupDateOf,
  sortByDeliveryDate,
} from "../../utils/loadUrgency";
import {
  isAssignedToCarrier,
  STATUS_LOCKED_REASON,
} from "../../utils/loadAssignment";

const { LoadIdCell, CustomerCell, AddressCell, DateCell, fmtDate } = LoadTable;

// ═══════════════════════════════════════════════════════════════════════════════
const AssignedLoadsTable = () => {
  // Priority or status tint — a per-person choice, remembered.
  const [colorMode, setColorMode, isStatusMode] = useLoadColorMode();

  const [rows, setRows]                   = useState([]);
  const [loading, setLoading]             = useState(true);
  const [fleetOwners, setFleetOwners]     = useState([]);
  const [openRow, setOpenRow]             = useState(null);      // reassign inline open
  const [statusModal, setStatusModal]     = useState(null);      // load object for status modal

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const isStaffOrAdmin = user?.role === "staff" || user?.role === "admin";

  const sortedRows = useMemo(() => sortByDeliveryDate(rows), [rows]);

  // `silent` leaves the spinner alone so the background refresh is invisible.
  const fetchLoads = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get("/loads?status=ASSIGNED&completed=false");
      setRows(res.data);
    } catch (err) {
      console.error("Failed to fetch loads:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const { saving, assign, unassign } = useCarrierAssignment(fetchLoads);

  useEffect(() => {
    fetchLoads();
    api.get("/fleet-owners")
      .then((res) => setFleetOwners(res.data))
      .catch((err) => console.error("Failed to fetch fleet owners:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hold the refresh while a reassign picker or the status modal is open, so a
  // row cannot shift or vanish mid-action.
  useAutoRefresh(() => fetchLoads({ silent: true }), {
    enabled: !openRow && !saving && !statusModal,
  });

  const handleAssign = async (loadId, ownerId, owners) => {
    const done = await assign(loadId, ownerId, owners);
    if (done) setOpenRow(null);
  };

  // ── Desktop columns ──────────────────────────────────────────
  const columns = [
    { key: "load",         header: "Load",                 width: "130px", render: (row) => <LoadIdCell load={row} /> },
    { key: "customer",     header: "Customer",             width: "150px", render: (row) => <CustomerCell load={row} /> },
    { key: "origin",       header: "Origin",                               render: (row) => <AddressCell data={row.pickup} /> },
    { key: "pickupDate",   header: "Pickup Date",          width: "110px", render: (row) => <DateCell value={pickupDateOf(row)} showExpiry /> },
    { key: "destination",  header: "Destination",                          render: (row) => <AddressCell data={row.drop} /> },
    { key: "deliveryDate", header: "Delivery Date",        width: "110px", render: (row) => <DateCell value={dropDateOf(row)} /> },
    { key: "lfd",          header: "Last Free Date",       width: "120px", render: (row) => <LfdCell row={row} /> },
    // No Bid Status column. By the time a load reaches this tab the bidding is
    // settled — the answer is "Closed" on nearly every row, and the column that
    // matters is who won it, which is Carrier / Assignment beside it.
    { key: "carrier",      header: "Carrier / Assignment", width: "180px", render: (row) => <CarrierCell load={row} fleetOwners={fleetOwners} /> },
    {
      key: "actions",
      header: "Actions",
      width: "320px",
      render: (row) => desktopActions(row),
    },
  ];

  const desktopActions = (row) => {
    const assigned = isAssignedToCarrier(row);

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

    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Reassign / Assign */}
        <button
          onClick={() => setOpenRow(row.loadId)}
          disabled={saving}
          className={`${assigned ? "btn-secondary-small" : "btn-primary-small"} disabled:opacity-50`}
        >
          {assigned ? "Reassign" : "Assign Load"}
        </button>

        {/* Update Status — staff/admin only, and only once somebody is carrying
            it. An unassigned load has no carrier for a status to be about. */}
        {isStaffOrAdmin && (
          <button
            onClick={() => setStatusModal(row)}
            disabled={saving || !assigned}
            title={assigned ? undefined : STATUS_LOCKED_REASON}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-300 transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            Update Status
          </button>
        )}

        {/* Unassign — staff/admin only */}
        {isStaffOrAdmin && assigned && (
          <button
            onClick={() => unassign(row)}
            disabled={saving}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-300 transition disabled:opacity-50 whitespace-nowrap"
          >
            Unassign
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 md:p-5">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-900">All Transit</h2>
        <p className="text-sm text-gray-500">
          Loads still moving, earliest delivery date first — finished ones move to
          the Over tab, invoiceable ones to Accounting
        </p>
        <LoadColorModeToggle
          mode={colorMode}
          setMode={setColorMode}
          rows={sortedRows}
        />
      </div>

      {/* 📱 Mobile */}
      <div className="block xl:hidden space-y-3">
        {loading ? (
          <p className="text-center text-gray-500 py-10">Loading...</p>
        ) : sortedRows.length > 0 ? (
          sortedRows.map((row) => {
            const carrier = carrierOnLoad(row, fleetOwners);
            const assigned = isAssignedToCarrier(row);
            const isOpen = openRow === row.loadId;
            return (
              <MobileCard
                key={row.loadId}
                colorStyle={{
                  ...rowColorFor(row, colorMode, URGENCY_COLORS),
                  badge: { bg: "#e0e7ff", text: "#3730a3" },
                }}
                title={row.loadId}
                subtitle={row.customerName || "—"}
                badge={{
                  label: isStatusMode
                    ? STATUS_LABEL(row.transportStatus)
                    : URGENCY_LABEL[row.urgency].text,
                }}
                locations={[
                  { label: "Origin",      data: row.pickup },
                  { label: "Destination", data: row.drop },
                ]}
                fields={[
                  { label: "Pickup Date",   value: fmtDate(pickupDateOf(row)) },
                  { label: "Delivery Date", value: fmtDate(dropDateOf(row)) },
                  {
                    label: "Last Free Date",
                    value: row.lastFreeDate
                      ? `${fmtDate(row.lastFreeDate)}${isLfdAlarming(row) ? " 💡" : ""}`
                      : null,
                  },
                  { label: "Load Type",        value: row.truckType },
                  { label: "Container #",       value: row.containerNo },
                  { label: "Status",  value: STATUS_LABEL(row.transportStatus) },
                  {
                    label: "Carrier",
                    value: carrier
                      ? `${carrier.name}${carrier.phone ? ` (${carrier.phone})` : ""}`
                      : "Not assigned",
                  },
                ]}
                actions={[
                  ...(!isOpen ? [{ label: assigned ? "Reassign" : "Assign Load", color: assigned ? "#f59e0b" : "#2563eb", onClick: () => setOpenRow(row.loadId) }] : []),
                  ...(isStaffOrAdmin && assigned
                    ? [{ label: "Update Status", color: "#2563eb", onClick: () => setStatusModal(row) }]
                    : []),
                  ...(isStaffOrAdmin && assigned ? [{ label: "Unassign", color: "#dc2626", onClick: () => unassign(row) }] : []),
                ]}
              >
                {isOpen && (
                  <AssignCarrierPicker
                    loadId={row.loadId}
                    fleetOwners={fleetOwners}
                    onConfirm={handleAssign}
                    onCancel={() => setOpenRow(null)}
                    saving={saving}
                  />
                )}
              </MobileCard>
            );
          })
        ) : (
          <p className="text-center text-gray-500 py-10">No loads in transit.</p>
        )}
      </div>

      {/* 💻 Desktop */}
      <div className="hidden xl:block">
        <LoadTable
          loads={sortedRows}
          columns={columns}
          colorBy={isStatusMode ? "transportStatus" : "urgency"}
          colorMap={isStatusMode ? STATUS_ROW_COLORS : URGENCY_COLORS}
          loading={loading}
          emptyMessage="No loads in transit."
        />
      </div>

      {/* Update Status Modal */}
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

export default AssignedLoadsTable;