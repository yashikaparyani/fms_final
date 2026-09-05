import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PlaceIcon from "@mui/icons-material/Place";
import RefreshIcon from "@mui/icons-material/Refresh";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import SignalWifiOffIcon from "@mui/icons-material/SignalWifiOff";
import api from "../../api";
import LeafletMap from "../../components/LeafletMap";
import { uiStyles } from "../../style/uiStyles";
import { notify } from "../../utils/swal";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { formatDateTime } from "../../utils/dates";

// ─── Where my drivers are ─────────────────────────────────────────────────────
// The carrier's own fleet on one map, built from the position reports the
// drivers' phones already send while running a trip.
//
// The distinction the page is built around is live versus last-known. A driver
// who stopped their trip yesterday still has a position, and showing it the same
// way as a truck currently moving is how a dispatcher ends up routing to a yard
// the truck left. Live trucks are pinned, sorted first, and labelled; everything
// else is explicitly "last seen".
// ─────────────────────────────────────────────────────────────────────────────

const relativeTime = (value) => {
  if (!value) return "never";

  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
};

const DriverLocations = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const fetchLocations = useCallback(async ({ silent = false } = {}) => {
    try {
      const { data } = await api.get("/drivers/locations");
      setRows(data);
    } catch (err) {
      if (!silent) {
        notify.error(err.response?.data?.message || "Could not load driver locations");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  // Positions go stale on their own — a page showing a truck where it was ten
  // minutes ago is worse than one that says so, so it refreshes itself.
  useAutoRefresh(() => fetchLocations({ silent: true }));

  const points = useMemo(
    () =>
      rows
        .filter((row) => row.location)
        .map((row) => ({
          latitude: row.location.latitude,
          longitude: row.location.longitude,
          role: row.isLive ? "live" : "stop",
          label: row.driver.name,
          note: row.isLive
            ? `On ${row.load?.loadId || "a load"} · ${relativeTime(row.location.recordedAt)}`
            : `Last seen ${relativeTime(row.location.recordedAt)}`,
        })),
    [rows],
  );

  const liveCount = rows.filter((r) => r.isLive).length;
  const neverSeen = rows.filter((r) => !r.location).length;

  return (
    <div className={uiStyles.page}>
      <div className={`${uiStyles.cardHeader} flex-col md:flex-row gap-3`}>
        <div>
          <h1 className="page-title">Driver locations</h1>
          <p className="page-subtitle">
            {liveCount > 0
              ? `${liveCount} of ${rows.length} drivers on a live trip right now.`
              : "No drivers are on a live trip at the moment — showing last known positions."}
          </p>
        </div>
        <button
          onClick={() => fetchLocations()}
          className="btn-secondary whitespace-nowrap"
        >
          <RefreshIcon fontSize="small" /> Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-20 text-sm">Loading…</p>
      ) : rows.length === 0 ? (
        <div className={uiStyles.card}>
          <p className="text-sm text-gray-600">
            No drivers with app logins yet. Add drivers with an email address and
            they get their own login — their position shows here once they start a
            trip.
          </p>
          <button
            onClick={() => navigate("/fleetOwner/drivers")}
            className="btn-primary mt-3"
          >
            Go to Drivers
          </button>
        </div>
      ) : (
        <>
          {points.length > 0 ? (
            <div className={uiStyles.card}>
              {/* connect=false: these are unrelated trucks, not one journey. */}
              <LeafletMap points={points} height={380} connect={false} />
            </div>
          ) : (
            <div className={uiStyles.card}>
              <p className="text-sm text-gray-600">
                None of your drivers has reported a position yet. A driver's
                location appears once they start live tracking on a trip from the
                app.
              </p>
            </div>
          )}

          <div className="space-y-2">
            {rows.map((row) => {
              const isSelected = selected === row.driver._id;

              return (
                <div
                  key={row.driver._id}
                  onClick={() => setSelected(isSelected ? null : row.driver._id)}
                  className={`border rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
                    row.isLive
                      ? "border-green-300 bg-green-50/50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[12rem]">
                      <p className="text-sm font-medium text-gray-900">
                        {row.driver.name}
                        <span className="ml-2 text-[11px] font-mono text-gray-400">
                          {row.driver.driverCode}
                        </span>
                      </p>
                      <p className="text-xs text-gray-500">
                        {row.driver.phone || row.driver.email || "—"}
                      </p>
                    </div>

                    {row.load ? (
                      <div className="text-xs">
                        <p className="font-semibold text-indigo-700">
                          {row.load.loadId}
                        </p>
                        <p className="text-gray-500">
                          {[row.load.pickupCity, row.load.dropCity]
                            .filter(Boolean)
                            .join(" → ") || "—"}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">No trip</span>
                    )}

                    {row.isLive ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                        <LocalShippingOutlinedIcon style={{ fontSize: 13 }} />
                        LIVE
                      </span>
                    ) : row.location ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                        <PlaceIcon style={{ fontSize: 13 }} />
                        Last seen {relativeTime(row.location.recordedAt)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        <SignalWifiOffIcon style={{ fontSize: 13 }} />
                        Never reported
                      </span>
                    )}
                  </div>

                  {isSelected && row.location && (
                    <div className="mt-2 pt-2 border-t border-gray-200 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div>
                        <p className="text-[10px] uppercase text-gray-400">Position</p>
                        <p className="font-mono text-gray-700">
                          {row.location.latitude.toFixed(4)},{" "}
                          {row.location.longitude.toFixed(4)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-gray-400">Speed</p>
                        <p className="text-gray-700">
                          {row.location.speed != null
                            ? `${Math.round(row.location.speed * 2.237)} mph`
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-gray-400">Battery</p>
                        <p className="text-gray-700">
                          {row.location.batteryLevel != null
                            ? `${Math.round(row.location.batteryLevel * 100)}%`
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-gray-400">Reported</p>
                        <p className="text-gray-700">
                          {formatDateTime(row.location.recordedAt)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {neverSeen > 0 && (
            <p className="text-xs text-gray-500">
              {neverSeen} driver{neverSeen === 1 ? " has" : "s have"} never reported
              a position. They need to start a trip from the app before one appears.
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default DriverLocations;
