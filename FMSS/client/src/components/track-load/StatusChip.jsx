import { STATUS_BADGE_COLORS } from "../../utils/loadColorMode";

// ─── Status colour maps ─────────────────────────────────────────────────────
export const LOAD_STATUS_COLOR = {
  VERIFIED: { bg: "#dcfce7", color: "#15803d", border: "#bbf7d0" },
  PENDING_VERIFICATION: { bg: "#fef9c3", color: "#a16207", border: "#fde047" },
  REQUIRES_CHANGES: { bg: "#fee2e2", color: "#dc2626", border: "#fca5a5" },
  REJECTED: { bg: "#fee2e2", color: "#dc2626", border: "#fca5a5" },
  DRAFT: { bg: "#f3f4f6", color: "#6b7280", border: "#e5e7eb" },
};

// One entry per transport status, shared with the row tints and the table
// badges — see STATUS_BADGE_COLORS. The map written out here reused a single
// green for ASSIGNED, REACHED DESTINATION and DELIVERED and a single yellow for
// IN TRANSIT and PAPERWORK PENDING, so a chip could not be told apart from a
// chip meaning something quite different.
export const TRANSPORT_STATUS_COLOR = STATUS_BADGE_COLORS;


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