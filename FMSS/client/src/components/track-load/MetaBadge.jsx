const MetaBadge = ({ label, value }) => {
  if (!value || value === "—") return null;
  return (
    <div className="flex flex-col items-start px-4 py-2.5 border-r border-gray-50 last:border-r-0 min-w-[120px] flex-1">
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</span>
      <span className="text-sm font-bold text-gray-800 mt-0.5 truncate w-full">{value}</span>
    </div>
  );
};

export default MetaBadge;