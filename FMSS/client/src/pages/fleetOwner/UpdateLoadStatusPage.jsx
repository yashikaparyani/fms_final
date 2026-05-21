import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../api";
import { notify } from "../../utils/swal";
import DocumentUpload from "../../components/DocumentUpload";
import AppSelect from "../../components/AppSelect";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import CircularProgress from "@mui/material/CircularProgress";

const TRANSPORT_STATUSES = [
  { value: "LOAD_PLANNER",        label: "Load Planner",        color: "#7c3aed", bg: "#ede9fe", border: "#c4b5fd" },
  { value: "NEW_LOAD",            label: "New Load",            color: "#1d4ed8", bg: "#dbeafe", border: "#93c5fd" },
  { value: "ASSIGNED",            label: "Assigned",            color: "#15803d", bg: "#dcfce7", border: "#bbf7d0" },
  { value: "READY_TO_PICKUP",      label: "Ready to Pickup",     color: "#047857", bg: "#d1fae5", border: "#a7f3d0" },
  { value: "PICKED_UP",           label: "Picked Up",           color: "#0e7490", bg: "#cffafe", border: "#67e8f9" },
  { value: "IN_TRANSIT",          label: "In Transit",          color: "#a16207", bg: "#fef9c3", border: "#fde047" },
  { value: "REACHED_DESTINATION", label: "Reached Destination", color: "#15803d", bg: "#dcfce7", border: "#bbf7d0" },
  { value: "DELIVERED",           label: "Delivered",           color: "#15803d", bg: "#dcfce7", border: "#bbf7d0" },
  { value: "TERMINATED",          label: "Terminated",          color: "#dc2626", bg: "#fee2e2", border: "#fca5a5" },
  { value: "PAPERWORK_PENDING",   label: "Paperwork Pending",   color: "#a16207", bg: "#fef9c3", border: "#fde047" },
  { value: "INVOICED",            label: "Invoiced",            color: "#7c3aed", bg: "#ede9fe", border: "#c4b5fd" },
  { value: "STREET_TURN",         label: "Street Turn",         color: "#166534", bg: "#f0fdf4", border: "#bbf7d0" },
  { value: "EMPTY_IN_YARD",       label: "Empty in Yard",       color: "#6b7280", bg: "#f3f4f6", border: "#e5e7eb" },
  { value: "LOADED_IN_YARD",      label: "Loaded in Yard",      color: "#86198f", bg: "#fdf4ff", border: "#f0abfc" },
  { value: "DRIVER_ON_WAITING",   label: "Driver on Waiting",   color: "#c2410c", bg: "#fff7ed", border: "#fdba74" },
  { value: "DROP_IN_WAREHOUSE",   label: "Drop in Warehouse",   color: "#6b21a8", bg: "#faf5ff", border: "#d8b4fe" },
];

const StatusChip = ({ value }) => {
  const s = TRANSPORT_STATUSES.find((t) => t.value === value);
  if (!s) return <span style={{ color: "#9ca3af" }}>—</span>;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700,
      backgroundColor: s.bg, color: s.color, border: `1px solid ${s.border}`,
      letterSpacing: "0.03em", whiteSpace: "nowrap",
    }}>
      {s.label}
    </span>
  );
};

const UpdateLoadStatusPage = () => {
  const { loadId } = useParams();
  const navigate = useNavigate();

  const [load, setLoad] = useState(null);
  const [transportStatus, setTransportStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState([]);
  const [signatureData, setSignatureData] = useState("");
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);

  const requiredMark = (
    <span style={{ color: "#dc2626", fontWeight: 800, marginLeft: 2 }}>*</span>
  );

  const fetchLoad = async () => {
    try {
      const res = await api.get(`/loads/${loadId}`);
      setLoad(res.data);
      setTransportStatus(res.data.transportStatus);
      setSubmitError("");
    } catch {
      notify.error("Failed to fetch load");
    }
  };

  useEffect(() => { if (loadId) fetchLoad(); }, [loadId]);

  const getLocation = () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation not supported by this browser"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
        () => reject(new Error("Unable to fetch location")),
        { enableHighAccuracy: true, timeout: 12000 },
      );
    });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError("");

    if (transportStatus === "DELIVERED" && !signatureData) {
      const message = "Digital signature is required for Delivered status";
      setSubmitError(message);
      notify.error(message);
      return;
    }

    let location;
    try {
      setLocating(true);
      location = await getLocation();
    } catch (err) {
      notify.error(err.message || "Unable to fetch location. Please allow location access and try again.");
      setLocating(false);
      return;
    } finally {
      setLocating(false);
    }

    try {
      setSaving(true);
      const formData = new FormData();
      formData.append("transportStatus", transportStatus);
      formData.append("note", note);
      formData.append("latitude", location.latitude);
      formData.append("longitude", location.longitude);
      if (location.accuracy) formData.append("accuracy", location.accuracy);
      if (signatureData) formData.append("signatureData", signatureData);
      files.forEach((file) => formData.append("proofImages", file));

      await api.put(`/loads/${loadId}/transport-status`, formData);
      notify.success("Status updated successfully");
      navigate(-1);
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to update status";
      setSubmitError(message);
      notify.error(message);
    } finally {
      setSaving(false);
    }
  };

  const canvasPoint = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const touch = event.touches?.[0];
    return {
      x: (touch?.clientX ?? event.clientX) - rect.left,
      y: (touch?.clientY ?? event.clientY) - rect.top,
    };
  };

  const startSignature = (event) => {
    drawingRef.current = true;
    const ctx = canvasRef.current.getContext("2d");
    const point = canvasPoint(event);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  };

  const drawSignature = (event) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const point = canvasPoint(event);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    setSignatureData(canvasRef.current.toDataURL("image/png"));
  };

  const stopSignature = () => {
    drawingRef.current = false;
    if (canvasRef.current) setSignatureData(canvasRef.current.toDataURL("image/png"));
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setSignatureData("");
  };

  if (!load) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 240, flexDirection: "column", gap: 16 }}>
      <CircularProgress size={28} style={{ color: "#4f46e5" }} />
      <span style={{ fontSize: 13, color: "#9ca3af" }}>Loading…</span>
    </div>
  );

  return (
    <div style={{
      minHeight: "100vh", backgroundColor: "#f8fafc",
      padding: "24px 28px", fontFamily: "'Inter', 'Segoe UI', sans-serif",
      boxSizing: "border-box",
    }}>

      {/* ── Page Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <button onClick={() => navigate(-1)} style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
          backgroundColor: "#fff", border: "1px solid #e5e7eb", cursor: "pointer",
        }}>
          <ArrowBackIcon fontSize="small" style={{ color: "#6b7280" }} />
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "#111827" }}>
            Update Load Status
          </h1>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#9ca3af" }}>
            {load.loadId} — {load.customerName}
          </p>
        </div>
      </div>

      {/* ── Side-by-side layout ── */}
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, alignItems: "start" }}>

        {/* ── LEFT: Status form ── */}
        <div style={{
          backgroundColor: "#fff", borderRadius: 12,
          border: "1px solid #f3f4f6",
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          overflow: "hidden",
        }}>
          {/* Card header */}
          <div style={{
            padding: "14px 18px", borderBottom: "1px solid #f3f4f6",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 8,
              backgroundColor: "#ede9fe", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <LocalShippingIcon style={{ color: "#7c3aed", fontSize: 18 }} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>Update Status</div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>Change transport status</div>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>

              {submitError && (
                <div style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  backgroundColor: "#fef2f2",
                  border: "1px solid #fecaca",
                  color: "#b91c1c",
                  fontSize: 12,
                  fontWeight: 600,
                }}>
                  {submitError}
                </div>
              )}

              {/* Load meta */}
              <div style={{
                padding: "12px 14px", borderRadius: 8,
                backgroundColor: "#f9fafb", border: "1px solid #f3f4f6",
                display: "flex", flexDirection: "column", gap: 8,
              }}>
                {[
                  { label: "Load ID", value: <span style={{ fontWeight: 700, color: "#4f46e5" }}>{load.loadId}</span> },
                  { label: "Customer", value: load.customerName || "—" },
                  { label: "Route", value: load.pickup?.city && load.drop?.city ? `${load.pickup.city} → ${load.drop.city}` : "—" },
                  { label: "Current", value: <StatusChip value={load.transportStatus} /> },
                ].map(({ label, value }, i, arr) => (
                  <div key={label}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        {label}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 500, color: "#374151" }}>{value}</span>
                    </div>
                    {i < arr.length - 1 && <div style={{ height: 1, backgroundColor: "#f3f4f6", marginTop: 8 }} />}
                  </div>
                ))}
              </div>

              {/* Status picker — dropdown */}
              <div>
                <label style={{
                  display: "block", fontSize: 11, fontWeight: 700,
                  color: "#6b7280", marginBottom: 8,
                  textTransform: "uppercase", letterSpacing: "0.06em",
                }}>
                  New Status{requiredMark}
                </label>
                <AppSelect
                  options={TRANSPORT_STATUSES.map((s) => ({ value: s.value, label: s.label, meta: s }))}
                  value={transportStatus}
                  onChange={(value) => {
                    setTransportStatus(value);
                    setSubmitError("");
                  }}
                  placeholder="Select status..."
                  isSearchable={false}
                  formatOptionLabel={(opt) => (
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      color: opt.meta?.color ?? "#374151", fontWeight: 700, fontSize: 12,
                    }}>
                      <span style={{
                        display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                        backgroundColor: opt.meta?.color ?? "#d1d5db", flexShrink: 0,
                      }} />
                      {opt.label}
                    </span>
                  )}
                />
              </div>

              <div>
                <label style={{
                  display: "block", fontSize: 11, fontWeight: 700,
                  color: "#6b7280", marginBottom: 8,
                  textTransform: "uppercase", letterSpacing: "0.06em",
                }}>
                  Remark
                </label>
                <textarea
                  value={note}
                  onChange={(e) => {
                    setNote(e.target.value);
                    setSubmitError("");
                  }}
                  rows={3}
                  placeholder="Add a status note"
                  style={{
                    width: "100%", border: "1px solid #e5e7eb", borderRadius: 8,
                    padding: "8px 10px", fontSize: 12, resize: "vertical",
                    boxSizing: "border-box", outline: "none",
                  }}
                />
              </div>

              {/* Location note — auto-captured on submit */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 12px", borderRadius: 8,
                backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0",
              }}>
                <span style={{ fontSize: 16 }}>📍</span>
                <span style={{ fontSize: 11, color: "#15803d", fontWeight: 600 }}>
                  Location will be captured automatically when you submit.
                </span>
              </div>

              <div>
                <label style={{
                  display: "block", fontSize: 11, fontWeight: 700,
                  color: "#6b7280", marginBottom: 8,
                  textTransform: "uppercase", letterSpacing: "0.06em",
                }}>
                  Supporting Files{transportStatus === "PICKED_UP" ? requiredMark : null}
                </label>
                <label style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px dashed #c7d2fe",
                  backgroundColor: "#eef2ff",
                  color: "#4338ca",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}>
                  Choose Supporting Files
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx"
                    capture="environment"
                    onChange={(e) => {
                      setFiles(Array.from(e.target.files || []));
                      setSubmitError("");
                    }}
                    style={{ display: "none" }}
                  />
                </label>
                <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                  {files.length > 0
                    ? `${files.length} file${files.length > 1 ? "s" : ""} selected`
                    : "No supporting files selected"}
                </div>
              </div>

              {transportStatus === "DELIVERED" && (
                <div>
                  <label style={{
                    display: "block", fontSize: 11, fontWeight: 700,
                    color: "#6b7280", marginBottom: 8,
                    textTransform: "uppercase", letterSpacing: "0.06em",
                  }}>
                    Delivery Signature{requiredMark}
                  </label>
                  <canvas
                    ref={canvasRef}
                    width={280}
                    height={120}
                    onMouseDown={startSignature}
                    onMouseMove={drawSignature}
                    onMouseUp={stopSignature}
                    onMouseLeave={stopSignature}
                    onTouchStart={startSignature}
                    onTouchMove={drawSignature}
                    onTouchEnd={stopSignature}
                    style={{
                      width: "100%", height: 120, border: "1px solid #d1d5db",
                      borderRadius: 8, background: "#fff", touchAction: "none",
                    }}
                  />
                  <button
                    type="button"
                    onClick={clearSignature}
                    style={{
                      marginTop: 6, border: "none", background: "transparent",
                      color: "#6b7280", fontSize: 12, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    Clear signature
                  </button>
                </div>
              )}
            </div>

            {/* Action footer */}
            <div style={{
              display: "flex", justifyContent: "flex-end", gap: 8,
              padding: "12px 18px", borderTop: "1px solid #f3f4f6",
              backgroundColor: "#fafafa",
            }}>
              <button
                type="button"
                onClick={() => navigate(-1)}
                style={{
                  padding: "7px 16px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                  border: "1px solid #e5e7eb", backgroundColor: "#fff",
                  color: "#6b7280", cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || locating}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "7px 18px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                  border: "none",
                  backgroundColor: (saving || locating) ? "#a5b4fc" : "#4f46e5",
                  color: "#fff", cursor: (saving || locating) ? "not-allowed" : "pointer",
                }}
              >
                {(locating || saving) && <CircularProgress size={11} style={{ color: "#fff" }} />}
                {locating ? "Capturing location…" : saving ? "Saving…" : "Update Status"}
              </button>
            </div>
          </form>
        </div>

        {/* ── RIGHT: Documents ── */}
        <div style={{
          backgroundColor: "#fff", borderRadius: 12,
          border: "1px solid #f3f4f6",
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          overflow: "hidden",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "14px 20px", borderBottom: "1px solid #f3f4f6",
          }}>
            <div style={{ width: 3, height: 16, borderRadius: 99, backgroundColor: "#4f46e5" }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>Required Documents</span>
          </div>
          <div style={{ padding: 20 }}>
            <DocumentUpload
              loadId={loadId}
              transportStatus={load.transportStatus}
              documents={load.documents || []}
              refresh={fetchLoad}
            />
          </div>
        </div>

      </div>
    </div>
  );
};

export default UpdateLoadStatusPage;
