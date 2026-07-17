import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { toast } from "react-toastify";
import { IconButton, CircularProgress } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import SearchIcon from "@mui/icons-material/Search";
import TimelineIcon from "@mui/icons-material/Timeline";
import InfoIcon from "@mui/icons-material/Info";
import DescriptionIcon from "@mui/icons-material/Description";

import api from "../api";
import DocumentUpload from "../components/DocumentUpload";
import LeafletMap from "../components/LeafletMap";

import Card from "../components/track-load/Card";
import SectionHeader from "../components/track-load/SectionHeader";
import LoadHeader from "../components/track-load/LoadHeader";
import LoadDetailsLeft from "../components/track-load/LoadDetailsLeft";
import LoadDetailsRight from "../components/track-load/LoadDetailsRight";
import StatusTimeline from "../components/track-load/StatusTimeline";
import TransportStatusDialog from "../components/track-load/TransportStatusDialog";
import RatingSection from "../components/track-load/RatingSection";
import DriverPictures from "../components/track-load/DriverPictures";
import DetailedLoadInfo from "../components/track-load/DetailedLoadInfo";
import ScheduleBidding from "./ScheduleBidding";
import Swal from "sweetalert2";

const fmtShort = (v) =>
  v
    ? new Date(v).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

const fmtFreshness = (v) => {
  if (!v) return "No heartbeat yet";
  const diffSeconds = Math.max(0, Math.round((Date.now() - new Date(v)) / 1000));
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  return fmtShort(v);
};

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

// ─── Tab definitions ──────────────────────────────────────────────────────────
const TABS = [
  {
    key: "tracking",
    label: "Tracking",
    icon: <TimelineIcon fontSize="small" />,
  },
  {
    key: "details",
    label: "Details",
    icon: <InfoIcon fontSize="small" />,
  },
  {
    key: "documents",
    label: "Documents",
    icon: <DescriptionIcon fontSize="small" />,
  },
];

// ─── Load Status Info Card ────────────────────────────────────────────────────
const LoadStatusInfoCard = ({ load, userRole }) => {
  const isFinished = ["DELIVERED", "TERMINATED", "STREET_TURN"].includes(
    load.transportStatus
  );

  return (
    <>
      {/* ── Load Status Info ── */}
      <Card>
        <SectionHeader label="Load Status Information" accent="#6b7280" />
        <div className="px-5 py-3.5 flex flex-wrap gap-3">
          {/* Address Added */}
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-gray-50 border border-gray-100">
            <span className="text-xs font-semibold text-gray-400">
              Address Added
            </span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                load.adressAdded
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-600"
              }`}
            >
              {load.adressAdded ? "Yes" : "No"}
            </span>
          </div>

          {/* Bid details hidden from clients */}
          {userRole !== "client" && load.bidStatus && (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-gray-50 border border-gray-100">
              <span className="text-xs font-semibold text-gray-400">
                Bid Status
              </span>
              <span className="text-xs font-semibold text-gray-700">
                {load.bidStatus}
              </span>
            </div>
          )}

          {userRole !== "client" && load.bidStartTime && (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-gray-50 border border-gray-100">
              <span className="text-xs font-semibold text-gray-400">
                Bid Start
              </span>
              <span className="text-xs text-gray-700">
                {fmtFull(load.bidStartTime)}
              </span>
            </div>
          )}

          {userRole !== "client" && load.bidEndTime && (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-gray-50 border border-gray-100">
              <span className="text-xs font-semibold text-gray-400">
                Bid End
              </span>
              <span className="text-xs text-gray-700">
                {fmtFull(load.bidEndTime)}
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* ── Chassis Charges Days ── */}
      <Card>
        <SectionHeader label="Chassis Charges Days" accent="#f59e0b" />
        <div className="px-5 py-3.5">
          <div
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border text-sm font-medium ${
              isFinished
                ? "bg-green-50 border-green-200 text-green-700"
                : "bg-orange-50 border-orange-200 text-orange-700"
            }`}
          >
            {isFinished
              ? "✔ Chassis charges calculation complete."
              : "⏳ Load is not picked up / terminated / street turn yet."}
          </div>
        </div>
      </Card>
    </>
  );
};

// ─── Tab: Tracking (Timeline + Map) ──────────────────────────────────────────
const LiveTrackingCard = ({ tracking }) => {
  const lastLocation = tracking?.lastLocation;
  const isActive = tracking?.status === "ACTIVE";

  return (
    <Card>
      <SectionHeader
        label="Live Location"
        accent={isActive ? "#16a34a" : "#6b7280"}
      />
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${
              isActive
                ? "bg-green-100 text-green-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {isActive ? "Tracking Active" : tracking?.status || "Not Started"}
          </span>
          <span className="text-xs font-semibold text-gray-500">
            Last sync:{" "}
            {fmtFreshness(tracking?.lastHeartbeatAt || lastLocation?.recordedAt)}
          </span>
        </div>

        {lastLocation ? (
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
                Latitude
              </div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {Number(lastLocation.latitude).toFixed(6)}
              </div>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
                Longitude
              </div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {Number(lastLocation.longitude).toFixed(6)}
              </div>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
                Accuracy
              </div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {lastLocation.accuracy
                  ? `${Math.round(lastLocation.accuracy)} m`
                  : "Unknown"}
              </div>
            </div>
            <a
              href={`https://www.google.com/maps?q=${lastLocation.latitude},${lastLocation.longitude}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-sm font-bold text-indigo-700 hover:bg-indigo-100"
            >
              Open in Maps
            </a>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm font-medium text-gray-500">
            Waiting for the fleet owner app to start GPS sharing.
          </div>
        )}
      </div>
    </Card>
  );
};

const TrackingTab = ({ load, tracking }) => {
  const historyPoints = (load.transportStatusHistory || [])
    .filter(
      (entry) =>
        entry.location &&
        entry.location.latitude != null &&
        entry.location.longitude != null
    )
    .slice()
    .sort((a, b) => new Date(a.changedAt || 0) - new Date(b.changedAt || 0))
    .map((entry, index, entries) => {
      const isOrigin = index === 0;
      const isDestination = index === entries.length - 1;

      return {
        latitude: Number(entry.location.latitude),
        longitude: Number(entry.location.longitude),
        label: isOrigin
          ? "Origin"
          : isDestination
            ? "Destination"
            : entry.status?.replace(/_/g, " ") || "Status update",
        note: [entry.status?.replace(/_/g, " "), entry.note].filter(Boolean).join(" • "),
        role: isOrigin ? "origin" : isDestination ? "destination" : "status",
        recordedAt: entry.changedAt,
      };
    });

  const livePoints = tracking?.recentLocations?.length
    ? [tracking.recentLocations[tracking.recentLocations.length - 1]]
        .filter(
          (entry) =>
            entry &&
            entry.latitude != null &&
            entry.longitude != null
        )
        .map((entry) => ({
          latitude: Number(entry.latitude),
          longitude: Number(entry.longitude),
          label: "Live truck",
          note: fmtShort(entry.recordedAt),
          role: "live",
          recordedAt: entry.recordedAt,
        }))
    : [];

  return (
    <div className="space-y-6">
      <LiveTrackingCard tracking={tracking || load.liveTracking} />

      <Card>
        <SectionHeader label="Status Timeline" accent="#8b5cf6" />
        <StatusTimeline history={load.transportStatusHistory || []} />
      </Card>

      <Card>
        <SectionHeader label="Location Updates" accent="#111827" />
        <LeafletMap points={[...historyPoints, ...livePoints]} />
      </Card>
    </div>
  );
};

// ─── Tab: Details ─────────────────────────────────────────────────────────────
const DetailsTab = ({ load, userRole, isStaff, ratingScore, setRatingScore, ratingRemark, setRatingRemark, savingRating, onSave }) => (
  <div className="space-y-8 pb-10">
    <DetailedLoadInfo load={load} />

    {/* Rating (staff/admin + DELIVERED only) */}
    {isStaff && load.transportStatus === "DELIVERED" && (
      <RatingSection
        load={load}
        ratingScore={ratingScore}
        setRatingScore={setRatingScore}
        ratingRemark={ratingRemark}
        setRatingRemark={setRatingRemark}
        savingRating={savingRating}
        onSave={onSave}
      />
    )}
  </div>
);

// ─── Tab: Documents ───────────────────────────────────────────────────────────
const DocumentsTab = ({ load, fetchLoad }) => (
  <Card>
    <SectionHeader label="Documents" accent="#4f46e5" />
    <div className="p-5">
      <DocumentUpload
        loadId={load.loadId}
        transportStatus={load.transportStatus}
        documents={load.documents || []}
        refresh={() => fetchLoad(load.loadId)}
      />
      <DriverPictures load={load} />
    </div>
  </Card>
);

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
const TrackLoadPage = () => {
  const { loadId: paramLoadId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Get role from Redux
  const userRole = useSelector((state) => state.auth.user?.role);
  const apiToken = useSelector((state) => state.auth.api_token);
  const isStaff = ["staff", "admin"].includes(userRole);

  const activeTab = searchParams.get("tab") || "tracking";

  const [searchId, setSearchId] = useState("");
  const [load, setLoad] = useState(null);
  const [loading, setLoading] = useState(false);
  const [transportOpen, setTransportOpen] = useState(false);
  const [ratingScore, setRatingScore] = useState("");
  const [ratingRemark, setRatingRemark] = useState("");
  const [savingRating, setSavingRating] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [liveTracking, setLiveTracking] = useState(null);

  const handleTabChange = (tabKey) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tabKey);
      return next;
    });
  };

  const fetchLoad = async (id) => {
    if (!id) return;
    try {
      setLoading(true);
      const res = await api.get(`/loads/${id}`);
      setLoad(res.data);
    } catch {
      toast.error("Load not found");
      setLoad(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchTracking = async (id) => {
    if (!id) return;
    try {
      const res = await api.get(`/tracking/${id}`);
      setLiveTracking(res.data);
    } catch {
      setLiveTracking(null);
    }
  };

  useEffect(() => {
    if (paramLoadId) {
      fetchLoad(paramLoadId);
      fetchTracking(paramLoadId);
    }
  }, [paramLoadId]);

  useEffect(() => {
    const token = apiToken || localStorage.getItem("api_token");
    if (!load?.loadId || !token) return undefined;

    const source = new EventSource(
      `/api/tracking/${encodeURIComponent(load.loadId)}/stream?token=${encodeURIComponent(token)}`,
    );

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "snapshot" || payload.type === "tracking_stopped") {
          setLiveTracking(payload.data);
          return;
        }

        if (payload.type === "tracking_started") {
          setLiveTracking((prev) => ({
            ...(prev || {}),
            status: payload.data?.status || "ACTIVE",
            lastLocation: payload.data?.location || prev?.lastLocation,
            lastHeartbeatAt:
              payload.data?.location?.recordedAt || new Date().toISOString(),
          }));
          return;
        }

        if (payload.type === "location") {
          setLiveTracking((prev) => {
            const previousLocations = prev?.recentLocations || [];
            const nextLocations = [...previousLocations, payload.data].slice(-100);
            return {
              ...(prev || {}),
              status: "ACTIVE",
              lastLocation: payload.data,
              lastHeartbeatAt: payload.data?.recordedAt || payload.sentAt,
              recentLocations: nextLocations,
            };
          });
          return;
        }

        if (payload.type === "transport_status") {
          setLiveTracking((prev) => ({
            ...(prev || {}),
            status: payload.data?.liveTrackingStatus || prev?.status,
            lastHeartbeatAt: payload.data?.changedAt || prev?.lastHeartbeatAt,
          }));
        }
      } catch {
        // Ignore malformed stream messages.
      }
    };

    return () => source.close();
  }, [load?.loadId, apiToken]);

  const handleSearch = () => fetchLoad(searchId.trim());

  const handleRebid = async () => {
    const result = await Swal.fire({
      title: "Re-bid this load?",
      text: "This will remove the current carrier and reset the load to 'Verified' status. Are you sure?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, Re-bid",
    });

    if (result.isConfirmed) {
      try {
        setLoading(true);
        await api.post(`/loads/${load.loadId}/rebid`);
        toast.success("Load reset! Opening bidding window...");

        // Refresh load data and open schedule modal
        const res = await api.get(`/loads/${load.loadId}`);
        setLoad(res.data);
        setScheduleOpen(true);
      } catch (err) {
        toast.error(err?.response?.data?.message || "Failed to reset load");
      } finally {
        setLoading(false);
      }
    }
  };

  const saveRating = async () => {
    if (!ratingScore) return toast.error("Please select a score");
    try {
      setSavingRating(true);
      await api.post(`/loads/${load.loadId}/rating`, {
        score: Number(ratingScore),
        remark: ratingRemark,
      });
      toast.success("Rating saved");
      setRatingScore("");
      setRatingRemark("");
      fetchLoad(load.loadId);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save rating");
    } finally {
      setSavingRating(false);
    }
  };

  // Determine visible tabs (hide Documents from clients)
  const visibleTabs =
    userRole === "client"
      ? TABS.filter((t) => t.key !== "documents")
      : TABS;

  const renderTabContent = () => {
    switch (activeTab) {
      case "tracking":
        return <TrackingTab load={load} tracking={liveTracking} />;
      case "details":
        return (
          <DetailsTab
            load={load}
            userRole={userRole}
            isStaff={isStaff}
            ratingScore={ratingScore}
            setRatingScore={setRatingScore}
            ratingRemark={ratingRemark}
            setRatingRemark={setRatingRemark}
            savingRating={savingRating}
            onSave={saveRating}
          />
        );
      case "documents":
        return <DocumentsTab load={load} fetchLoad={fetchLoad} />;
      default:
        return <TrackingTab load={load} tracking={liveTracking} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-4 px-0 md:p-6 lg:p-8 font-['Inter']">

      {/* ── Page Header ── */}
      <div className="mb-6 flex items-center gap-3">
        <IconButton
          size="small"
          onClick={() => navigate(-1)}
          className="bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50"
        >
          <ArrowBackIcon fontSize="small" className="text-gray-500" />
        </IconButton>
        <div>
          <h1 className="page-title">Track Load</h1>
          <p className="page-subtitle">
            Search and view detailed load information
          </p>
        </div>
      </div>



      {/* ── Loading ── */}
      {loading && (
        <div className="text-center py-24">
          <CircularProgress size={32} className="text-indigo-600" />
          <p className="text-muted-md mt-4">Fetching load details...</p>
        </div>
      )}

      {/* ── Empty State ── */}
      {!loading && !load && (
        <div className="text-center py-24 bg-white rounded-2xl border border-dashed border-gray-200">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-50 rounded-full mb-4">
            <LocalShippingIcon className="text-gray-300" fontSize="large" />
          </div>
          <p className="text-body font-semibold text-gray-500">
            Ready to Track
          </p>
          <p className="text-muted mt-1">
            Search for a Load ID to view its details
          </p>
        </div>
      )}

      {/* ── Load Detail ── */}
      {!loading && load && (
        <div className="space-y-6">
          {/* Identity Banner */}
          <LoadHeader
            load={load}
            onUpdateStatus={() => setTransportOpen(true)}
            onEditLoad={() => navigate(`/${userRole}/edit-load/${load.loadId}`)}
            onRebid={handleRebid}
            userRole={userRole}
          />

          {/* Tabbed Content */}
          <div className="bg-white overflow-hidden rounded-2xl border border-gray-100 shadow-sm">

            {/* Tab Bar */}
            <div className="border-b border-gray-300 bg-gray-50">
              <div className="flex gap-1 pt-2 px-2">
                {visibleTabs.map((tab) => {
                  const isActive = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => handleTabChange(tab.key)}
                      className={`
                        flex items-center gap-1.5 whitespace-nowrap
                        px-3 py-2 text-xs md:text-sm font-medium
                        rounded-t-lg border-b-2 -mb-px transition-all
                        ${
                          isActive
                            ? "bg-indigo-100 border-indigo-600 text-indigo-600"
                            : "border-transparent text-gray-500 bg-gray-200 hover:bg-indigo-50"
                        }
                      `}
                    >
                      <span className="text-base">{tab.icon}</span>
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tab Content */}
            <div className="md:p-6">
              {renderTabContent()}
            </div>
          </div>
        </div>
      )}

      {/* ── Transport Status Dialog ── */}
      <TransportStatusDialog
        open={transportOpen}
        onClose={() => setTransportOpen(false)}
        load={load}
        onSuccess={() => {
          fetchLoad(load?.loadId);
          fetchTracking(load?.loadId);
        }}
      />

      <ScheduleBidding
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        load={load}
        refreshLoads={() => fetchLoad(load?.loadId)}
      />
    </div>
  );
};

export default TrackLoadPage;
