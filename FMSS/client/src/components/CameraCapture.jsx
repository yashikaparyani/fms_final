import { useCallback, useEffect, useRef, useState } from "react";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import RefreshIcon from "@mui/icons-material/Refresh";
import UploadFileIcon from "@mui/icons-material/UploadFile";

// ─── Camera capture modal ────────────────────────────────────────────────────
// Photographs a document straight into an upload, so paperwork can be filed
// from a phone or tablet without saving to the device first.
//
// getUserMedia only exists in a secure context, so over plain http on a LAN
// address there is no camera at all. The modal detects that and falls back to
// the native file input with `capture`, which hands the phone's own camera app
// the job. On desktop that fallback is just a file picker.
// ─────────────────────────────────────────────────────────────────────────────

const canUseCamera = () =>
  typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

const errorMessage = (err) => {
  switch (err?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera permission was denied. Allow camera access in your browser, or pick a file instead.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera was found on this device.";
    case "NotReadableError":
      return "The camera is already in use by another application.";
    default:
      return "The camera could not be started. Pick a file instead.";
  }
};

const CameraCapture = ({ open, title, onClose, onCapture }) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fallbackInputRef = useRef(null);

  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  // Object URL of the still being reviewed; null while the live feed shows.
  const [preview, setPreview] = useState(null);
  const previewFileRef = useRef(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const clearPreview = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    previewFileRef.current = null;
  }, [preview]);

  // Start the feed when the modal opens, and always release the camera when it
  // closes — a live track keeps the device's camera light on.
  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;

    const start = async () => {
      if (!canUseCamera()) {
        setError(
          "This browser cannot open the camera directly (it needs an https connection). Use “Pick a file” to capture with your device camera.",
        );
        return;
      }

      setStarting(true);
      setError("");
      try {
        // The rear camera is the one pointed at the paperwork.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setStarting(false);
      }
    };

    start();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, stopStream]);

  // Drop any pending preview when the modal closes so it does not reappear.
  useEffect(() => {
    if (!open) clearPreview();
    // clearPreview changes with `preview`; running on open alone is intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const takePhoto = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("The photo could not be captured. Try again.");
          return;
        }
        // The server only accepts known extensions, so name it .jpg.
        const safeTitle = String(title || "document").replace(/[^\w-]+/g, "-");
        const file = new File([blob], `${safeTitle}-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        previewFileRef.current = file;
        setPreview(URL.createObjectURL(blob));
      },
      "image/jpeg",
      0.9,
    );
  };

  const confirm = () => {
    const file = previewFileRef.current;
    if (!file) return;
    // Hand the file over before teardown clears the preview.
    onCapture(file);
    clearPreview();
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-base text-gray-800">Capture Document</h2>
            {title && <p className="text-xs text-gray-500 mt-0.5">{title}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-lg leading-none px-1"
            aria-label="Close"
          >
            ✖
          </button>
        </div>

        <div className="bg-slate-900 aspect-[4/3] flex items-center justify-center relative">
          {preview ? (
            <img src={preview} alt="Captured document" className="max-h-full max-w-full object-contain" />
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                className={`h-full w-full object-contain ${error ? "invisible" : ""}`}
              />
              {(starting || error) && (
                <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
                  <p className="text-sm text-slate-200">
                    {starting ? "Starting camera…" : error}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-3 flex flex-wrap items-center gap-2 justify-end">
          {/* Always available: lets the phone's own camera app do the work when
              getUserMedia is unavailable or was denied. */}
          <input
            type="file"
            ref={fallbackInputRef}
            className="hidden"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              onCapture(file);
              onClose();
            }}
          />
          <button
            type="button"
            onClick={() => fallbackInputRef.current?.click()}
            className="mr-auto inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            <UploadFileIcon style={{ fontSize: 15 }} /> Pick a file
          </button>

          {preview ? (
            <>
              <button
                type="button"
                onClick={clearPreview}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                <RefreshIcon style={{ fontSize: 15 }} /> Retake
              </button>
              <button
                type="button"
                onClick={confirm}
                className="text-xs font-semibold px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Use Photo
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={takePhoto}
              disabled={!!error || starting}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <CameraAltIcon style={{ fontSize: 15 }} /> Capture
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CameraCapture;
