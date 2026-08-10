import { useEffect, useMemo, useState } from "react";
import api from "../../api";
import LoadTable from "../../components/LoadTable";
import MobileCard from "../../components/MobileCard";
import Swal from "sweetalert2";
import AppSelect from "../../components/AppSelect";
import StreetTurnConfirmDialog from "../../components/StreetTurnConfirmDialog";
import { notify } from "../../utils/swal";
import { LfdCell, UrgencyBadge, UrgencyLegend } from "../../components/UrgencyCells";
import {
  URGENCY_COLORS,
  URGENCY_LABEL,
  dropDateOf,
  isLfdAlarming,
  pickupDateOf,
  sortByUrgency,
} from "../../utils/loadUrgency";

const { LoadIdCell, CustomerCell, AddressCell, StatusBadge, DateCell, fmtDate } = LoadTable;

// ─── Transport Status Options ─────────────────────────────────────────────────
const TRANSPORT_STATUS_OPTIONS = [
  { value: "NEW_LOAD",             label: "New Load" },
  { value: "ASSIGNED",             label: "Assigned" },
  { value: "READY_TO_PICKUP",      label: "Ready to Pickup" },
  { value: "PICKED_UP",            label: "Picked Up" },
  { value: "IN_TRANSIT",           label: "In Transit" },
  { value: "REACHED_DESTINATION",  label: "Reached Destination" },
  { value: "DELIVERED",            label: "Delivered" },
  { value: "TERMINATED",           label: "Terminated" },
  { value: "PAPERWORK_PENDING",    label: "Paperwork Pending" },
  { value: "INVOICED",             label: "Invoiced" },
  { value: "STREET_TURN",          label: "Street Turn" },
  { value: "EMPTY_IN_YARD",        label: "Empty in Yard" },
  { value: "LOADED_IN_YARD",       label: "Loaded in Yard" },
  { value: "DRIVER_ON_WAITING",    label: "Driver on Waiting" },
  { value: "DROP_IN_WAREHOUSE",    label: "Drop in Warehouse" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const findOwner = (fleetOwners, id) =>
  id ? fleetOwners.find((o) => o._id === id || o._id === id?.$oid) : null;

const getAssignedOwner = (load, fleetOwners) => {
  if (load?.assignedFleetOwner?.fleetOwnerName) {
    const fo = findOwner(fleetOwners, load.assignedFleetOwner.fleetOwnerId);
    return { name: load.assignedFleetOwner.fleetOwnerName, phone: fo?.phone || null };
  }
  const fo = findOwner(fleetOwners, load?.winningBid?.fleetOwnerId);
  if (fo) return { name: fo.carrierName, phone: fo.phone || null };
  return null;
};

const getAssignedName = (load, fleetOwners) =>
  getAssignedOwner(load, fleetOwners)?.name || null;

// wa.me needs digits only (with country code if the number has one)
const waLink = (phone) => `https://wa.me/${String(phone).replace(/\D/g, "")}`;

const WhatsAppButton = ({ phone }) => {
  if (!phone) return null;
  return (
    <a
      href={waLink(phone)}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={`WhatsApp ${phone}`}
      className="flex-shrink-0 text-green-600 hover:text-green-700 transition-colors"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    </a>
  );
};

// ─── Carrier Cell (desktop) ───────────────────────────────────────────────────
const CarrierCell = ({ load, fleetOwners }) => {
  const owner = getAssignedOwner(load, fleetOwners);
  if (owner) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-green-600 flex-shrink-0" />
        <span className="text-xs font-bold text-green-800">
          {owner.name}
          {owner.phone && <span className="font-semibold text-green-700"> ({owner.phone})</span>}
        </span>
        <WhatsAppButton phone={owner.phone} />
      </div>
    );
  }
  return <span className="text-xs text-gray-400 italic">Not assigned</span>;
};

// ─── Desktop Assign Dropdown ──────────────────────────────────────────────────
const AssignDropdown = ({ loadId, fleetOwners, onConfirm, onCancel, saving }) => {
  const [ownerId, setOwnerId] = useState("");
  return (
    <div className="flex flex-col gap-1.5 max-w-[280px]">
      <AppSelect
        options={fleetOwners.map((fo) => ({ value: fo._id, label: fo.phone ? `${fo.carrierName} (${fo.phone})` : fo.carrierName }))}
        value={ownerId}
        onChange={setOwnerId}
        placeholder="Search fleet owner…"
      />
      <div className="flex gap-1.5">
        <button
          disabled={!ownerId || saving}
          onClick={() => onConfirm(loadId, ownerId, fleetOwners)}
          className="flex-1 text-xs py-1.5 px-2 rounded-md font-semibold text-white transition"
          style={{ background: !ownerId || saving ? "#d1d5db" : "#16a34a", cursor: !ownerId || saving ? "not-allowed" : "pointer" }}
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

// ─── Update Status Modal ──────────────────────────────────────────────────────
const UpdateStatusModal = ({ load, onClose, onSaved }) => {
  const [status, setStatus] = useState(load.transportStatus || "");
  const [note, setNote]     = useState("");
  const [saving, setSaving] = useState(false);
  // A street turn needs the handover details before it can be saved.
  const [showStreetTurn, setShowStreetTurn] = useState(false);

  const save = async (streetTurn) => {
    setSaving(true);
    try {
      await api.put(`/loads/${load.loadId}/transport-status`, {
        transportStatus: status,
        note,
        source: "web",
        ...(streetTurn ? { streetTurn } : {}),
      });
      notify.success(`Status updated to "${TRANSPORT_STATUS_OPTIONS.find(o => o.value === status)?.label}"`);
      setShowStreetTurn(false);
      onSaved();
    } catch (err) {
      notify.error(err?.response?.data?.message || "Failed to update status");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (!status) { notify.error("Please select a status"); return; }
    if (status === "STREET_TURN") { setShowStreetTurn(true); return; }
    save(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-800">Update Status</h3>
              <p className="text-xs text-gray-400">Load <span className="font-semibold text-gray-600">{load.loadId}</span></p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div className="relative">
            <AppSelect
              options={TRANSPORT_STATUS_OPTIONS}
              value={status}
              onChange={setStatus}
              placeholder="Select new status…"
              isDisabled={saving}
            />
            <label className="input-label">Status <span className="text-red-400">*</span></label>
          </div>
          <div className="relative">
            <textarea
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 pt-5 pb-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              placeholder="Optional note…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={saving}
            />
            <label className="input-label">Note (optional)</label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary disabled:opacity-50">Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? "Saving…" : "Update Status"}
          </button>
        </div>
      </div>

      <StreetTurnConfirmDialog
        isShow={showStreetTurn}
        load={load}
        saving={saving}
        onCancel={() => setShowStreetTurn(false)}
        onConfirm={save}
      />
    </div>
  );
};

// ─── Mobile Assign Inline ─────────────────────────────────────────────────────
const MobileAssignInline = ({ loadId, fleetOwners, onConfirm, onCancel, saving }) => {
  const [ownerId, setOwnerId] = useState("");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <AppSelect
        options={fleetOwners.map((fo) => ({ value: fo._id, label: fo.phone ? `${fo.carrierName} (${fo.phone})` : fo.carrierName }))}
        value={ownerId}
        onChange={setOwnerId}
        placeholder="Search fleet owner…"
      />
      <div style={{ display: "flex", gap: 6 }}>
        <button
          disabled={!ownerId || saving}
          onClick={() => onConfirm(loadId, ownerId, fleetOwners)}
          style={{
            flex: 1, fontSize: 12, padding: "6px 0", borderRadius: 6, border: "none",
            background: !ownerId || saving ? "#d1d5db" : "#16a34a",
            color: "#fff", fontWeight: 600, cursor: !ownerId || saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Confirm"}
        </button>
        <button
          onClick={onCancel}
          style={{ fontSize: 12, padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#f3f4f6", color: "#374151", cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
const AssignedLoadsTable = () => {
  const [rows, setRows]                   = useState([]);
  const [loading, setLoading]             = useState(true);
  const [fleetOwners, setFleetOwners]     = useState([]);
  const [openRow, setOpenRow]             = useState(null);      // reassign inline open
  const [saving, setSaving]               = useState(false);
  const [statusModal, setStatusModal]     = useState(null);      // load object for status modal

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const isStaffOrAdmin = user?.role === "staff" || user?.role === "admin";

  const sortedRows = useMemo(() => sortByUrgency(rows), [rows]);

  const fetchLoads = async () => {
    setLoading(true);
    try {
      const res = await api.get("/loads?status=ASSIGNED");
      setRows(res.data);
    } catch (err) {
      console.error("Failed to fetch loads:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLoads();
    api.get("/fleet-owners")
      .then((res) => setFleetOwners(res.data))
      .catch((err) => console.error("Failed to fetch fleet owners:", err));
  }, []);

  // ── Reassign ────────────────────────────────────────────────────────────────
  const handleAssign = async (loadId, ownerId, owners) => {
    const owner = owners.find((o) => o._id === ownerId);
    if (!owner) { notify.error("Owner not found"); return; }
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

  // ── Unassign ────────────────────────────────────────────────────────────────
  const handleUnassign = async (row) => {
    const result = await Swal.fire({
      title: "Unassign Load?",
      html: `Load <strong>${row.loadId}</strong> will be returned to <strong>Dispatch Management</strong> and will be available for bidding / reassignment.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "✓ Yes, Unassign",
      cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return;
    setSaving(true);
    try {
      await api.put(`/loads/${row.loadId}/unassign`);
      await fetchLoads();
      notify.success(`Load ${row.loadId} unassigned — back in Dispatch Management.`);
    } catch (err) {
      notify.error(err?.response?.data?.message || "Unassign failed. Please try again.");
    } finally {
      setSaving(false);
    }
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
    { key: "bidStatus",    header: "Bid Status",           width: "110px", render: (row) => <StatusBadge value={row.bidStatus} /> },
    { key: "carrier",      header: "Carrier / Assignment", width: "180px", render: (row) => <CarrierCell load={row} fleetOwners={fleetOwners} /> },
    {
      key: "actions",
      header: "Actions",
      width: "320px",
      render: (row) => desktopActions(row),
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
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Reassign / Assign */}
        <button
          onClick={() => setOpenRow(row.loadId)}
          disabled={saving}
          className={`${assignedName ? "btn-secondary-small" : "btn-primary-small"} disabled:opacity-50`}
        >
          {assignedName ? "Reassign" : "Assign Load"}
        </button>

        {/* Update Status — staff/admin only */}
        {isStaffOrAdmin && (
          <button
            onClick={() => setStatusModal(row)}
            disabled={saving}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-300 transition disabled:opacity-50 whitespace-nowrap"
          >
            Update Status
          </button>
        )}

        {/* Unassign — staff/admin only */}
        {isStaffOrAdmin && assignedName && (
          <button
            onClick={() => handleUnassign(row)}
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
          Loads assigned to carriers, most urgent pickup first
        </p>
        <UrgencyLegend />
      </div>

      {/* 📱 Mobile */}
      <div className="block xl:hidden space-y-3">
        {loading ? (
          <p className="text-center text-gray-500 py-10">Loading...</p>
        ) : sortedRows.length > 0 ? (
          sortedRows.map((row) => {
            const assignedOwner = getAssignedOwner(row, fleetOwners);
            const assignedName = assignedOwner?.name || null;
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
                  { label: "Bid Status",        value: row.bidStatus?.replace(/_/g, " ") },
                  { label: "Status",  value: row.transportStatus?.replace(/_/g, " ") },
                  {
                    label: "Carrier",
                    value: assignedOwner
                      ? `${assignedOwner.name}${assignedOwner.phone ? ` (${assignedOwner.phone})` : ""}`
                      : "Not assigned",
                  },
                ]}
                actions={[
                  ...(!isOpen ? [{ label: assignedName ? "Reassign" : "Assign Load", color: assignedName ? "#f59e0b" : "#2563eb", onClick: () => setOpenRow(row.loadId) }] : []),
                  ...(isStaffOrAdmin ? [{ label: "Update Status", color: "#2563eb", onClick: () => setStatusModal(row) }] : []),
                  ...(isStaffOrAdmin && assignedName ? [{ label: "Unassign", color: "#dc2626", onClick: () => handleUnassign(row) }] : []),
                ]}
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
          <p className="text-center text-gray-500 py-10">No loads in transit.</p>
        )}
      </div>

      {/* 💻 Desktop */}
      <div className="hidden xl:block">
        <LoadTable
          loads={sortedRows}
          columns={columns}
          colorBy="urgency"
          colorMap={URGENCY_COLORS}
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