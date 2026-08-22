import { useEffect, useMemo, useState } from "react";
import api from "../../api";
import LoadTable from "../../components/LoadTable";
import MobileCard from "../../components/MobileCard";
import { LfdCell, UrgencyBadge } from "../../components/UrgencyCells";
import LoadColorModeToggle from "../../components/LoadColorModeToggle";
import {
  STATUS_ROW_COLORS,
  rowColorFor,
  useLoadColorMode,
  STATUS_LABEL,
} from "../../utils/loadColorMode";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import {
  useDispatchActions,
  getAssignedName,
  getAssignedCode,
} from "../../hooks/useDispatchActions";
import UnassignedNote from "../../components/UnassignedNote";
import {
  URGENCY_COLORS,
  URGENCY_LABEL,
  dropDateOf,
  isLfdAlarming,
  pickupDateOf,
  sortByPickupDate,
} from "../../utils/loadUrgency";

const { LoadIdCell, CustomerCell, AddressCell, StatusBadge, DateCell, fmtDate } =
  LoadTable;

// ─── Carrier Cell (desktop) ───────────────────────────────────────────────────
const CarrierCell = ({ load, fleetOwners }) => {
  const assignedName = getAssignedName(load, fleetOwners);
  if (assignedName) {
    const code = getAssignedCode(load, fleetOwners);
    return (
      <div className="flex items-start gap-1.5">
        <span className="w-2 h-2 rounded-full bg-green-600 flex-shrink-0 mt-1" />
        <div className="leading-tight">
          <span className="text-xs font-bold text-green-800">{assignedName}</span>
          {code && (
            <div className="text-[10px] font-mono text-gray-500">{code}</div>
          )}
        </div>
      </div>
    );
  }
  return <span className="text-xs text-gray-400 italic">Not assigned</span>;
};

// ═══════════════════════════════════════════════════════════════════════════════
const VerifiedLoadsTable = () => {
  // Priority or status tint — a per-person choice, remembered.
  const [colorMode, setColorMode, isStatusMode] = useLoadColorMode();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const sortedRows = useMemo(() => sortByPickupDate(rows), [rows]);

  // `silent` leaves the spinner alone so the background refresh is invisible.
  const fetchLoads = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get("/loads?status=VERIFIED");
      setRows(res.data);
    } catch (err) {
      console.error("Failed to fetch loads:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const dispatch = useDispatchActions(fetchLoads);

  useEffect(() => {
    fetchLoads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hold the refresh while an assignment picker or the scheduling modal is
  // open, so a row cannot shift or vanish mid-action.
  useAutoRefresh(() => fetchLoads({ silent: true }), {
    enabled: !dispatch.busy,
  });

  // ── Desktop columns ──────────────────────────────────────────
  const columns = [
    {
      key: "load",
      header: "Load",
      width: "130px",
      render: (row) => <LoadIdCell load={row} />,
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
      return (
        <div className="leading-tight">
          <StatusBadge value={row.bidStatus} />
          <UnassignedNote load={row} />
        </div>
      );
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
      render: (row) => <>{dispatch.desktopActions(row)}</>,
    },
  ];

  return (
    <div className="p-4 md:p-5">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-900">Dispatch Management</h2>
        <p className="text-sm text-gray-500">
          Loads cleared for bidding, earliest pickup first
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
            const assignedName = getAssignedName(row, dispatch.fleetOwners);
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
                  { label: "Origin", data: row.pickup },
                  { label: "Destination", data: row.drop },
                ]}
                fields={[
                  { label: "Load Type", value: row.truckType },
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
                actions={dispatch.mobileActions(row)}
              >
                {dispatch.mobilePicker(row)}
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
          colorBy={isStatusMode ? "transportStatus" : "urgency"}
          colorMap={isStatusMode ? STATUS_ROW_COLORS : URGENCY_COLORS}
          loading={loading}
          emptyMessage="No loads ready for dispatch."
        />
      </div>

      {dispatch.modal}
    </div>
  );
};

export default VerifiedLoadsTable;
