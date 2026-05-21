import { TRANSPORT_STATUS_COLOR } from "./StatusChip";

const fmtFull = (v) =>
  v
    ? new Date(v).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const formatDuration = (ms) => {
  if (ms < 0) return "—";
  const totalMins = Math.floor(ms / 60000);
  const days = Math.floor(totalMins / 1440);
  const hours = Math.floor((totalMins % 1440) / 60);
  const mins = totalMins % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

const StatusTimeline = ({ history = [] }) => {
  if (!history.length) {
    return (
      <p className="px-5 py-5 text-sm text-gray-400 italic">
        No status history recorded yet.
      </p>
    );
  }

  const sorted = [...history].sort(
    (a, b) => new Date(a.changedAt) - new Date(b.changedAt)
  );

  const rows = sorted.map((entry, idx) => {
    const next = sorted[idx + 1];
    const from = new Date(entry.changedAt);
    const to = next ? new Date(next.changedAt) : null;
    const duration = to ? formatDuration(to - from) : null;
    const isCurrent = idx === sorted.length - 1;
    const colors = TRANSPORT_STATUS_COLOR[entry.status] || {
      bg: "#f3f4f6",
      color: "#6b7280",
      border: "#e5e7eb",
    };
    return { ...entry, duration, isCurrent, colors, from, to };
  });

  return (
    <div className="px-5 py-4">
      <div className="relative">
        {/* Vertical connector line */}
        <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-gray-200 z-0" />

        {rows.map((row, idx) => (
          <div
            key={idx}
            className="flex items-start gap-4 relative z-10"
            style={{ marginBottom: idx < rows.length - 1 ? 20 : 0 }}
          >
            {/* Dot */}
            <div
              className="w-[30px] h-[30px] rounded-full shrink-0 flex items-center justify-center"
              style={{
                backgroundColor: row.isCurrent ? row.colors.bg : "#f9fafb",
                border: `2px solid ${row.isCurrent ? row.colors.color : "#d1d5db"}`,
                boxShadow: row.isCurrent ? `0 0 0 3px ${row.colors.bg}` : "none",
              }}
            >
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{
                  backgroundColor: row.isCurrent ? row.colors.color : "#9ca3af",
                }}
              />
            </div>

            {/* Card */}
            <div
              className="flex-1 rounded-xl p-3"
              style={{
                backgroundColor: "#fff",
                border: `1px solid ${row.isCurrent ? row.colors.border : "#f3f4f6"}`,
                boxShadow: row.isCurrent ? `0 0 0 2px ${row.colors.bg}` : "none",
              }}
            >
              {/* Top row: chip + duration */}
              <div className="flex items-center justify-between flex-wrap gap-1.5">
                <span
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold"
                  style={{
                    backgroundColor: row.colors.bg,
                    color: row.colors.color,
                    border: `1px solid ${row.colors.border}`,
                  }}
                >
                  {row.status.replace(/_/g, " ")}
                  {row.isCurrent && (
                    <span
                      className="ml-1.5 text-[9px] font-extrabold px-1 py-px rounded-full text-white"
                      style={{ backgroundColor: row.colors.color }}
                    >
                      CURRENT
                    </span>
                  )}
                </span>

                {row.duration ? (
                  <span className="badge-gray text-[11px]">⏱ {row.duration}</span>
                ) : (
                  <span
                    className="text-[11px] font-semibold px-2 py-px rounded-full border"
                    style={{
                      color: row.colors.color,
                      backgroundColor: row.colors.bg,
                      borderColor: row.colors.border,
                    }}
                  >
                    ⏳ In progress
                  </span>
                )}
              </div>

              {/* Timestamp */}
              <p className="mt-1.5 text-[11px] text-gray-400">
                Changed at:{" "}
                <span className="text-gray-600 font-semibold">{fmtFull(row.changedAt)}</span>
                {row.to && (
                  <span className="ml-2">
                    → <span className="text-gray-600 font-semibold">{fmtFull(row.to)}</span>
                  </span>
                )}
              </p>

              {/* Note */}
              {row.note && (
                <p className="mt-1.5 text-xs text-gray-700 bg-gray-50 rounded-md px-2 py-1 border-l-2 border-gray-300">
                  {row.note}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StatusTimeline;