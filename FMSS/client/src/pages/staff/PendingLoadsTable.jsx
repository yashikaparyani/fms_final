import { useEffect, useState } from "react";
import api from "../../api";
import LoadTable from "../../components/LoadTable";
import MobileCard from "../../components/MobileCard";
import Swal from "sweetalert2";
import { notify } from "../../utils/swal";

const { LoadIdCell, CustomerCell, AddressCell, DateCell } = LoadTable;

const fmtDate = (v) =>
  v ? new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;

// ── Page ──────────────────────────────────────────────────────
const PendingLoadsTable = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLoads = async () => {
      try {
        const res = await api.get("/loads?status=PENDING_VERIFICATION");
        setRows(res.data);
      } finally {
        setLoading(false);
      }
    };
    fetchLoads();
  }, []);

  const verifyLoad = async (id) => {
    const result = await Swal.fire({
      title: "Verify Load?",
      text: `Mark load ${id} as VERIFIED?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#16a34a",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "✓ Yes, Verify",
      cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return;
    try {
      await api.put(`/loads/${id}/status`, { status: "VERIFIED" });
      setRows((prev) => prev.filter((r) => r.loadId !== id));
      notify.success(`Load ${id} verified successfully!`);
    } catch {
      notify.error("Failed to verify load. Please try again.");
    }
  };

  const requestChanges = async (id) => {
    const result = await Swal.fire({
      title: "Request Changes",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#f97316",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "↺ Send Request",
      cancelButtonText: "Cancel",
      html: `
        <p style="font-size:13px;color:#6b7280;margin-bottom:12px;">
          Describe what changes are required for load <strong>${id}</strong>.
          This message will be sent to the client. If automated email is disabled, they will receive an in-app notification.
        </p>
        <textarea
          id="swal-changes-note"
          placeholder="e.g. Please update the pickup address and correct the container number..."
          rows="4"
          style="
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            font-size: 13px;
            color: #111827;
            resize: vertical;
            outline: none;
            box-sizing: border-box;
            font-family: inherit;
            line-height: 1.5;
          "
        ></textarea>
        <p id="swal-changes-error" style="color:#dc2626;font-size:12px;margin-top:6px;display:none;">
          Please describe the changes required before submitting.
        </p>
      `,
      preConfirm: () => {
        const note = document.getElementById("swal-changes-note").value.trim();
        if (!note) {
          document.getElementById("swal-changes-error").style.display = "block";
          return false;
        }
        return note;
      },
    });

    if (!result.isConfirmed) return;

    try {
      await api.put(`/loads/${id}/status`, {
        status: "REQUIRES_CHANGES",
        changesNote: result.value,
      });
      setRows((prev) => prev.filter((r) => r.loadId !== id));
      notify.warning(`Changes requested for load ${id}.`);
    } catch {
      notify.error("Failed to request changes. Please try again.");
    }
  };

  // ── Desktop columns ──────────────────────────────────────────
const columns = [
  { key: "load",         header: "Load",          width: "10%", render: (row) => <LoadIdCell load={row} /> },
  { key: "customer",     header: "Customer",      width: "12%", render: (row) => <CustomerCell load={row} /> },
  { key: "origin",       header: "Origin",        width: "16%", render: (row) => <AddressCell data={row.pickup} /> },
  { key: "pickupNo",     header: "Pickup #",      width: "8%",  render: (row) => <span className="text-xs font-medium text-gray-700">{row.pickupNo || "—"}</span> },
  { key: "destination",  header: "Destination",   width: "16%", render: (row) => <AddressCell data={row.drop} /> },
  { key: "truckType",    header: "Truck Type",    width: "8%",  render: (row) => <span className="text-xs text-gray-700">{row.truckType || "—"}</span> },
  { key: "refNo",        header: "Ref No",        width: "8%",  render: (row) => <span className="text-xs text-gray-700">{row.refNo || "—"}</span> },
  { key: "lastFreeDate", header: "Last Free Date",width: "8%",  render: (row) => <DateCell value={row.lastFreeDate} showExpiry /> },
  { key: "orderDate",    header: "Order Date",    width: "8%",  render: (row) => <DateCell value={row.orderBillDate} /> },
  {
    key: "actions",
    header: "Actions",
    width: "240px",
    render: (row) => actions(row),
  },
];

  const actions = (row) => (
    <div className="flex items-center gap-2 flex-nowrap">
      <button onClick={() => verifyLoad(row.loadId)} className="px-3 py-1 text-xs font-semibold whitespace-nowrap text-white bg-green-600 hover:bg-green-700 rounded transition">✓ Verify</button>
      <button onClick={() => requestChanges(row.loadId)} className="px-3 py-1 text-xs font-semibold whitespace-nowrap text-white bg-orange-500 hover:bg-orange-600 rounded transition">↺ Request Changes</button>
    </div>
  );

  return (
    <div className="p-4 md:p-5">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-900">Pending Loads</h2>
        <p className="text-sm text-gray-500">Loads awaiting verification</p>
      </div>

      {/* 📱 Mobile */}
      <div className="block xl:hidden space-y-3">
        {loading ? (
          <p className="text-center text-gray-500 py-10">Loading...</p>
        ) : rows.length > 0 ? (
          rows.map((row) => (
            <MobileCard
              key={row.loadId}
              statusKey="PENDING_VERIFICATION"
              title={row.loadId}
              subtitle={row.customerName || "—"}
              badge={{ label: "⏳ Pending" }}
              locations={[
                { label: "Origin",      data: row.pickup },
                { label: "Destination", data: row.drop },
              ]}
              fields={[
                { label: "Pickup #",       value: row.pickupNo },
                { label: "Truck Type",     value: row.truckType },
                { label: "Ref No",         value: row.refNo },
                { label: "Last Free Date", value: fmtDate(row.lastFreeDate) },
                { label: "Order Date",     value: fmtDate(row.orderBillDate) },
              ]}
              actions={[
                { label: "✓ Verify",          color: "#16a34a", onClick: () => verifyLoad(row.loadId) },
                { label: "↺ Request Changes", color: "#f97316", onClick: () => requestChanges(row.loadId) },
              ]}
            />
          ))
        ) : (
          <p className="text-center text-gray-500 py-10">No pending loads found.</p>
        )}
      </div>

      {/* 💻 Desktop */}
      <div className="hidden xl:block">
        <LoadTable
          loads={rows}
          columns={columns}
          //actions={actions}
          colorBy="status"
          loading={loading}
          emptyMessage="No pending loads found."
        />
      </div>
    </div>
  );
};

export default PendingLoadsTable;
