const SectionHeader = ({ label, accent = "#6366f1", children }) => (
  <div className="flex items-center justify-between p-3 md:p-4 border-b border-gray-100">
    <div className="flex items-center gap-2">
      <div className="w-1 h-4 rounded-full" style={{ backgroundColor: accent }} />
      <span className="text-sm font-bold text-gray-800 tracking-tight">{label}</span>
    </div>
    {children}
  </div>
);

export default SectionHeader;