import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import api from "../api";
import LoadTable from "../components/LoadTable";
import MobileCard from "../components/MobileCard";
import AppSelect from "../components/AppSelect";
import { uiStyles } from "../style/uiStyles";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import { useDispatchActions } from "../hooks/useDispatchActions";

const { LoadIdCell, CustomerCell, AddressCell, DateCell, StatusBadge } =
  LoadTable;

const StaffLoadsPage = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const role = JSON.parse(localStorage.getItem("user") || "{}")?.role || "staff";
  const dateParam = params.get("date"); // YYYY-MM-DD — filter to a single day
  const lfdParam = params.get("lfd"); // expired | today | upcoming
  const pickupDayParam = params.get("pickupDay"); // today | tomorrow
  const accessorialParam = params.get("accessorial") === "true";
  const unassignedParam = params.get("unassigned") === "true";
  // Dashboard tiles count verified loads only, so a drill-down opened from one
  // passes `status` through — without it the list would show more rows than the
  // number the user just clicked.
  const statusParam = params.get("status");
  const transportStatus = params.get("transportStatus") || "LOAD_PLANNER";
  // When filtering by a specific day, pull every load and narrow client-side.
  const fetchStatus = dateParam ? "All" : transportStatus;

  // `silent` swaps the rows in without raising the spinner, so the background
  // refresh does not flash the table every tick.
  const fetchLoads = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      // The LFD, pickup-day, accessorial and unassigned buckets carry their own
      // status scoping server-side, so each is requested on its own — mixing in
      // a transport-status tab would return a subset of the dashboard tile the
      // user just clicked.
      const query = lfdParam
        ? { lfd: lfdParam, tz }
        : pickupDayParam
          ? { pickupDay: pickupDayParam, tz }
          : accessorialParam
            ? { accessorial: "true" }
            : unassignedParam
              ? { unassigned: "true" }
              : { transportStatus: fetchStatus, ...(statusParam && { status: statusParam }) };
      const res = await api.get("/loads", { params: query });
      setRows(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const dispatch = useDispatchActions(fetchLoads);

  useEffect(() => {
    fetchLoads();
    // Refetching is driven by the active filter alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    fetchStatus,
    lfdParam,
    pickupDayParam,
    accessorialParam,
    unassignedParam,
    statusParam,
  ]);

  // Hold the refresh while an assignment picker or the scheduling modal is
  // open, so a row cannot shift or vanish mid-action.
  useAutoRefresh(() => fetchLoads({ silent: true }), {
    enabled: !dispatch.busy,
  });

  // Local YYYY-MM-DD for a load's creation date.
  const toLocalDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  };

  // Every transport status the dashboard tiles link to needs a tab here, or a
  // drill-down lands on a list with no tab of its own selected.
  const transportStatusOptions = [
    {key:"All", label:"All"},
    { key: "LOAD_PLANNER", label: "Load Planner" },
    { key: "DELIVERED", label: "Delivered" },
    { key: "IN_TRANSIT", label: "In Transit" },
    { key: "PICKED_UP", label: "Picked Up" },
    { key: "ASSIGNED", label: "Assigned" },
    { key: "READY_TO_PICKUP", label: "Ready to Pickup" },
    { key: "NEW_LOAD", label: "New Load" },
    { key: "REACHED_DESTINATION", label: "Reached Dest." },
    { key: "DRIVER_ON_WAITING", label: "Driver Waiting" },
    { key: "DROP_IN_WAREHOUSE", label: "Drop in Warehouse" },
    { key: "LOADED_IN_YARD", label: "Loaded in Yard" },
    { key: "EMPTY_IN_YARD", label: "Empty in Yard" },
    { key: "STREET_TURN", label: "Street Turn" },
    { key: "TERMINATED", label: "Terminated" },
    { key: "PAPERWORK_PENDING", label: "Paperwork Pending" },
    { key: "INVOICED", label: "Invoiced" },
  ];

  // ── Navigate to the selected tab ──────────────────────────────────────────
  // The status scoping rides along, so switching tabs keeps the list counting
  // the same population the dashboard tile did.
  const handleTabChange = (key) => {
    const query = new URLSearchParams({ transportStatus: key });
    if (statusParam) query.set("status", statusParam);
    navigate(`/${role}/loads?${query}`);
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

  // Dispatch actions only apply while a load is still waiting to move. Offering
  // "Schedule Bid" on something already picked up or delivered would be noise at
  // best and a way to re-open settled work at worst.
  const DISPATCHABLE = ["LOAD_PLANNER", "NEW_LOAD", "ASSIGNED", "READY_TO_PICKUP"];
  const isDispatchable = (row) => DISPATCHABLE.includes(row.transportStatus);

  const actions = (row) => {
    // The picker replaces the whole cell — it needs the width, and the other
    // buttons must not stay live underneath a half-finished assignment.
    if (dispatch.isPickerOpen(row)) return dispatch.desktopActions(row);

    return (
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
        {isDispatchable(row) && dispatch.desktopActions(row)}
      </div>
    );
  };

  // Loads sent back to the customer are kept out of the ordinary lists — but
  // not when they are what was explicitly asked for.
  let filteredRows =
    statusParam === "REQUIRES_CHANGES"
      ? rows
      : rows.filter((r) => r.status !== "REQUIRES_CHANGES");
  if (dateParam) {
    filteredRows = filteredRows.filter((r) => toLocalDate(r.createdAt) === dateParam);
  }

  const LFD_TITLES = {
    expired: "LFD Expired — last free date has passed",
    today: "LFD Today — last free date is today",
    upcoming: "Upcoming LFD — last free date still ahead",
  };

  const PICKUP_DAY_TITLES = {
    today: "Same Day Loads — picking up today",
    tomorrow: "Next Day Loads — picking up tomorrow",
  };

  const heading = dateParam
    ? `Loads for ${new Date(dateParam + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}`
    : lfdParam
      ? (LFD_TITLES[lfdParam] ?? `LFD — ${lfdParam}`)
      : pickupDayParam
        ? (PICKUP_DAY_TITLES[pickupDayParam] ?? `Pickup — ${pickupDayParam}`)
        : accessorialParam
          ? "Accessorial Charges — loads carrying extra charges"
          : `Load Status For — ${transportStatus.replace(/_/g, " ")}`;

  // The tabs filter by transport status, which does not apply to a day or to
  // any of the buckets — leaving them visible would imply the two combine.
  const hideTabs = Boolean(
    dateParam || lfdParam || pickupDayParam || accessorialParam,
  );

  return (
    <div className={uiStyles.page}>
      {/* Header */}
      <div className={`${uiStyles.cardHeader} flex-col md:flex-row gap-2`}>
        <h2 className="h4 text-gray-500">{heading}</h2>

        {/* Tabs (hidden when viewing a specific day or LFD bucket) */}
        <div className={`border-b border-gray-300 ${hideTabs ? "hidden" : ""}`}>
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
        <div className={`block xl:hidden flex items-center gap-2 ${hideTabs ? "hidden" : ""}`}>
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
              actions={
                dispatch.isPickerOpen(row)
                  ? []
                  : [
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
                      ...(isDispatchable(row) ? dispatch.mobileActions(row) : []),
                    ]
              }
            >
              {dispatch.mobilePicker(row)}
            </MobileCard>
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

      {dispatch.modal}
    </div>
  );
};

export default StaffLoadsPage;
