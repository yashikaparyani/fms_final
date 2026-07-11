import { useEffect, useMemo, useState } from "react";
import api from "../../api";
import LoadTable from "../../components/LoadTable";
import MobileCard from "../../components/MobileCard";
import Swal from "sweetalert2";
import AppSelect from "../../components/AppSelect";
import { notify } from "../../utils/swal";
import ScheduleBidding from "../ScheduleBidding";
import { LfdCell, UrgencyBadge, UrgencyLegend } from "../../components/UrgencyCells";
import {
  URGENCY_COLORS,
  URGENCY_LABEL,
  dropDateOf,
  isLfdAlarming,
  pickupDateOf,
  sortByUrgency,
} from "../../utils/loadUrgency";

const { LoadIdCell, CustomerCell, AddressCell, StatusBadge, DateCell, fmtDate } =
  LoadTable;

// ─── Helpers ─────────────────────────────────────────────────────────────────
const getAssignedName = (load, fleetOwners) => {
  if (load?.assignedFleetOwner?.fleetOwnerName)
    return load.assignedFleetOwner.fleetOwnerName;
  const winId = load?.winningBid?.fleetOwnerId;
  if (winId && fleetOwners.length) {
    const fo = fleetOwners.find(
      (o) => o._id === winId || o._id === winId?.$oid,
    );
    if (fo) return fo.carrierName;
  }
  return null;
};

// ─── Carrier Cell (desktop) ───────────────────────────────────────────────────
const CarrierCell = ({ load, fleetOwners }) => {
  const assignedName = getAssignedName(load, fleetOwners);
  if (assignedName) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-green-600 flex-shrink-0" />
        <span className="text-xs font-bold text-green-800">{assignedName}</span>
      </div>
    );
  }
  return <span className="text-xs text-gray-400 italic">Not assigned</span>;
};

// ─── Desktop Assign Dropdown ──────────────────────────────────────────────────
const AssignDropdown = ({
  loadId,
  fleetOwners,
  onConfirm,
  onCancel,
  saving,
}) => {
  const [ownerId, setOwnerId] = useState("");
  return (
    <div className="flex flex-col gap-1.5 max-w-[280px]">
      <AppSelect
        options={fleetOwners.map((fo) => ({ value: fo._id, label: fo.carrierName }))}
        value={ownerId}
        onChange={setOwnerId}
        placeholder="Search fleet owner…"
      />
      <div className="flex gap-1.5">
        <button
          disabled={!ownerId || saving}
          onClick={() => onConfirm(loadId, ownerId, fleetOwners)}
          className="flex-1 text-xs py-1.5 px-2 rounded-md font-semibold text-white transition"
          style={{
            background: !ownerId || saving ? "#d1d5db" : "#16a34a",
            cursor: !ownerId || saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Confirm"}
        </button>
        <button
          onClick={onCancel}
          className="text-xs py-1.5 px-2 rounded-md border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

// ─── Mobile Assign Inline ─────────────────────────────────────────────────────
const MobileAssignInline = ({
  loadId,
  fleetOwners,
  onConfirm,
  onCancel,
  saving,
}) => {
  const [ownerId, setOwnerId] = useState("");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <AppSelect
        options={fleetOwners.map((fo) => ({ value: fo._id, label: fo.carrierName }))}
        value={ownerId}
        onChange={setOwnerId}
        placeholder="Search fleet owner…"
      />
      <div style={{ display: "flex", gap: 6 }}>
        <button
          disabled={!ownerId || saving}
          onClick={() => onConfirm(loadId, ownerId, fleetOwners)}
          style={{
            flex: 1,
            fontSize: 12,
            padding: "6px 0",
            borderRadius: 6,
            border: "none",
            background: !ownerId || saving ? "#d1d5db" : "#16a34a",
            color: "#fff",
            fontWeight: 600,
            cursor: !ownerId || saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Confirm"}
        </button>
        <button
          onClick={onCancel}
          style={{
            fontSize: 12,
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid #d1d5db",
            background: "#f3f4f6",
            color: "#374151",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
const VerifiedLoadsTable = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fleetOwners, setFleetOwners] = useState([]);
  const [openRow, setOpenRow] = useState(null);
  const [saving, setSaving] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selectedLoad, setSelectedLoad] = useState(null);

  const sortedRows = useMemo(() => sortByUrgency(rows), [rows]);

  const fetchLoads = async () => {
    setLoading(true);
    try {
      const res = await api.get("/loads?status=VERIFIED");
      setRows(res.data);
    } catch (err) {
      console.error("Failed to fetch loads:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLoads();
    api
      .get("/fleet-owners")
      .then((res) => setFleetOwners(res.data))
      .catch((err) => console.error("Failed to fetch fleet owners:", err));
  }, []);

  const handleAssign = async (loadId, ownerId, owners) => {
    const owner = owners.find((o) => o._id === ownerId);
    if (!owner) {
      notify.error("Owner not found");
      return;
    }
    const result = await Swal.fire({
      title: "Assign Fleet Owner?",
      html: `Assign <strong>${owner.carrierName}</strong> to load <strong>${loadId}</strong>?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#2563eb",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "✓ Yes, Assign",
      cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return;
    setSaving(true);
    try {
      await api.put(`/loads/${loadId}/assign-fleet-owner`, {
        fleetOwnerId: owner._id,
        fleetOwnerName: owner.carrierName,
      });
      setOpenRow(null);
      await fetchLoads();
      notify.success(`Load ${loadId} assigned to ${owner.carrierName}!`);
    } catch (err) {
      console.error("Assignment failed:", err);
      notify.error("Assignment failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ── Desktop columns ──────────────────────────────────────────
  const columns = [
    {
      key: "load",
      header: "Load",
      width: "130px",
      render: (row) => <LoadIdCell load={row} />,
    },
    {
      key: "priority",
      header: "Priority",
      width: "90px",
      render: (row) => <UrgencyBadge urgency={row.urgency} />,
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
      key: "pickupDate",
      header: "Pickup Date",
      width: "110px",
      render: (row) => <DateCell value={pickupDateOf(row)} showExpiry />,
    },
    {
      key: "destDate",
      header: "Dest. Date",
      width: "110px",
      render: (row) => <DateCell value={dropDateOf(row)} />,
    },
    {
      key: "lfd",
      header: "LFD",
      width: "110px",
      render: (row) => <LfdCell row={row} />,
    },
  {
  key: "bidStatus",
  header: "Bid Status",
  width: "160px",
  render: (row) => {
    const { fmtDate, fmtDateTime } = LoadTable;

    if (row.bidStatus !== "OPEN") {
      return <StatusBadge value={row.bidStatus} />;
    }

    return (
      <div className="flex flex-col leading-tight">
        {/* Status */}
        <StatusBadge value={row.bidStatus} />

        {/* Date */}
        {row.bidStartTime && (
          <div className="text-[10px] text-gray-500 mt-0.5">
            {fmtDate(row.bidStartTime)} {fmtDateTime(row.bidStartTime)?.split(", ")[2] || "?"}
          </div>
        )}

        {/* Time Range */}
        <div className="text-[10px] text-gray-500 whitespace-nowrap">
          {fmtDate(row.bidEndTime)}
          {" – "}
          {fmtDateTime(row.bidEndTime)?.split(", ")[2] || "?"}
        </div>
      </div>
    );
  },
},
    // {
    //   key: "carrier",
    //   header: "Carrier / Assignment",
    //   width: "200px",
    //   render: (row) => <CarrierCell load={row} fleetOwners={fleetOwners} />,
    // },
    {
      key: "actions",
      header: "Actions",
      width: "320px", // 👈 fixed width here
      render: (row) => <>{desktopActions(row)}</>,
    },
  ];

  const desktopActions = (row) => {
    const assignedName = getAssignedName(row, fleetOwners);
    const isOpen = openRow === row.loadId;

    if (isOpen) {
      return (
        <AssignDropdown
          loadId={row.loadId}
          fleetOwners={fleetOwners}
          onConfirm={handleAssign}
          onCancel={() => setOpenRow(null)}
          saving={saving}
        />
      );
    }

    return (
      <div className="flex items-center gap-2 justify-center">
        {/* ✅ Schedule Bid Button */}
        <button
          onClick={() => {
            setSelectedLoad(row);
            setScheduleOpen(true);
          }}
          className="btn-primary-small"
        >
          {row.bidStartTime ? "Reschedule Bid" : "Schedule Bid"}
        </button>

        {/* ✅ Direct Assign (no bidding) */}
        <button
          onClick={() => setOpenRow(row.loadId)}
          className="btn-secondary-small"
        >
          {assignedName ? "Reassign" : "Assign Driver"}
        </button>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-5">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-900">Dispatch Management</h2>
        <p className="text-sm text-gray-500">
          Loads cleared for bidding, most urgent pickup first
        </p>
        <UrgencyLegend />
      </div>

      {/* 📱 Mobile */}
      <div className="block xl:hidden space-y-3">
        {loading ? (
          <p className="text-center text-gray-500 py-10">Loading...</p>
        ) : sortedRows.length > 0 ? (
          sortedRows.map((row) => {
            const assignedName = getAssignedName(row, fleetOwners);
            const isOpen = openRow === row.loadId;
            return (
              <MobileCard
                key={row.loadId}
                colorStyle={{
                  ...URGENCY_COLORS[row.urgency],
                  badge: { bg: "#e0e7ff", text: "#3730a3" },
                }}
                title={row.loadId}
                subtitle={row.customerName || "—"}
                badge={{ label: URGENCY_LABEL[row.urgency].text }}
                locations={[
                  { label: "Origin", data: row.pickup },
                  { label: "Destination", data: row.drop },
                ]}
                fields={[
                  { label: "Truck Type", value: row.truckType },
                  { label: "Container #", value: row.containerNo },
                  { label: "Pickup Date", value: fmtDate(pickupDateOf(row)) },
                  { label: "Dest. Date", value: fmtDate(dropDateOf(row)) },
                  {
                    label: "LFD",
                    value: row.lastFreeDate
                      ? `${fmtDate(row.lastFreeDate)}${isLfdAlarming(row) ? " 💡" : ""}`
                      : null,
                  },
                  { label: "Bid Status", value: row.bidStatus?.replace(/_/g, " ") },
                  { label: "Carrier", value: assignedName || "Not assigned" },
                ]}
                actions={[
                  {
                    label: row.bidStartTime ? "Reschedule Bid" : "Schedule Bid",
                    color: "#16a34a",
                    onClick: () => {
                      setSelectedLoad(row);
                      setScheduleOpen(true);
                    },
                  },
                  {
                    label: assignedName ? "Reassign" : "Assign Driver",
                    color: "#2563eb",
                    onClick: () => setOpenRow(row.loadId),
                  },
                ]}
                // actions={
                //   !isOpen
                //     ? [{ label: assignedName ? "Reassign" : "Assign Load", color: assignedName ? "#f59e0b" : "#2563eb", onClick: () => setOpenRow(row.loadId) }]
                //     : []
                // }
              >
                {isOpen && (
                  <MobileAssignInline
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
          <p className="text-center text-gray-500 py-10">
            No loads ready for dispatch.
          </p>
        )}
      </div>

      {/* 💻 Desktop */}
      <div className="hidden xl:block">
        <LoadTable
          loads={sortedRows}
          columns={columns}
          //actions={desktopActions}
          colorBy="urgency"
          colorMap={URGENCY_COLORS}
          loading={loading}
          emptyMessage="No loads ready for dispatch."
        />
      </div>

      <ScheduleBidding
        open={scheduleOpen}
        onClose={() => {
          setScheduleOpen(false);
          setSelectedLoad(null);
        }}
        load={selectedLoad}
        refreshLoads={fetchLoads}
      />
    </div>
  );
};

export default VerifiedLoadsTable;
