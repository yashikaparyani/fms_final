import React from "react";

/**
 * Dashboard cards.
 *
 * The colour map is the same set of accents the mobile tiles use, so a stat
 * that is green on a phone is green on the desktop. Each card carries its
 * accent as a top edge plus a tinted icon chip rather than as a filled block —
 * a dashboard of eight saturated cards is unreadable, and the tint keeps the
 * number itself the loudest thing on the card.
 */

const colorMap = {
  blue: { bar: "#1D6FE0", chip: "bg-accent-100 text-accent-700" },
  indigo: { bar: "#1D6FE0", chip: "bg-accent-100 text-accent-700" },
  gray: { bar: "#64748B", chip: "bg-ink-100 text-ink-600" },
  yellow: { bar: "#F59E0B", chip: "bg-warn-100 text-warn-700" },
  green: { bar: "#16A34A", chip: "bg-good-100 text-good-700" },
  red: { bar: "#DC2626", chip: "bg-bad-100 text-bad-700" },
  orange: { bar: "#F97316", chip: "bg-fuel-100 text-fuel-600" },
  purple: { bar: "#7C3AED", chip: "bg-grape-100 text-grape-600" },
  teal: { bar: "#0D9488", chip: "bg-aqua-100 text-aqua-600" },
  pink: { bar: "#EC4899", chip: "bg-rose-100 text-rose-600" },
  navy: { bar: "#0B1E3D", chip: "bg-brand-100 text-brand-700" },
};

// Type 1 — large stat card with icon (for main stats)
export const StatCard = ({ title, value, icon, color = "indigo", hint, onClick }) => {
  const c = colorMap[color] || colorMap.indigo;

  return (
    <div
      onClick={onClick}
      style={{ "--accent": c.bar }}
      className={`card-accent bg-surface rounded-card border border-hairline shadow-card p-5 ${
        onClick ? "cursor-pointer card-hover" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            {title}
          </p>
          <p className="text-3xl font-extrabold tabular-nums text-ink-900 mt-1.5 tracking-tight">
            {value}
          </p>
          {hint ? <p className="text-xs text-ink-400 mt-1">{hint}</p> : null}
        </div>
        <div className={`shrink-0 p-2.5 rounded-xl ${c.chip}`}>{icon}</div>
      </div>
    </div>
  );
};

// Type 2 — compact summary card (for loads summary grid)
export const SummaryCard = ({ stats = [] }) => {
  return (
    <div className="overflow-hidden rounded-card border border-hairline bg-surface shadow-card">
      <table className="w-full text-sm">
        <tbody>
          {stats.map(({ label, value, onClick }, index) => {
            const isEven = index % 2 === 0;
            return (
              <tr
                key={label}
                onClick={onClick}
                className={`
                  flex items-center justify-between px-4 py-2.5
                  ${isEven ? "bg-surface" : "bg-ink-50"}
                  ${
                    onClick
                      ? "cursor-pointer hover:bg-accent-50 transition-colors duration-150"
                      : ""
                  }
                  border-b border-hairline last:border-0
                `}
              >
                <td
                  className={`text-[13px] font-medium ${
                    onClick ? "text-accent-700" : "text-ink-500"
                  }`}
                >
                  {label}
                </td>
                <td className="font-bold tabular-nums text-ink-800">{value}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export const WeeklySummaryCard = ({ stats, onClick }) => {
  const isToday = stats.weekDay === "Today";

  return (
    <div
      onClick={onClick}
      style={isToday ? { "--accent": "var(--role-accent)" } : undefined}
      className={`bg-surface rounded-card border shadow-card p-2.5 xl:p-2 transition-all duration-200 ${
        isToday ? "card-accent border-transparent ring-1 ring-accent-100" : "border-hairline"
      } ${onClick ? "cursor-pointer card-hover" : ""}`}
    >
      {/* Day */}
      <div
        className={`text-[13px] font-semibold text-center whitespace-nowrap ${
          isToday ? "text-ink-800" : "text-ink-500"
        } ${isToday && stats.date ? "mb-0.5" : "mb-3"}`}
      >
        {stats.weekDay}
      </div>
      {isToday && stats.date && (
        <div
          className="text-[11px] font-bold text-center mb-3 whitespace-nowrap"
          style={{ color: "var(--role-accent)" }}
        >
          {new Date(stats.date + "T00:00:00").toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-2 text-center">
        {/* Delivery */}
        <div className="bg-good-50 rounded-lg py-2 flex flex-row justify-center gap-2 items-center">
          <p className="text-[11px] font-semibold text-ink-500">DL</p>
          <p className="text-sm font-extrabold tabular-nums text-good-700">{stats.Delivery}</p>
        </div>

        {/* Pickup */}
        <div className="bg-accent-50 rounded-lg py-2 flex flex-row justify-center gap-2 items-center">
          <p className="text-[11px] font-semibold text-ink-500">PU</p>
          <p className="text-sm font-extrabold tabular-nums text-accent-700">{stats.Pickup}</p>
        </div>

        {/* Drop — a drop-and-pick move, so "D/P" rather than "DR" */}
        <div className="bg-grape-100/60 rounded-lg py-2 flex flex-row justify-center gap-2 items-center">
          <p className="text-[11px] font-semibold text-ink-500">D/P</p>
          <p className="text-sm font-extrabold tabular-nums text-grape-600">{stats.Drop}</p>
        </div>
      </div>
    </div>
  );
};

export default StatCard;
