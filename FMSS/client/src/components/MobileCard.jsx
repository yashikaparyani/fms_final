// ─── MobileCard.jsx ───────────────────────────────────────────────────────────
// A generic mobile card component that mirrors the LoadTable pattern.
// Usage:
//   const fields  = [ { label: "City", value: row.city }, ... ]
//   const actions = [ { label: "Edit", icon: <EditIcon />, color: "#0891b2", onClick: () => {} }, ... ]
//   <MobileCard row={row} title={row.name} subtitle={row.email} badge={...} fields={fields} actions={actions} />
// ─────────────────────────────────────────────────────────────────────────────

import { Link } from "react-router-dom";import { useSelector } from "react-redux";

// ── Status colour presets consumers can import ────────────────────────────────
export const mobileCardStatusColors = {
  // Load / transport statuses
  ASSIGNED:             { bg: "#fff0f0", border: "#ffcccc", badge: { bg: "#fee2e2", text: "#991b1b" } },
  PICKED_UP:            { bg: "#e8f4fd", border: "#b3d9f2", badge: { bg: "#dbeafe", text: "#1e40af" } },
  IN_TRANSIT:           { bg: "#e8f4fd", border: "#b3d9f2", badge: { bg: "#dbeafe", text: "#1e40af" } },
  REACHED_DESTINATION:  { bg: "#edf9ee", border: "#b5e8b7", badge: { bg: "#dcfce7", text: "#166534" } },
  DELIVERED:            { bg: "#edf9ee", border: "#b5e8b7", badge: { bg: "#dcfce7", text: "#166534" } },
  NEW_LOAD:             { bg: "#fffbeb", border: "#fde68a", badge: { bg: "#fef3c7", text: "#92400e" } },
  LOAD_PLANNER:         { bg: "#fffbeb", border: "#fde68a", badge: { bg: "#fef3c7", text: "#92400e" } },
  VERIFIED:             { bg: "#edf9ee", border: "#b5e8b7", badge: { bg: "#dcfce7", text: "#166534" } },
  PENDING_VERIFICATION: { bg: "#fffbeb", border: "#fde68a", badge: { bg: "#fef3c7", text: "#92400e" } },
  REQUIRES_CHANGES:     { bg: "#fff0f0", border: "#ffcccc", badge: { bg: "#fee2e2", text: "#991b1b" } },
  REJECTED:             { bg: "#fff0f0", border: "#ffcccc", badge: { bg: "#fee2e2", text: "#991b1b" } },
  DRAFT:                { bg: "#f9fafb", border: "#d1d5db", badge: { bg: "#f3f4f6", text: "#374151" } },
  // Generic active / inactive (for customers, fleet owners, etc.)
  active:               { bg: "#edf9ee", border: "#b5e8b7", badge: { bg: "#dcfce7", text: "#166534" } },
  inactive:             { bg: "#fff0f0", border: "#ffcccc", badge: { bg: "#fee2e2", text: "#991b1b" } },
};

const defaultCardStyle = { bg: "#ffffff", border: "#e5e7eb", badge: { bg: "#f3f4f6", text: "#374151" } };

// ── Origin / Destination mini block ──────────────────────────────────────────
const LocationBlock = ({ label, data }) => {
  if (!data) return null;
  const line1 = data.company || data.address || "—";
  const line2  = [data.city, data.state].filter(Boolean).join(", ");
  return (
    <div>
      <p style={{ fontSize: 10, color: "#9ca3af", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </p>
      <p style={{ fontSize: 12, color: "#111827", fontWeight: 500, margin: "2px 0 0" }}>{line1}</p>
      {line2 && <p style={{ fontSize: 11, color: "#6b7280", margin: "1px 0 0" }}>{line2}</p>}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// Props:
//   colorStyle  – one of mobileCardStatusColors values, or pass statusKey to auto-resolve
//   statusKey   – key into mobileCardStatusColors (e.g. "active", "VERIFIED")
//   title       – bold top-left text  (required)
//   subtitle    – smaller text below title
//   badge       – { label, ...optional overrides } shown top-right
//   locations   – [{ label: "Origin", data: row.pickup }, { label: "Destination", data: row.drop }]
//                 renders a 2-col grid with LocationBlock
//   fields      – [{ label, value }] rendered in a 2-col detail grid; nullish values are skipped
//   actions     – [{ label, icon, color, onClick, disabled }] rendered as icon/text buttons
//   children    – optional custom content inserted before actions
// ─────────────────────────────────────────────────────────────────────────────
const MobileCard = ({
  colorStyle,
  statusKey,
  title,
  subtitle,
  badge,
  locations,
  fields,
  actions,
  children,
}) => {
  const style =
    colorStyle ||
    (statusKey && mobileCardStatusColors[statusKey]) ||
    defaultCardStyle;

    const userRole = useSelector((state) => state.auth.user?.role);

  return (
    <div
      style={{
        backgroundColor: style.bg,
        borderLeft:   `4px solid ${style.border}`,
        borderTop:    `1px solid ${style.border}`,
        borderRight:  `1px solid ${style.border}`,
        borderBottom: `1px solid ${style.border}`,
        borderRadius: 10,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* ── Title row ──────────────────────────────────────────────────────── */}
      {(title || badge) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
         {title && (
  <Link to={`/${userRole}/track-load/${title}`}>
    <p className="link font-bold">
      {title}
    </p>
  </Link>
)}
            {subtitle && (
              <p style={{ fontSize: 12, color: "#6366f1", fontWeight: 600, margin: "2px 0 0" }}>
                {subtitle}
              </p>
            )}
          </div>
          {badge && (
            <span
              style={{
                backgroundColor: badge.bg || style.badge?.bg || "#f3f4f6",
                color:           badge.text || style.badge?.text || "#374151",
                fontSize: 11,
                fontWeight: 700,
                padding: "3px 9px",
                borderRadius: 6,
                whiteSpace: "nowrap",
                marginLeft: 8,
                flexShrink: 0,
                ...(badge.style || {}),
              }}
            >
              {badge.label}
            </span>
          )}
        </div>
      )}

      {/* ── Location blocks (Origin / Destination grid) ─────────────────────── */}
      {locations?.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(locations.length, 2)}, 1fr)`,
            gap: 8,
          }}
        >
          {locations.map((loc) => (
            <LocationBlock key={loc.label} label={loc.label} data={loc.data} />
          ))}
        </div>
      )}

      {/* ── Detail fields grid ───────────────────────────────────────────────── */}
      {fields?.filter((f) => f.value != null && f.value !== "").length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {fields
            .filter((f) => f.value != null && f.value !== "")
            .map(({ label, value, fullWidth }) => (
              <div key={label} style={fullWidth ? { gridColumn: "1 / -1" } : {}}>
                <p style={{ fontSize: 10, color: "#9ca3af", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {label}
                </p>
                <p style={{ fontSize: 12, color: "#111827", fontWeight: 500, margin: "1px 0 0", wordBreak: "break-word" }}>
                  {value}
                </p>
              </div>
            ))}
        </div>
      )}

      {/* ── Custom children ──────────────────────────────────────────────────── */}
      {children}

      {/* ── Action buttons ───────────────────────────────────────────────────── */}
      {actions?.length > 0 && (
        <div style={{ display: "flex", gap: 8, paddingTop: 4, flexWrap: "wrap" }}>
          {actions.map(({ label, icon, color = "#2563eb", onClick, disabled, textColor = "#fff", variant = "solid", flex }) => {
            const isSolid   = variant === "solid";
            const isOutline = variant === "outline";
            return (
              <button
                key={label}
                onClick={onClick}
                disabled={disabled}
                style={{
                  flex: flex || (icon && !label ? "0 0 auto" : 1),
                  padding: icon && !label ? "6px 10px" : "7px 12px",
                  borderRadius: 7,
                  border: isOutline ? `1.5px solid ${color}` : "none",
                  backgroundColor: isSolid ? color : "transparent",
                  color: isOutline ? color : textColor,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.5 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: icon && label ? 4 : 0,
                  whiteSpace: "nowrap",
                }}
              >
                {icon}
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── Attach helpers so consumers can do MobileCard.mobileCardStatusColors ──────
MobileCard.statusColors = mobileCardStatusColors;
MobileCard.LocationBlock = LocationBlock;

export default MobileCard;