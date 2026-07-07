import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import api from "../api";
import LoadTable from "../components/LoadTable";
import MobileCard from "../components/MobileCard";
import AppSelect from "../components/AppSelect";
import { uiStyles } from "../style/uiStyles";

const { LoadIdCell, CustomerCell, AddressCell, DateCell, StatusBadge } =
  LoadTable;

const StaffLoadsPage = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const role = JSON.parse(localStorage.getItem("user") || "{}")?.role || "staff";
  const dateParam = params.get("date"); // YYYY-MM-DD — filter to a single day
  const transportStatus = params.get("transportStatus") || "LOAD_PLANNER";
  // When filtering by a specific day, pull every load and narrow client-side.
  const fetchStatus = dateParam ? "All" : transportStatus;

  useEffect(() => {
    const fetchLoads = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/loads?transportStatus=${fetchStatus}`);
        setRows(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchLoads();
  }, [fetchStatus]);

  // Local YYYY-MM-DD for a load's creation date.
  const toLocalDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  };

  const transportStatusOptions = [
    {key:"All", label:"All"},
    { key: "LOAD_PLANNER", label: "Load Planner" },
    { key: "DELIVERED", label: "Delivered" },
    { key: "IN_TRANSIT", label: "In Transit" },
    { key: "PICKED_UP", label: "Picked Up" },
    { key: "ASSIGNED", label: "Assigned" },
    { key: "NEW_LOAD", label: "New Load" },
    { key: "PAPERWORK_PENDING", label: "Paperwork Pending" },
    { key: "INVOICED", label: "Invoiced" },
  ];

  // ── Navigate to the selected tab ──────────────────────────────────────────
  const handleTabChange = (key) => {
    navigate(`/staff/loads?transportStatus=${key}`);
  };

  const columns = [
    {
      key: "load",
      header: "Load",
      width: "120px",
      render: (row) => (<LoadIdCell load={row} />),
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
      key: "pickupNo",
      header: "Pickup #",
      width: "100px",
      render: (row) => (
        <span className="text-xs font-medium text-gray-700">
          {row.pickupNo || "—"}
        </span>
      ),
    },
    {
      key: "refNo",
      header: "Ref No",
      width: "100px",
      render: (row) => (
        <span className="text-xs text-gray-700">{row.refNo || "—"}</span>
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
      width: "120px",
      render: (row) => <StatusBadge value={row.transportStatus} />,
    },
  ];

  const actions = (row) => (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={() =>
          row.transportStatus === "LOAD_PLANNER"
            ? navigate(`/${role}/load/status/${row.loadId}`)
            : navigate(`/${role}/load/${row.loadId}`)
        }
        className="btn-primary text-xs py-1"
      >
        {row.transportStatus === "LOAD_PLANNER" ? "Plan Load" : "Update Status"}
      </button>
      <button
        onClick={() => navigate(`/${role}/track-load/${row.loadId}`)}
        className="btn-secondary text-xs py-1"
      >
        Track
      </button>
    </div>
  );

  let filteredRows = rows.filter((r) => r.status !== "REQUIRES_CHANGES");
  if (dateParam) {
    filteredRows = filteredRows.filter((r) => toLocalDate(r.createdAt) === dateParam);
  }

  return (
    <div className={uiStyles.page}>
      {/* Header */}
      <div className={`${uiStyles.cardHeader} flex-col md:flex-row gap-2`}>
        <h2 className="h4 text-gray-500">
          {dateParam
            ? `Loads for ${new Date(dateParam + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}`
            : `Load Status For — ${transportStatus.replace(/_/g, " ")}`}
        </h2>

        {/* Tabs (hidden when viewing a specific day) */}
        <div className={`border-b border-gray-300 ${dateParam ? "hidden" : ""}`}>
          <div className="hidden xl:block ">
            {transportStatusOptions.map((tab) => {
              const isActive = transportStatus === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => handleTabChange(tab.key)}
                  className={`
                  whitespace-nowrap me-1
                  px-1 sm:px-2 py-2 text-xs md:text-sm font-medium
                  rounded-t-lg border-b-2 transition-all
                  ${
                    isActive
                      ? "bg-indigo-100 border-indigo-600 text-indigo-600"
                      : "border-transparent text-gray-500 bg-gray-200 hover:bg-indigo-50"
                  }
                `}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Select (mobile fallback / alternative filter) */}
        <div className="block xl:hidden flex items-center gap-2">
          <label className="text-sm text-gray-500">Filter:</label>
          <div className="flex-1 min-w-45">
            <AppSelect
              options={transportStatusOptions.map((s) => ({ value: s.key, label: s.label }))}
              value={transportStatus}
              onChange={handleTabChange}
              isSearchable={false}
            />
          </div>
        </div>
      </div>

      {/* 📱 MOBILE VIEW */}
      <div className="block md:hidden space-y-3">
        {loading ? (
          <p className="text-center text-gray-500 py-10">Loading...</p>
        ) : filteredRows.length > 0 ? (
          filteredRows.map((row) => (
            <MobileCard
              key={row.loadId}
              statusKey={row.transportStatus}
              title={row.loadId}
              subtitle={row.containerNo}
              badge={{ label: row.transportStatus?.replace(/_/g, " ") }}
              locations={[
                { label: "Origin", data: row.pickup },
                { label: "Destination", data: row.drop },
              ]}
              fields={[
                { label: "Customer", value: row.customerName },
                { label: "Ref No", value: row.refNo },
                { label: "Pickup #", value: row.pickupNo },
                {
                  label: "Last Free Date",
                  value: row.lastFreeDate
                    ? new Date(row.lastFreeDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "2-digit",
                        year: "numeric",
                      })
                    : null,
                },
              ]}
              actions={[
                {
                  label: "Open",
                  color: "#4338ca",
                  variant: "solid",
                  onClick: () =>
                    row.transportStatus === "LOAD_PLANNER"
                      ? navigate(`/${role}/load/status/${row.loadId}`)
                      : navigate(`/${role}/load/${row.loadId}`),
                },
                {
                  label: "Track",
                  color: "#4338ca",
                  variant: "outline",
                  onClick: () => navigate(`/${role}/track-load/${row.loadId}`),
                },
              ]}
            />
          ))
        ) : (
          <p className="text-center text-gray-500 py-10">No loads found</p>
        )}
      </div>

      {/* 💻 DESKTOP VIEW */}
      <div className="hidden md:block">
        <LoadTable
          loads={filteredRows}
          columns={columns}
          actions={actions}
          loading={loading}
          colorBy="transportStatus"
          emptyMessage="No loads found."
        />
      </div>
    </div>
  );
};

export default StaffLoadsPage;
