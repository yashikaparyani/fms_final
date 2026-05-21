// ─── Status colour maps ─────────────────────────────────────────────────────
export const LOAD_STATUS_COLOR = {
  VERIFIED: { bg: "#dcfce7", color: "#15803d", border: "#bbf7d0" },
  PENDING_VERIFICATION: { bg: "#fef9c3", color: "#a16207", border: "#fde047" },
  REQUIRES_CHANGES: { bg: "#fee2e2", color: "#dc2626", border: "#fca5a5" },
  REJECTED: { bg: "#fee2e2", color: "#dc2626", border: "#fca5a5" },
  DRAFT: { bg: "#f3f4f6", color: "#6b7280", border: "#e5e7eb" },
};

export const TRANSPORT_STATUS_COLOR = {
  LOAD_PLANNER: { bg: "#ede9fe", color: "#7c3aed", border: "#c4b5fd" },
  NEW_LOAD: { bg: "#dbeafe", color: "#1d4ed8", border: "#93c5fd" },
  ASSIGNED: { bg: "#dcfce7", color: "#15803d", border: "#bbf7d0" },
  PICKED_UP: { bg: "#cffafe", color: "#0e7490", border: "#67e8f9" },
  IN_TRANSIT: { bg: "#fef9c3", color: "#a16207", border: "#fde047" },
  REACHED_DESTINATION: { bg: "#dcfce7", color: "#15803d", border: "#bbf7d0" },
  DELIVERED: { bg: "#dcfce7", color: "#15803d", border: "#bbf7d0" },
  TERMINATED: { bg: "#fee2e2", color: "#dc2626", border: "#fca5a5" },
  PAPERWORK_PENDING: { bg: "#fef9c3", color: "#a16207", border: "#fde047" },
  INVOICED: { bg: "#ede9fe", color: "#7c3aed", border: "#c4b5fd" },
  STREET_TURN: { bg: "#f0fdf4", color: "#166534", border: "#bbf7d0" },
  EMPTY_IN_YARD: { bg: "#f3f4f6", color: "#6b7280", border: "#e5e7eb" },
  LOADED_IN_YARD: { bg: "#fdf4ff", color: "#86198f", border: "#f0abfc" },
  DRIVER_ON_WAITING: { bg: "#fff7ed", color: "#c2410c", border: "#fdba74" },
  DROP_IN_WAREHOUSE: { bg: "#faf5ff", color: "#6b21a8", border: "#d8b4fe" },
};

const StatusChip = ({ value, map }) => {
  const s = map[value] || { bg: "#f3f4f6", color: "#6b7280", border: "#e5e7eb" };
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap"
      style={{
        backgroundColor: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        letterSpacing: "0.03em",
      }}
    >
      {(value || "—").replace(/_/g, " ")}
    </span>
  );
};

export default StatusChip;