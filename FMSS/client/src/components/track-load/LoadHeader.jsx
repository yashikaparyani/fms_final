import EditIcon from "@mui/icons-material/Edit";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import SearchIcon from "@mui/icons-material/Search";
import TimelineIcon from "@mui/icons-material/Timeline";

import Card from "./Card";
import MetaBadge from "./MetaBadge";
import StatusChip, {
  LOAD_STATUS_COLOR,
  TRANSPORT_STATUS_COLOR,
} from "./StatusChip";

const fmtFull = (v) =>
  v
    ? new Date(v).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const LoadHeader = ({
  load,
  userRole,
  onUpdateStatus,
  onEditLoad,
  onRebid,
  searchId,
  setSearchId,
  handleSearch,
}) => {
  // Admin/staff can edit any load; clients only before it's verified.
  const canEditLoad =
    ["admin", "staff"].includes(userRole) ||
    (userRole === "client" &&
      ["DRAFT", "PENDING_VERIFICATION", "REQUIRES_CHANGES"].includes(load.status));

  return (
  <Card>
    {/* ───────────────── HEADER ───────────────── */}
    <div className="p-4 md:p-6 space-y-4">

      {/* 🔹 Top Row */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

        {/* Identity */}
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center shadow-inner">
            <LocalShippingIcon className="text-indigo-600" />
          </div>

          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-900 truncate">
              {load.loadId}
            </h2>
            {load.refNo && (
              <p className="text-xs text-gray-400 font-semibold">
                REF# {load.refNo}
              </p>
            )}
          </div>
        </div>

        {/* Status + Action */}
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip value={load.status} map={LOAD_STATUS_COLOR} />
          <StatusChip
            value={load.transportStatus}
            map={TRANSPORT_STATUS_COLOR}
          />

          {canEditLoad && (
            <button
              onClick={onEditLoad}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-indigo-600 border border-indigo-600 rounded-lg text-white hover:bg-indigo-700 transition"
            >
              <EditIcon fontSize="inherit" />
              Edit Load
            </button>
          )}

          {["staff", "admin"].includes(userRole) && (
            <div className="flex gap-2">
              <button
                onClick={onUpdateStatus}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 hover:border-indigo-300 hover:text-indigo-600 transition"
              >
                <EditIcon fontSize="inherit" />
                Update
              </button>

              {load.status === "ASSIGNED" && (
                <button
                  onClick={() => onRebid && onRebid(load)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-red-50 border border-red-100 rounded-lg text-red-600 hover:bg-red-100 hover:border-red-200 transition"
                >
                  <TimelineIcon fontSize="inherit" style={{ fontSize: '14px' }} />
                  Re-bid
                </button>
              )}
            </div>
          )}
        </div>
      </div>


    </div>

    {/* ───────────────── META ───────────────── */}
    <div className="flex flex-wrap border-t border-gray-100 bg-gray-50/40">
      <MetaBadge label="Customer" value={load.customerName} />
      <MetaBadge label="Container #" value={load.containerNo} />
      <MetaBadge label="Booking #" value={load.bookingNo} />
      <MetaBadge label="Shipping Line" value={load.shippingLine} />
      <MetaBadge label="Created By" value={load.createdBy} />
      <MetaBadge label="Last Updated" value={fmtFull(load.updatedAt)} />
    </div>
  </Card>
  );
};

export default LoadHeader;