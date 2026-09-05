import EditIcon from "@mui/icons-material/Edit";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import SearchIcon from "@mui/icons-material/Search";
import TimelineIcon from "@mui/icons-material/Timeline";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

import Card from "./Card";
import MetaBadge from "./MetaBadge";
import {
  isAssignedToCarrier,
  STATUS_LOCKED_REASON,
} from "../../utils/loadAssignment";
import StatusChip, {
  LOAD_STATUS_COLOR,
  TRANSPORT_STATUS_COLOR,
} from "./StatusChip";
import { formatDateTime } from "../../utils/dates";

const fmtFull = (v) =>
  v
    ? formatDateTime(v)
    : "—";

const LoadHeader = ({
  load,
  userRole,
  onUpdateStatus,
  onEditLoad,
  onDeleteLoad,
  onRebid,
  searchId,
  setSearchId,
  handleSearch,
}) => {
  // The status control is dead until a carrier has the load — the status is a
  // statement about a carrier, and there is nobody for it to be about yet.
  const statusUnlocked = isAssignedToCarrier(load);

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
                disabled={!statusUnlocked}
                title={statusUnlocked ? undefined : STATUS_LOCKED_REASON}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 hover:border-indigo-300 hover:text-indigo-600 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700"
              >
                <EditIcon fontSize="inherit" />
                Update
              </button>

              {/* Admin only, and only while the load can still honestly be
                  deleted. Once a carrier is on it the load has documents, an
                  audit trail and a settlement hanging off it — the server
                  refuses those outright, so offering the button would only
                  produce an error. Terminate is the way to end one of those. */}
              {userRole === "admin" && !statusUnlocked && (
                <button
                  onClick={() => onDeleteLoad && onDeleteLoad(load)}
                  title="Delete this load"
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-red-600 border border-red-600 rounded-lg text-white hover:bg-red-700 transition"
                >
                  <DeleteOutlineIcon fontSize="inherit" style={{ fontSize: "14px" }} />
                  Delete
                </button>
              )}

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