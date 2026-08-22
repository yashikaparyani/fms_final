import { useState } from "react";
import PaletteOutlinedIcon from "@mui/icons-material/PaletteOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { COLOR_MODE, legendFor } from "../utils/loadColorMode";
import { URGENCY, URGENCY_COLORS, URGENCY_LABEL } from "../utils/loadUrgency";

/**
 * The "colour rows by…" control that sits above the load tables.
 *
 * A checkbox was the obvious shape and the wrong one: "colour by status" ticked
 * off does not say what you get instead. Two labelled options say it.
 *
 * The legend is collapsed by default and lists only the values actually on
 * screen — a permanent key to sixteen statuses, twelve of which are not in the
 * table, is something people learn to scroll past.
 */

const URGENCY_ORDER = [
  URGENCY.URGENT,
  URGENCY.SOON,
  URGENCY.LATER,
  URGENCY.EXPIRED,
  URGENCY.NO_DATE,
];

const LoadColorModeToggle = ({ mode, setMode, rows = [], className = "" }) => {
  const [showLegend, setShowLegend] = useState(false);
  const isStatus = mode === COLOR_MODE.STATUS;

  const legend = isStatus
    ? legendFor(rows)
    : URGENCY_ORDER.map((key) => ({
        status: key,
        label: URGENCY_LABEL[key].text,
        ...URGENCY_COLORS[key],
      }));

  const option = (value, label, hint) => {
    const on = mode === value;
    return (
      <button
        key={value}
        type="button"
        onClick={() => setMode(value)}
        title={hint}
        aria-pressed={on}
        style={on ? { background: "var(--role-accent)" } : undefined}
        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
          on ? "text-white shadow-card" : "text-ink-600 hover:bg-ink-100"
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <div className="flex items-center gap-2">
        <PaletteOutlinedIcon fontSize="small" className="text-ink-400" />
        <span className="text-xs font-semibold text-ink-500">Colour rows by</span>
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-hairline bg-surface p-1">
        {option(COLOR_MODE.PRIORITY, "Priority", "Tint rows by how soon they pick up")}
        {option(COLOR_MODE.STATUS, "Status", "Tint rows by where the load actually is")}
      </div>

      {legend.length > 0 && (
        <button
          type="button"
          onClick={() => setShowLegend((v) => !v)}
          className="flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-ink-700 transition-colors"
        >
          Key
          <ExpandMoreIcon
            style={{
              fontSize: 16,
              transform: showLegend ? "rotate(180deg)" : "none",
              transition: "transform 150ms",
            }}
          />
        </button>
      )}

      {showLegend && (
        <div className="w-full flex flex-wrap gap-x-4 gap-y-2 rounded-lg border border-hairline bg-ink-50 p-3">
          {legend.map((entry) => (
            <span key={entry.status} className="flex items-center gap-1.5">
              <span
                className="h-3 w-3 rounded-sm border"
                style={{ background: entry.bg, borderColor: entry.border }}
              />
              <span className="text-[11px] font-semibold text-ink-600">
                {entry.label}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default LoadColorModeToggle;
