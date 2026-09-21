import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api";
import LoadTable from "../../components/LoadTable";
import CarrierCell from "../../components/loads/CarrierCell";
import UpdateStatusModal from "../../components/loads/UpdateStatusModal";
import AssignCarrierPicker from "../../components/loads/AssignCarrierPicker";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { useCarrierAssignment } from "../../hooks/useCarrierAssignment";
import AssignDriversDialog from "../../components/fleetOwner/AssignDriversDialog";
import { carrierIdOnLoad, carrierNameOnLoad } from "../../utils/loadCarrier";
import { isAssignedToCarrier, STATUS_LOCKED_REASON } from "../../utils/loadAssignment";
import { STATUS_BADGE_COLORS, STATUS_ROW_COLORS } from "../../utils/loadColorMode";
import { transportStatusLabel } from "../../utils/transportStatus";
import { missingPaperwork } from "../../utils/paperwork";
import { toast } from "react-toastify";
import Swal from "sweetalert2";
import {
  dropDateOf,
  dropWindowOf,
  pickupDateOf,
  pickupWindowOf,
  sortByDeliveryDate,
  withWindow,
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
// Statuses where the load has stopped rather than finished: the box is sitting
// in a yard or at a warehouse and somebody still has to move it. Reassigning
// changes which carrier owns it; this changes who actually drives the next
// stretch, which is usually the only thing that needs to change — the carrier
// is the same, the driver who dropped it has gone home.
const AWAITING_A_DRIVER = ["DROP_IN_WAREHOUSE", "LOADED_IN_YARD", "EMPTY_IN_YARD"];

// A load whose driving is done and whose documents are not. The only rows in
// this tab where "Transfer to Invoiceable" means anything.
//
// Delivered is on the list as well as the queue itself: a delivered load nobody
// has moved on yet carries exactly the documents it would carry a minute later
// in Paperwork Pending, and the approval opens its review on the way past (see
// reviewPaperwork). Leaving it off meant the office had to move the load to the
// queue first purely to be allowed to do the thing they were already doing.
const canTransferToInvoiceable = (row) =>
  ["DELIVERED", "PAPERWORK_PENDING"].includes(row?.transportStatus);

const SUB_TABS = [
  "DELIVERED",
  // The paperwork queue. Not an ended journey — the documents are still owed —
  // but there is nothing left for dispatch to arrange, so it reads here rather
  // than in All Transit. See PAPERWORK_TRANSPORT_STATUSES on the server.
  "PAPERWORK_PENDING",
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
      className="inline-block whitespace-nowrap rounded px-2 py-0.5 text-[13px] font-semibold"
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
  const [driverModal, setDriverModal] = useState(null);
  // Load id currently being transferred, so its own button says so.
  const [transferring, setTransferring] = useState(null);

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
    enabled: !openRow && !saving && !statusModal && !driverModal && !transferring,
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

  // ── Transfer to Invoiceable ────────────────────────────────────────────────
  // The paperwork review, from the list. It posts the same approval the load's
  // Documents tab does rather than setting the status directly — approving IS
  // the move, and the server refuses Invoiceable from the status route outright
  // (see USE_PAPERWORK_APPROVAL). One rule, enforced in one place, reachable
  // from wherever the person happens to be standing.
  //
  // A missing document names itself in the confirmation rather than stopping
  // it. The office decides whether a load can be billed; holding one out of
  // accounting over a document the customer kept is money nobody is chasing.
  // What they are waiving is said out loud, and the server records it against
  // the approval — see reviewPaperwork.
  //
  // This list is as old as the last refresh, so the server works out what is
  // missing again on arrival and refuses a short load unless `override` says
  // somebody was shown the list and said yes.
  const transferToInvoiceable = async (row) => {
    const missing = missingPaperwork(row);
    const short = missing.length > 0;

    const { isConfirmed, value } = await Swal.fire({
      title: short
        ? `Transfer ${row.loadId} without every document?`
        : `Transfer ${row.loadId} to Invoiceable?`,
      icon: short ? "warning" : undefined,
      html:
        (short
          ? '<p style="font-size:13px;color:#b91c1c;text-align:left;margin:0 0 10px">' +
            `Still missing: <b>${missing.join(", ")}</b>. Approving anyway is ` +
            "recorded against the load.</p>"
          : "") +
        '<p style="font-size:13px;color:#4b5563;text-align:left;margin:0 0 10px">' +
        "This approves the load's paperwork. It leaves the Over tab for " +
        "Accounting, and its documents are locked — the driver will not be able " +
        "to change them.</p>",
      input: "textarea",
      inputPlaceholder: "Optional note for the record…",
      inputAttributes: { rows: 3 },
      showCancelButton: true,
      confirmButtonText: short ? "Transfer anyway" : "Transfer",
      confirmButtonColor: short ? "#d97706" : "#16a34a",
    });

    if (!isConfirmed) return;

    setTransferring(row.loadId);
    try {
      const res = await api.post(`/loads/${row.loadId}/paperwork/review`, {
        decision: "APPROVE",
        note: value || "",
        override: short,
      });
      toast.success(res.data?.message || "Transferred to Invoiceable");
      await fetchLoads();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Transfer failed");
    } finally {
      setTransferring(null);
    }
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
    { key: "pickupDate",   header: "Pickup Date",   width: "110px", render: (row) => <DateCell value={pickupDateOf(row)} time={pickupWindowOf(row)} /> },
    { key: "deliveryDate", header: "Delivery Date", width: "110px", render: (row) => <DateCell value={dropDateOf(row)} time={dropWindowOf(row)} /> },
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

        {/* Only where the load is parked rather than done. Offering it on a
            delivered or terminated load would be offering to send somebody to
            collect a box that is not there. */}
        {assigned && AWAITING_A_DRIVER.includes(row.transportStatus) && (
          <button
            onClick={() => setDriverModal(row)}
            disabled={saving}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 transition disabled:opacity-50 whitespace-nowrap"
          >
            Assign another driver
          </button>
        )}

        {/* Only on the loads that are actually waiting to be billed. On a
            terminated or street-turned load there is nothing to approve. */}
        {canTransferToInvoiceable(row) && (
          <button
            onClick={() => transferToInvoiceable(row)}
            disabled={saving || !!transferring}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:border-green-300 transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {transferring === row.loadId ? "Transferring…" : "Transfer to Invoiceable"}
          </button>
        )}

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
          Finished loads — delivered, waiting on paperwork, terminated,
          street-turned, in the yard or dropped at a warehouse, earliest
          delivery date first
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
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[12px] font-bold ${
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

                <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
                  {[
                    ["Origin", [row.pickup?.city, row.pickup?.state].filter(Boolean).join(", ")],
                    ["Destination", [row.drop?.city, row.drop?.state].filter(Boolean).join(", ")],
                    ["Pickup Date", withWindow(fmtDate(pickupDateOf(row)), pickupWindowOf(row))],
                    ["Delivery Date", withWindow(fmtDate(dropDateOf(row)), dropWindowOf(row))],
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
                      <div className="flex flex-wrap gap-2">
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
                        {canTransferToInvoiceable(row) && (
                          <button
                            onClick={() => transferToInvoiceable(row)}
                            disabled={saving || !!transferring}
                            className="w-full py-1.5 text-xs font-semibold rounded-lg border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition disabled:opacity-50"
                          >
                            {transferring === row.loadId
                              ? "Transferring…"
                              : "Transfer to Invoiceable"}
                          </button>
                        )}
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

      <AssignDriversDialog
        open={Boolean(driverModal)}
        load={driverModal}
        fleetOwnerId={carrierIdOnLoad(driverModal)}
        onClose={() => setDriverModal(null)}
        onSaved={async () => {
          setDriverModal(null);
          await fetchLoads();
        }}
      />

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
