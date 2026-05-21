import React, { useState, useEffect } from "react";
import LoadTable from "../../components/LoadTable";
import MobileCard from "../../components/MobileCard";
import api from "../../api";
import { useNavigate } from "react-router-dom";

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

const AssignedLoad = () => {
  const [data, setData] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchAssignedData = async () => {
    try {
      const res = await api.get("/fleet-owners/assignedLoad");
      setData(res.data);
    } catch (error) {
      setError(error.response?.data?.message || error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignedData();
  }, []);

  const confirmRide = async (loadId) => {
    try {
      await api.put(`/loads/assignedLoad/${loadId}/confirm`);
      fetchAssignedData();
    } catch (error) {
      alert(error.response?.data?.message || error.message);
    }
  };

  // ── Desktop columns ──────────────────────────────────────────
  const columns = [
    {
      key: "load",
      header: "Load",
      width: "130px",
      render: (row) => (
        <LoadIdCell
          load={row}
          onClick={() => navigate(`/fleetOwner/track-load/${row.loadId}`)}
        />
      ),
    },
    {
      key: "customer",
      header: "Customer",
      width: "170px",
      render: (row) => <CustomerCell load={row} />,
    },
    {
      key: "pickup",
      header: "Pickup",
      render: (row) => <AddressCell data={row.pickup} />,
    },
    {
      key: "drop",
      header: "Drop",
      render: (row) => <AddressCell data={row.drop} />,
    },
    {
      key: "truckType",
      header: "Truck",
      width: "100px",
      render: (row) => (
        <span className="text-xs font-medium">{row.truckType || "—"}</span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      width: "120px",
      render: (row) => (
        <span className="text-xs font-semibold text-green-700">
          $ {row.amount?.toLocaleString()}
        </span>
      ),
    },
    {
      key: "lastFreeDate",
      header: "Last Free Date",
      width: "120px",
      render: (row) => <DateCell value={row.lastFreeDate} />,
    },
    {
      key: "status",
      header: "Status",
      width: "130px",
      render: (row) => <StatusBadge value={row.transportStatus} />,
    },
    {
      key: "action",
      header: "Action",
      width: "160px",
      render: (row) =>
        row.transportStatus === "ASSIGNED" ? (
          <button
            onClick={() => confirmRide(row.loadId)}
            className="bg-green-800 hover:bg-green-900 text-white px-3 py-1 rounded text-xs font-semibold"
          >
            Confirm
          </button>
        ) : (
          <span className="text-green-700 text-xs font-semibold">
            Confirmed ✓
          </span>
        ),
    },
  ];

  // ── Mobile badge helper ──────────────────────────────────────
  const mobileBadge = (status) => {
    const map = {
      ASSIGNED:  { label: "📦 Assigned" },
      CONFIRMED: { label: "✓ Confirmed" },
    };
    return map[status] ?? { label: status };
  };

  if (error) {
    return <div className="p-5 text-red-600 font-medium">{error}</div>;
  }

  return (
    <div className="p-4 md:p-5">
      {/* Page header (mobile only) */}
      <div className="xl:hidden mb-4">
        <h2 className="text-lg font-bold text-gray-900">Assigned Loads</h2>
        <p className="text-sm text-gray-500">Loads assigned to your company</p>
      </div>

      {/* 📱 Mobile */}
      <div className="block xl:hidden space-y-3">
        {loading ? (
          <p className="text-center text-gray-500 py-10">Loading...</p>
        ) : data.length > 0 ? (
          data.map((row) => (
            <MobileCard
              key={row.loadId}
              statusKey={row.transportStatus}
              title={row.loadId}
              subtitle={row.customerName || "—"}
              badge={mobileBadge(row.transportStatus)}
              locations={[
                { label: "Pickup", data: row.pickup },
                { label: "Drop",   data: row.drop },
              ]}
              fields={[
                { label: "Truck Type",     value: row.truckType },
                { label: "Amount",         value: row.amount ? `$ ${row.amount.toLocaleString()}` : null },
                { label: "Last Free Date", value: fmtDate(row.lastFreeDate) },
              ]}
      actions={
  row.transportStatus === "ASSIGNED"
    ? [
        {
          label: "✓ Confirm",
          color: "#16a34a",   // same green family as "✓ Verify"
          onClick: () => confirmRide(row.loadId),
        },
        {
          label: "👁 View",
          color: "#f97316",   // consistent blue, not gray
          onClick: () => navigate(`/fleetOwner/track-load/${row.loadId}`),
        },
      ]
    : [
        {
          label: "👁 View",
          color: "#f97316",
          onClick: () => navigate(`/fleetOwner/track-load/${row.loadId}`),
        },
      ]
}
            />
          ))
        ) : (
          <p className="text-center text-gray-500 py-10">
            No assigned loads found.
          </p>
        )}
      </div>

      {/* 💻 Desktop */}
      <div className="hidden xl:block">
        <LoadTable
          loads={data}
          columns={columns}
          loading={loading}
          colorBy="transportStatus"
          emptyMessage="No assigned loads found."
          title="Assigned Loads"
          subtitle="Loads assigned to your company"
        />
      </div>
    </div>
  );
};

export default AssignedLoad;