import { useEffect, useState } from "react";
import DownloadIcon from "@mui/icons-material/Download";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import api from "../../api";
import { notify } from "../../utils/swal";
import { formatDate } from "../../utils/dates";

// ─── A stored document, read on the page ──────────────────────────────────────
// Certificates of insurance, signed agreements, driver licences — every one of
// them is opened to answer a question about what it says, so the default is to
// show it rather than hand over a file and hope somebody opens it. Downloading a
// licence scan to check an expiry date also leaves copies of it on whatever
// laptop did the checking.
//
// Fetched as a blob rather than pointed at with a bare <iframe src>: these
// routes are behind `protect` and scoped per carrier, and an iframe would not
// carry the auth header.
//
// The server decides who may read what — this only renders whatever the URL it
// is given returns.
// ─────────────────────────────────────────────────────────────────────────────

const prettySize = (bytes) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const fmtDate = (value) =>
  value
    ? formatDate(value)
    : "";

const DocumentPreview = ({
  url,
  params,
  name,
  mimeType,
  size,
  uploadedAt,
  downloadName,
  height = "28rem",
  banner,
  emptyMessage,
  show = true,
}) => {
  const [blobUrl, setBlobUrl] = useState("");
  const [error, setError] = useState("");

  // Nothing tracks "loading" separately: until one of the two lands, the fetch
  // is still in flight. A third state to keep in step with them would only be
  // another thing to get wrong.
  const loading = !blobUrl && !error;

  // Serialised so a fresh object literal on every render does not restart the
  // fetch — the caller almost always builds `params` inline.
  const paramKey = JSON.stringify(params || null);

  useEffect(() => {
    if (!show || !url) return;

    let cancelled = false;
    let created = "";

    api
      .get(url, { params: params || undefined, responseType: "blob" })
      .then((res) => {
        if (cancelled) return;
        created = URL.createObjectURL(res.data);
        setBlobUrl(created);
      })
      .catch(async (err) => {
        if (cancelled) return;
        // The body of a failed blob response is itself a blob, so the server's
        // message has to be read back out of it rather than off response.data.
        let message = "Could not open that document.";
        try {
          const text = await err.response?.data?.text?.();
          if (text) message = JSON.parse(text).message || message;
        } catch {
          /* not JSON — keep the generic message */
        }
        setError(message);
      });

    return () => {
      cancelled = true;
      // Revoked on unmount, not after rendering — the object URL is what the
      // iframe is still reading from.
      if (created) URL.revokeObjectURL(created);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, url, paramKey]);

  if (!url) {
    return (
      <div className="border border-dashed border-gray-300 rounded-lg px-3 py-6 text-center">
        <DescriptionOutlinedIcon className="text-gray-300" style={{ fontSize: 32 }} />
        <p className="text-sm text-gray-500 mt-1">
          {emptyMessage || "Nothing on file."}
        </p>
      </div>
    );
  }

  const isPdf = (mimeType || "").includes("pdf") || /\.pdf$/i.test(name || "");
  const isImage = (mimeType || "").startsWith("image/");

  const save = async () => {
    try {
      const res = await api.get(url, {
        params: { ...(params || {}), download: 1 },
        responseType: "blob",
      });
      const href = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = href;
      link.download = downloadName || name || "document";
      link.click();
      URL.revokeObjectURL(href);
    } catch {
      // Toasted, not raised into `error` — the preview above is working fine
      // and a failed save is no reason to blank the document being read.
      notify.error("Could not download that document.");
    }
  };

  const meta = [prettySize(size), fmtDate(uploadedAt) && `filed ${fmtDate(uploadedAt)}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
          {meta && <p className="text-[11px] text-gray-500">{meta}</p>}
        </div>
        <div className="flex items-center gap-2">
          {blobUrl && (
            <a
              href={blobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary whitespace-nowrap"
            >
              <OpenInNewIcon fontSize="small" /> Full screen
            </a>
          )}
          <button onClick={save} className="btn-secondary whitespace-nowrap">
            <DownloadIcon fontSize="small" /> Download
          </button>
        </div>
      </div>

      {banner}

      <div className="bg-gray-100">
        {loading && <p className="text-sm text-gray-500 text-center py-10">Opening…</p>}

        {!loading && error && (
          <p className="text-sm font-medium text-red-600 text-center py-10">{error}</p>
        )}

        {!loading && !error && blobUrl && (
          <>
            {isPdf && (
              <iframe
                src={blobUrl}
                title={name || "Document"}
                className="w-full bg-white"
                style={{ height }}
              />
            )}
            {isImage && (
              <img
                src={blobUrl}
                alt={name || "Document"}
                className="w-full object-contain bg-white"
                style={{ maxHeight: height }}
              />
            )}
            {/* A Word document is accepted on upload but no browser renders
                one, so say so instead of showing an empty frame. */}
            {!isPdf && !isImage && (
              <p className="text-sm text-gray-600 text-center py-10">
                This file type cannot be previewed in the browser — download it to
                read it.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default DocumentPreview;
