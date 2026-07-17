import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary";

// Driver-uploaded pictures (pickup proof etc.) shown under the Documents tab.
// Currently the only driver image source is load.pickupProof.images; add new
// sources to collectPictures() as the mobile app starts sending more.

const cleanPath = (filePath) =>
  filePath?.includes("uploads")
    ? filePath.substring(filePath.indexOf("uploads")).replace(/\\/g, "/")
    : filePath;

const fileUrl = (filePath) =>
  `${import.meta.env.VITE_API_BASE_URL}/${cleanPath(filePath)}`;

const fmtDateTime = (v) =>
  v
    ? new Date(v).toLocaleString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : null;

const collectPictures = (load) => {
  const pictures = [];
  (load?.pickupProof?.images || []).forEach((img) => {
    if (img?.filePath) {
      pictures.push({
        ...img,
        tag: "Pickup Proof",
        uploadedAt: img.uploadedAt || load.pickupProof.submittedAt,
      });
    }
  });
  return pictures;
};

const DriverPictures = ({ load }) => {
  const pictures = collectPictures(load);

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-3">
        <PhotoLibraryIcon style={{ fontSize: 18, color: "#4f46e5" }} />
        <h3 className="text-sm font-bold text-gray-800">Pictures</h3>
        <span className="text-xs font-semibold text-gray-400">
          ({pictures.length})
        </span>
      </div>

      {pictures.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 py-8 text-center">
          <p className="text-sm text-gray-400">
            No pictures uploaded by the driver yet.
          </p>
          <p className="text-xs text-gray-300 mt-1">
            Photos taken during pickup / delivery will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {pictures.map((pic, i) => (
            <a
              key={`${pic.filePath}-${i}`}
              href={fileUrl(pic.filePath)}
              target="_blank"
              rel="noreferrer"
              className="group rounded-xl border border-gray-200 bg-white overflow-hidden hover:border-indigo-300 hover:shadow-md transition-all"
              title={pic.fileName || "Driver picture"}
            >
              <div className="aspect-square bg-gray-100 overflow-hidden">
                <img
                  src={fileUrl(pic.filePath)}
                  alt={pic.fileName || "Driver picture"}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <div className="px-2.5 py-2">
                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100">
                  {pic.tag}
                </span>
                {fmtDateTime(pic.uploadedAt) && (
                  <p className="text-[10px] text-gray-400 mt-1 truncate">
                    {fmtDateTime(pic.uploadedAt)}
                  </p>
                )}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

export default DriverPictures;
