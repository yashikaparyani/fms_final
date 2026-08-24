import { useEffect, useMemo, useState } from "react";
import PlaceIcon from "@mui/icons-material/Place";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import SignalWifiOffIcon from "@mui/icons-material/SignalWifiOff";
import LeafletMap from "../LeafletMap";
import api from "../../api";

// ─── One carrier's fleet, from the office ─────────────────────────────────────
// The same positions the carrier sees on their own Driver Locations page, on the
// office's copy of their file. The office answers "where is this carrier's truck"
// more often than the carrier does, and having to ring them to find out is not a
// dispatch system.
//
// Read-only, and reusing the carrier's own endpoint — `/drivers/locations`
// already accepts a fleetOwnerId from staff and admin, and refuses one from a
// carrier, so there is nothing to add server-side and no second rule that could
// disagree with the first.
//
// Live versus last-known is the distinction the whole thing turns on: a driver
// who ended their trip yesterday still has a position, and showing it like a
// truck that is moving is how somebody routes to a yard the truck has left.
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

const CarrierDriverLocations = ({ fleetOwnerId }) => {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!fleetOwnerId) return;

    let cancelled = false;

    api
      .get("/drivers/locations", { params: { fleetOwnerId } })
      .then(({ data }) => !cancelled && setRows(data || []))
      .catch(
        (err) =>
          !cancelled &&
          setError(
            err?.response?.data?.message || "Could not load driver locations.",
          ),
      );

    return () => {
      cancelled = true;
    };
  }, [fleetOwnerId]);

  const points = useMemo(
    () =>
      (rows || [])
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

  if (error) {
    return <p className="text-sm font-medium text-red-600">{error}</p>;
  }

  if (rows === null) {
    return <p className="text-sm text-gray-500">Loading positions…</p>;
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
        This carrier has no drivers with app logins, so there are no positions to
        show. A driver needs an email address to get a login.
      </p>
    );
  }

  const liveCount = rows.filter((r) => r.isLive).length;

  return (
    <>
      <p className="text-xs text-gray-500 mb-3">
        {liveCount > 0
          ? `${liveCount} of ${rows.length} drivers on a live trip right now.`
          : "No drivers on a live trip — showing last known positions."}
      </p>

      {points.length > 0 ? (
        <div className="mb-3">
          {/* connect=false: these are unrelated trucks, not one journey. */}
          <LeafletMap points={points} height={320} connect={false} />
        </div>
      ) : (
        <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 mb-3">
          None of this carrier's drivers has reported a position yet. One appears
          once a driver starts live tracking on a trip from the app.
        </p>
      )}

      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.driver._id}
            className={`flex flex-wrap items-center gap-3 border rounded-lg px-3 py-2.5 ${
              row.isLive ? "border-green-300 bg-green-50/50" : "border-gray-200"
            }`}
          >
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
                <p className="font-semibold text-indigo-700">{row.load.loadId}</p>
                <p className="text-gray-500">
                  {[row.load.pickupCity, row.load.dropCity].filter(Boolean).join(" → ") ||
                    "—"}
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
        ))}
      </div>
    </>
  );
};

export default CarrierDriverLocations;
