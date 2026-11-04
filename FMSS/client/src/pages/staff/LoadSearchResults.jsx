import { useEffect, useState } from "react";
import api from "../../api";
import LoadTable from "../../components/LoadTable";
import MobileCard from "../../components/MobileCard";
import UpdateStatusModal from "../../components/loads/UpdateStatusModal";
import AssignCarrierPicker from "../../components/loads/AssignCarrierPicker";
import AssignCarrierLegsDialog from "../../components/AssignCarrierLegsDialog";
import { useCarrierAssignment } from "../../hooks/useCarrierAssignment";
import { notify } from "../../utils/swal";
import {
  isAssignedToCarrier,
  isParkedWithCarrier,
  STATUS_LOCKED_REASON,
} from "../../utils/loadAssignment";
import {
  dropDateOf,
  dropWindowOf,
  pickupDateOf,
  pickupWindowOf,
  withWindow,
} from "../../utils/loadUrgency";
import { formatDate } from "../../utils/dates";

const { LoadIdCell, CustomerCell, AddressCell, DateCell } = LoadTable;

const fmtDate = (v) =>
  v ? formatDate(v) : null;

// Which tab a result would normally live under, so a mixed list stays legible.
const TAB_OF_STATUS = {
  PENDING_VERIFICATION: { key: "pending",  label: "Pending",             className: "bg-amber-100 text-amber-800" },
  VERIFIED:             { key: "verified", label: "Dispatch Management", className: "bg-green-100 text-green-800" },
  ASSIGNED:             { key: "assigned", label: "All Transit",         className: "bg-blue-100 text-blue-800" },
};

// An invoiceable load is still workflow-status ASSIGNED, but it has left All
// Transit for Accounting (see ACCOUNTING_TRANSPORT_STATUSES in
// server/controllers/loadController.js). Labelling it "All Transit" would send
// somebody to a tab it is no longer in, so the transport status is checked
// first.
const ACCOUNTING_TAB = {
  key: "accounting",
  label: "Accounting",
  className: "bg-purple-100 text-purple-800",
};

const TAB_ROW_COLOR = {
  pending:    { bg: "#fffbeb", border: "#f59e0b" },
  verified:   { bg: "#edf9ee", border: "#22c55e" },
  assigned:   { bg: "#eff6ff", border: "#3b82f6" },
  accounting: { bg: "#faf5ff", border: "#a855f7" },
};

const tabOf = (row) =>
  row.transportStatus === "INVOICED"
    ? ACCOUNTING_TAB
    : TAB_OF_STATUS[row.status] || null;

const TabBadge = ({ row }) => {
  const tab = tabOf(row);
  if (!tab) return <span className="text-gray-400 text-xs">—</span>;
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[12px] font-semibold whitespace-nowrap ${tab.className}`}>
      {tab.label}
    </span>
  );
};

// A search reaches loads the tabs would not offer these actions on, and the
// assign route does not check for itself: it would put an unverified load on the
// road, or pull a billed one back out of Accounting and reset it to Assigned.
const actionLockReason = (row) => {
  if (row.transportStatus === "INVOICED")
    return "This load is in Accounting — open it to make changes.";
  if (row.status === "PENDING_VERIFICATION")
    return "Verify this load in the Pending tab first.";
  return null;
};

const assignLabel = (row) =>
  isParkedWithCarrier(row)
    ? "Assign Another Driver"
    : isAssignedToCarrier(row)
      ? "Reassign"
      : "Assign Driver";

/**
 * Flat, cross-tab result list for a load search. Rows keep the tint of the tab
 * they belong to, so a mixed list still reads as three groups at a glance.
 */
const LoadSearchResults = ({ term, status, results, loading, onClear, onChanged }) => {
  const [fleetOwners, setFleetOwners] = useState([]);
  const [openRow, setOpenRow] = useState(null); // assign picker open on this load
  const [statusModal, setStatusModal] = useState(null);
  // The parked load whose yard handover is being set up.
  const [handoverLoad, setHandoverLoad] = useState(null);
  const [savingLegs, setSavingLegs] = useState(false);

  const { saving, assign } = useCarrierAssignment(onChanged);

  useEffect(() => {
    api
      .get("/fleet-owners")
      .then((res) => setFleetOwners(res.data))
      .catch((err) => console.error("Failed to fetch fleet owners:", err));
  }, []);

  const handleAssign = async (loadId, ownerId, owners) => {
    const done = await assign(loadId, ownerId, owners);
    if (done) setOpenRow(null);
  };

  // Parked with a carrier: set up who collects it from the yard, as the Over tab
  // does. A straight assignment would clear the first driver's run and bill.
  const startAssign = (row) => {
    if (isParkedWithCarrier(row)) {
      setHandoverLoad(row);
    } else {
      setOpenRow(row.loadId);
    }
  };

  const saveHandover = async (assignments) => {
    setSavingLegs(true);
    try {
      const { data } = await api.put(`/loads/${handoverLoad.loadId}/assignments`, {
        assignments,
      });
      setHandoverLoad(null);
      await onChanged();
      notify.success(data.message || "Second driver assigned.");
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not assign the second driver.");
    } finally {
      setSavingLegs(false);
    }
  };

  // Human-readable description of the active search term and/or status filter.
  const criteria = [
    term ? `“${term}”` : null,
    status ? `status “${status}”` : null,
  ]
    .filter(Boolean)
    .join(" · ");

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
    { key: "pickupDate",  header: "Pickup Date",  width: "9%",  render: (row) => <DateCell value={pickupDateOf(row)} time={pickupWindowOf(row)} showExpiry /> },
    { key: "destination", header: "Destination",  width: "15%", render: (row) => <AddressCell data={row.drop} /> },
    { key: "deliveryDate",header: "Delivery Date",width: "9%",  render: (row) => <DateCell value={dropDateOf(row)} time={dropWindowOf(row)} /> },
    { key: "truckType",   header: "Load Type",   width: "8%",  render: (row) => <span className="text-xs text-gray-700">{row.truckType || "—"}</span> },
    { key: "refNo",       header: "Ref No",       width: "7%",  render: (row) => <span className="text-xs text-gray-700">{row.refNo || "—"}</span> },
    { key: "lastFreeDate",header: "Last Free Date",width: "9%", render: (row) => <DateCell value={row.lastFreeDate} showExpiry /> },
  ];

  const picker = (row) => (
    <AssignCarrierPicker
      loadId={row.loadId}
      fleetOwners={fleetOwners}
      onConfirm={handleAssign}
      onCancel={() => setOpenRow(null)}
      saving={saving}
    />
  );

  // Opening a load stays one click away on its ID, on both the table and the card.
  const actions = (row) => {
    if (openRow === row.loadId) return picker(row);

    const assigned = isAssignedToCarrier(row);
    const lockReason = actionLockReason(row);

    return (
      <div className="flex flex-col items-stretch gap-1.5">
        <button
          onClick={() => startAssign(row)}
          disabled={saving || Boolean(lockReason)}
          title={lockReason || undefined}
          className={`${assigned ? "btn-secondary-small" : "btn-primary-small"} w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {assignLabel(row)}
        </button>
        <button
          onClick={() => setStatusModal(row)}
          disabled={saving || Boolean(lockReason) || !assigned}
          title={lockReason || (assigned ? undefined : STATUS_LOCKED_REASON)}
          className="w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-300 transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          Update Status
        </button>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-5">
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            {loading ? "Searching…" : `${results.length} result${results.length === 1 ? "" : "s"}`}
            {!loading && criteria && (
              <span className="font-normal text-gray-500"> for {criteria}</span>
            )}
          </h2>
          {!loading && results.length > 0 && (
            <p className="text-sm text-gray-500">
              {[...Object.values(TAB_OF_STATUS), ACCOUNTING_TAB]
                .filter((tab) => counts[tab.key])
                .map((tab) => `${counts[tab.key]} in ${tab.label}`)
                .join(" · ")}
            </p>
          )}
        </div>
        <button onClick={onClear} className="btn-secondary self-start sm:self-auto whitespace-nowrap">
          ✕ Clear filters
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
                { label: "Pickup Date",   value: withWindow(fmtDate(pickupDateOf(row)), pickupWindowOf(row)) },
                { label: "Delivery Date", value: withWindow(fmtDate(dropDateOf(row)), dropWindowOf(row)) },
                { label: "Load Type",    value: row.truckType },
                { label: "Ref No",        value: row.refNo },
                { label: "Container #",   value: row.containerNo },
                { label: "Last Free Date",value: fmtDate(row.lastFreeDate) },
              ]}
              actions={
                openRow === row.loadId
                  ? []
                  : [
                      {
                        label: assignLabel(row),
                        color: "#2563eb",
                        disabled: saving || Boolean(actionLockReason(row)),
                        onClick: () => startAssign(row),
                      },
                      {
                        label: "Update Status",
                        color: "#4f46e5",
                        disabled: saving || Boolean(actionLockReason(row)) || !isAssignedToCarrier(row),
                        onClick: () => setStatusModal(row),
                      },
                    ]
              }
            >
              {openRow === row.loadId && picker(row)}
            </MobileCard>
          ))
        ) : (
          <p className="text-center text-gray-500 py-10">No loads match {criteria}.</p>
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
          emptyMessage={`No loads match ${criteria}.`}
        />
      </div>

      {handoverLoad && (
        <AssignCarrierLegsDialog
          key={handoverLoad.loadId}
          load={handoverLoad}
          fleetOwners={fleetOwners}
          saving={savingLegs}
          onSave={saveHandover}
          onClose={() => setHandoverLoad(null)}
          handover
          title="Assign another driver"
          subtitle="Leg 1 is the run already made — set the yard or warehouse it ended at. Leg 2 is the new driver: choose them and where they take it. Saving moves the first driver's bill to payables."
        />
      )}

      {statusModal && (
        <UpdateStatusModal
          load={statusModal}
          onClose={() => setStatusModal(null)}
          onSaved={async () => {
            setStatusModal(null);
            await onChanged();
          }}
        />
      )}
    </div>
  );
};

export default LoadSearchResults;
