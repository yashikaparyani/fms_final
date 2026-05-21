const InfoRow = ({ label, value, highlight }) => {
  if (!value || value === "—") return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[108px_minmax(0,1fr)] lg:grid-cols-[116px_minmax(0,1fr)] gap-x-2 border-b border-gray-50 text-sm">
      <div className="px-3 py-2 sm:py-2.5 font-semibold text-gray-400 text-xs flex items-center bg-gray-50/30 sm:bg-transparent">
        {label}
      </div>
      <div
        className={`px-2 py-2 sm:py-2.5 min-w-0 break-words leading-tight flex items-center ${
          highlight ? "text-indigo-600 font-semibold" : "text-gray-700 font-medium"
        }`}
      >
        {value}
      </div>
    </div>
  );
};

export default InfoRow;