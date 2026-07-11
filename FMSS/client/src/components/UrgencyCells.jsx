import LightbulbIcon from "@mui/icons-material/Lightbulb";
import LoadTable from "./LoadTable";
import { URGENCY_LABEL, daysUntil, isLfdAlarming } from "../utils/loadUrgency";

const { DateCell } = LoadTable;

/** Last Free Date, with a blinking bulb when the deadline is within 2 days. */
export const LfdCell = ({ row }) => (
  <div className="flex items-center gap-1">
    <DateCell value={row.lastFreeDate} showExpiry />
    {isLfdAlarming(row) && (
      <LightbulbIcon
        fontSize="small"
        className="animate-blink text-red-600"
        titleAccess={`Last free date in ${daysUntil(row.lastFreeDate)} day(s)`}
      />
    )}
  </div>
);

export const UrgencyBadge = ({ urgency }) => {
  const label = URGENCY_LABEL[urgency];
  if (!label) return <span className="text-gray-400 text-xs">—</span>;
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${label.className}`}>
      {label.text}
    </span>
  );
};

const LegendDot = ({ color, label }) => (
  <span className="flex items-center gap-1">
    <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
    {label}
  </span>
);

/** Explains the row tints and the bulb. Shown above each urgency-sorted table. */
export const UrgencyLegend = () => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-gray-600">
    <LegendDot color="#ef4444" label="Picks up in under 5 days" />
    <LegendDot color="#f59e0b" label="5–10 days" />
    <LegendDot color="#22c55e" label="More than 10 days" />
    <LegendDot color="#9ca3af" label="Expired / no date" />
    <span className="flex items-center gap-1">
      <LightbulbIcon fontSize="small" className="animate-blink text-red-600" />
      Last free date within 2 days
    </span>
  </div>
);
