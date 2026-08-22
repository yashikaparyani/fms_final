import React from "react";

/**
 * The colour-coded action tile from the dashboards — the web twin of the
 * mobile `ActionTile`. Same idea: a white card with a tinted icon chip, so a
 * grid of eight of them stays readable while each still carries its own colour.
 */

const colorMap = {
  blue: { chip: "bg-accent-100 text-accent-700", ring: "hover:border-accent-500" },
  indigo: { chip: "bg-accent-100 text-accent-700", ring: "hover:border-accent-500" },
  green: { chip: "bg-good-100 text-good-700", ring: "hover:border-good-500" },
  yellow: { chip: "bg-warn-100 text-warn-700", ring: "hover:border-warn-500" },
  red: { chip: "bg-bad-100 text-bad-700", ring: "hover:border-bad-500" },
  orange: { chip: "bg-fuel-100 text-fuel-600", ring: "hover:border-fuel-500" },
  purple: { chip: "bg-grape-100 text-grape-600", ring: "hover:border-grape-500" },
  teal: { chip: "bg-aqua-100 text-aqua-600", ring: "hover:border-aqua-500" },
  pink: { chip: "bg-rose-100 text-rose-600", ring: "hover:border-rose-500" },
  gray: { chip: "bg-ink-100 text-ink-600", ring: "hover:border-ink-400" },
};

const QuickActionCard = ({ label, sublabel, icon, color = "gray", badge, onClick }) => {
  const c = colorMap[color] || colorMap.gray;

  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-col items-center justify-center gap-2 p-4
        rounded-card border border-hairline bg-surface shadow-card
        transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5 ${c.ring}`}
    >
      {badge ? (
        <span
          className="absolute top-2 right-2 min-w-5 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold text-white"
          style={{ background: "var(--role-accent)" }}
        >
          {badge}
        </span>
      ) : null}

      <div
        className={`p-3 rounded-xl ${c.chip} transition-transform duration-200 group-hover:scale-110`}
      >
        {icon}
      </div>

      <span className="text-xs font-bold text-ink-700 text-center leading-tight">
        {label}
      </span>
      {sublabel ? (
        <span className="text-[11px] font-medium text-ink-400 text-center leading-tight">
          {sublabel}
        </span>
      ) : null}
    </button>
  );
};

export default QuickActionCard;
