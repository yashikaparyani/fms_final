import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import MyLocationIcon from "@mui/icons-material/MyLocation";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import UpdateIcon from "@mui/icons-material/Update";
import api from "../../api";
import { notify } from "../../utils/swal";
import { uiStyles } from "../../style/uiStyles";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import DashboardHeader from "../../components/DashboardHeader";
import { formatDateNumeric } from "../../utils/dates";

// ─── The driver's own board ───────────────────────────────────────────────────
// A driver is a sub-account of a carrier, and the carrier's screens show the
// whole company's work. This shows one person's: the runs they were actually
// named on, each with the two ends they were given, what the load needs next,
// and the three things they can do about it — track, update, upload.
//
// Deliberately not the carrier's list with a filter on top. A driver opening the
// app at a gate wants their next run and nothing else competing with it, and
// every extra load on the screen is one more thing to read past.
// ─────────────────────────────────────────────────────────────────────────────

const fmtDate = (value) =>
  value ? formatDateNumeric(value) : "—";

const labelize = (value) =>
  value ? value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—";

// Where the load has got to, in the driver's own words.
const STATUS_TONE = {
  ASSIGNED: "bg-blue-50 border-blue-200 text-blue-900",
  READY_TO_PICKUP: "bg-amber-50 border-amber-200 text-amber-900",
  PICKED_UP: "bg-indigo-50 border-indigo-200 text-indigo-900",
  IN_TRANSIT: "bg-indigo-50 border-indigo-200 text-indigo-900",
  REACHED_DESTINATION: "bg-teal-50 border-teal-200 text-teal-900",
  DELIVERED: "bg-green-50 border-green-200 text-green-900",
};

// What the driver is expected to do next at each stage. The status names are
// the system's; this is the instruction behind them.
const NEXT_STEP = {
  ASSIGNED: "Confirm and get moving when you are ready.",
  READY_TO_PICKUP: "Start tracking, then mark picked up with a photo.",
  PICKED_UP: "On the road — keep tracking running.",
  IN_TRANSIT: "Mark reached when you get to the drop.",
  REACHED_DESTINATION: "Get the signature and mark delivered.",
  DELIVERED: "Done. Upload anything still missing.",
};

const FINISHED = ["DELIVERED", "TERMINATED", "STREET_TURN", "EMPTY_IN_YARD"];

const stopLine = (stop) =>
  [stop?.company, stop?.city, stop?.state].filter(Boolean).join(", ") || "—";

const DriverDashboard = () => {
  const navigate = useNavigate();

  const [loads, setLoads] = useState([]);
  const [compliance, setCompliance] = useState(null);
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      const [meRes, loadsRes] = await Promise.all([
        api.get("/drivers/me"),
        api.get("/drivers/me/loads"),
      ]);
      setDriver(meRes.data.driver);
      setCompliance(meRes.data.compliance);
      setLoads(loadsRes.data);
    } catch (err) {
      if (!silent) {
        notify.error(
          err.response?.data?.message || "Could not load your runs",
        );
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A dispatcher can put a load on a driver while they are looking at this
  // screen, which is exactly when they need to see it.
  useAutoRefresh(() => load({ silent: true }));

  const { running, done } = useMemo(() => {
    const isDone = (l) => FINISHED.includes(l.transportStatus);
    return {
      running: loads.filter((l) => !isDone(l)),
      done: loads.filter(isDone),
    };
  }, [loads]);

  if (loading) {
    return <p className="text-center text-gray-400 py-20 text-sm">Loading…</p>;
  }

  const licenceOk = compliance?.canDrive !== false;

  return (
    <div className={uiStyles.page}>
      <DashboardHeader
        title={driver?.name ? `Hello, ${driver.name.split(" ")[0]}` : "Your runs"}
        subtitle={`${driver?.driverCode ? `${driver.driverCode} · ` : ""}${
          running.length
            ? `${running.length} run${running.length === 1 ? "" : "s"} on you right now`
            : "Nothing on you right now"
        }`}
      />

      {/* The one thing that stops a driver working, so it sits above the work. */}
      {!licenceOk && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <div className="flex items-start gap-2">
            <WarningAmberIcon fontSize="small" className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">
                Your licence is not on file, so you cannot report a pickup or a
                delivery yet.
              </p>
              <p className="mt-0.5">
                {compliance?.reason ||
                  "Upload a photo of your licence and this clears straight away."}
              </p>
              <Link to="/driver/my-license" className="btn-primary mt-2 inline-flex">
                <BadgeOutlinedIcon fontSize="small" /> Upload my licence
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── The runs ──────────────────────────────────────────────────────── */}
      {running.length === 0 ? (
        <div className={uiStyles.card}>
          <div className="text-center py-8">
            <LocalShippingOutlinedIcon
              style={{ fontSize: 44 }}
              className="text-gray-300"
            />
            <p className="text-sm font-medium text-gray-900 mt-2">
              No runs assigned to you.
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Your carrier puts loads on you — this fills in as soon as they do.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {running.map((run) => {
            const tone =
              STATUS_TONE[run.transportStatus] ||
              "bg-gray-50 border-gray-200 text-gray-900";
            const tracking = run.liveTracking?.status === "ACTIVE";

            return (
              <div key={run._id} className={uiStyles.card}>
                {/* Heading */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <button
                      onClick={() => navigate(`/driver/load/${run.loadId}`)}
                      className="text-base font-bold text-indigo-700 hover:underline"
                    >
                      {run.loadId}
                    </button>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {[run.customerName, run.containerNo].filter(Boolean).join(" · ") ||
                        "—"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {tracking && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-600 animate-pulse" />
                        Tracking on
                      </span>
                    )}
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${tone}`}
                    >
                      {labelize(run.transportStatus)}
                    </span>
                  </div>
                </div>

                {/* What to do next */}
                <p className={`mt-3 rounded-lg border px-3 py-2 text-sm ${tone}`}>
                  {NEXT_STEP[run.transportStatus] ||
                    "Check with your dispatcher for what is next."}
                </p>

                {/* Their own two ends. The load may have more stops than this;
                    these are the ones this driver was given. */}
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    ["Pick up at", run.myAssignment?.pickup, run.pickup],
                    ["Drop at", run.myAssignment?.drop, run.drop],
                  ].map(([label, mine, fallback]) => {
                    const own = mine && (mine.city || mine.address);
                    return (
                      <div
                        key={label}
                        className="rounded-lg border border-gray-200 p-2.5"
                      >
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                          {label}
                        </p>
                        <p className="text-sm text-gray-900 mt-0.5">
                          {own
                            ? [mine.address, mine.city, mine.state]
                                .filter(Boolean)
                                .join(", ")
                            : stopLine(fallback)}
                        </p>
                        {!own && (
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            From the load
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {run.myAssignment?.note && (
                  <p className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
                    <span className="font-semibold">From dispatch:</span>{" "}
                    {run.myAssignment.note}
                  </p>
                )}

                {/* Details worth having at a gate */}
                <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  {[
                    ["Load type", run.truckType],
                    ["Material", run.material],
                    ["Last free date", fmtDate(run.lastFreeDate)],
                    [
                      "Documents",
                      `${run.documents} on file${run.deliveryProof ? " · POD ✓" : ""}`,
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        {label}
                      </dt>
                      <dd className="text-gray-900 mt-0.5">{value || "—"}</dd>
                    </div>
                  ))}
                </dl>

                {run.isSplitLoad && (
                  <p className="mt-2 text-[11px] text-gray-500">
                    This load is shared between carriers — you are running your
                    carrier&apos;s leg of it.
                  </p>
                )}

                {/* The three things a driver actually does */}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => navigate(`/driver/load/${run.loadId}`)}
                    className="btn-primary"
                  >
                    <UpdateIcon fontSize="small" /> Update status
                  </button>
                  <button
                    onClick={() => navigate(`/driver/track-load/${run.loadId}`)}
                    className="btn-secondary"
                  >
                    <MyLocationIcon fontSize="small" />
                    {tracking ? "Tracking" : "Live tracking"}
                  </button>
                  <button
                    onClick={() => navigate(`/driver/track-load/${run.loadId}`)}
                    className="btn-secondary"
                  >
                    <DescriptionOutlinedIcon fontSize="small" /> Documents
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Finished, kept short ──────────────────────────────────────────── */}
      {done.length > 0 && (
        <div className={uiStyles.card}>
          <h2 className="text-base font-semibold text-gray-900 mb-1">
            Finished
          </h2>
          <p className="text-sm text-gray-500 mb-3">
            Your last {done.length} run{done.length === 1 ? "" : "s"}.
          </p>
          <div className="space-y-2">
            {done.slice(0, 10).map((run) => (
              <div
                key={run._id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {run.loadId}
                    <span className="ml-2 text-xs text-gray-500">
                      {run.customerName}
                    </span>
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {stopLine(run.pickup)} → {stopLine(run.drop)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700">
                    <CheckCircleIcon style={{ fontSize: 14 }} />
                    {labelize(run.transportStatus)}
                  </span>
                  <button
                    onClick={() => navigate(`/driver/track-load/${run.loadId}`)}
                    className="btn-secondary py-1"
                  >
                    Documents
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverDashboard;
