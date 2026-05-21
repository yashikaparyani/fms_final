import { useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useNotifications } from "./useNotifications";

// ── Colour mapping per notification type ──────────────────────────────────────
const TYPE_STYLE = {
  LOAD_CREATED:           { dot: "#1565c0", pill: "bg-blue-100 text-blue-800" },
  BIDDING_SCHEDULED:      { dot: "#2e7d32", pill: "bg-green-100 text-green-800" },
  BIDDING_OPENED:         { dot: "#2e7d32", pill: "bg-green-100 text-green-800" },
  BIDDING_CLOSED:         { dot: "#616161", pill: "bg-gray-100 text-gray-700" },
  BID_WON:                { dot: "#00695c", pill: "bg-teal-100 text-teal-800" },
  BID_LOST:               { dot: "#c62828", pill: "bg-red-100 text-red-800" },
  BID_NOT_PLACED:         { dot: "#616161", pill: "bg-gray-100 text-gray-700" },
  LOAD_REQUIRES_CHANGES:  { dot: "#e65100", pill: "bg-orange-100 text-orange-800" },
  LOAD_VERIFIED:          { dot: "#00695c", pill: "bg-teal-100 text-teal-800" },
  LOAD_STATUS_CHANGED:    { dot: "#1565c0", pill: "bg-blue-100 text-blue-800" },
};

const getStyle = (type) =>
  TYPE_STYLE[type] || { dot: "#888", pill: "bg-gray-100 text-gray-600" };

const relativeTime = (date) => {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

// ═════════════════════════════════════════════════════════════════════════════
// NotificationBell — drop-in replacement for the <span> in Topbar
// ═════════════════════════════════════════════════════════════════════════════
const NotificationBell = ({ isOpen, onToggle }) => {
  const navigate    = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const dropdownRef = useRef(null);
  const {
    notifications,
    unreadCount,
    loading,
    hasMore,
    refresh,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    loadMore,
  } = useNotifications();

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        if (isOpen) onToggle();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, onToggle]);

  const handleBellClick = () => {
    if (!isOpen) refresh();
    onToggle();
  };

  const getRedirectPath = (notification) => {
    const userRole = user?.role;
    const notifType = notification.type;

    // Staff/Admin notifications
    if (userRole === "staff" || userRole === "admin") {
      if (notifType === "LOAD_CREATED" || notifType === "LOAD_REQUIRES_CHANGES") {
        return "/staff/pending-loads";
      }
      return "/staff/dashboard";
    }

    // FleetOwner notifications
    if (userRole === "fleetOwner") {
      if (notifType === "BIDDING_SCHEDULED" || notifType === "BIDDING_OPENED") {
        return "/fleetOwner/available-bids";
      }
      if (notifType === "BID_WON") {
        return "/fleetOwner/assigned-loads";
      }
      return "/fleetOwner/dashboard";
    }

    // Client notifications
    if (userRole === "client") {
      if (notification.loadId) {
        return `/client/bids/${notification.loadId}`;
      }
      return "/client/my-loads";
    }

    return "/";
  };

  const handleItemClick = async (n) => {
    if (!n.isRead) await markAsRead(n._id);
    onToggle();
    const path = getRedirectPath(n);
    navigate(path);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* ── Bell button (mirrors your existing span style) ── */}
      <span
        onClick={handleBellClick}
        className="hover:bg-gray-100 border-gray-200 border-r-2 cursor-pointer flex justify-center items-center w-10 h-10 relative"
      >
        <NotificationsNoneOutlinedIcon />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center min-w-[16px] h-4 px-[3px] rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </span>

      {/* ── Dropdown panel ── */}
      {isOpen && (
        <div className="absolute right-0 top-[calc(100%+8px)] w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-gray-100 z-50 flex flex-col overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-[11px] font-semibold bg-red-500 text-white rounded-full px-2 py-0.5">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-[420px]">
            {notifications.length === 0 && !loading ? (
              <div className="py-12 text-center text-sm text-gray-400">
                <NotificationsNoneOutlinedIcon className="text-gray-300 mb-2" style={{ fontSize: 36 }} />
                <p>No notifications yet</p>
              </div>
            ) : (
              <>
                {notifications.map((n) => {
                  const s = getStyle(n.type);
                  return (
                    <div
                      key={n._id}
                      onClick={() => handleItemClick(n)}
                      className={`flex gap-3 px-4 py-3 border-b border-gray-50 cursor-pointer transition-colors group
                        ${n.isRead ? "hover:bg-gray-50" : "bg-blue-50/40 hover:bg-blue-50"}`}
                    >
                      {/* Dot */}
                      <div className="pt-1 shrink-0">
                        <div
                          className="w-2 h-2 rounded-full mt-1"
                          style={{ background: n.isRead ? "#d1d5db" : s.dot }}
                        />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-[13px] leading-snug mb-0.5 ${n.isRead ? "font-normal text-gray-700" : "font-medium text-gray-900"}`}>
                          {n.title}
                        </p>
                        <p className="text-xs text-gray-500 leading-relaxed mb-1.5 line-clamp-2">
                          {n.message}
                        </p>
                        <div className="flex items-center gap-2">
                          {n.loadId && (
                            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${s.pill}`}>
                              {n.loadId}
                            </span>
                          )}
                          <span className="text-[11px] text-gray-400">
                            {relativeTime(n.createdAt)}
                          </span>
                        </div>
                      </div>

                      {/* Delete */}
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteNotification(n._id); }}
                        aria-label="Delete notification"
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500 self-start mt-0.5"
                      >
                        <DeleteOutlineIcon style={{ fontSize: 16 }} />
                      </button>
                    </div>
                  );
                })}

                {hasMore && (
                  <div className="p-3 text-center">
                    <button
                      onClick={loadMore}
                      disabled={loading}
                      className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-4 py-1.5 transition-colors disabled:opacity-50"
                    >
                      {loading ? "Loading…" : "Load more"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;