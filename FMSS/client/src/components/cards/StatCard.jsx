import React from "react";


const colorMap = {
  blue:   { border: "border-blue-600",   icon: "bg-blue-100   text-blue-600"   },
  indigo: { border: "border-indigo-600", icon: "bg-indigo-100 text-indigo-600" },
  gray:   { border: "border-gray-500",   icon: "bg-gray-100   text-gray-600"   },
  yellow: { border: "border-yellow-500", icon: "bg-yellow-100 text-yellow-600" },
  green:  { border: "border-green-600",  icon: "bg-green-100  text-green-600"  },
  red:    { border: "border-red-600",    icon: "bg-red-100    text-red-600"    },
  orange: { border: "border-orange-500", icon: "bg-orange-100 text-orange-600" },
  purple: { border: "border-purple-600", icon: "bg-purple-100 text-purple-600" },
};

// Type 1 — large stat card with icon (for main stats)
export const StatCard = ({ title, value, icon, color = "indigo", onClick }) => {
  const c = colorMap[color] || colorMap.indigo;
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl shadow-sm p-6 border-l-4 ${c.border} ${
        onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-500">{title}</p>
          <p className="text-3xl font-normal mt-2">{value}</p>
        </div>
        <div className={`p-3 rounded-full ${c.icon}`}>
          {icon}
        </div>
      </div>
    </div>
  );
};

// Type 2 — compact summary card (for loads summary grid)
export const SummaryCard = ({ stats = [] }) => {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
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
                  ${isEven ? "bg-white" : "bg-gray-50"}
                  ${onClick ? "cursor-pointer  hover:bg-indigo-50 transition-colors duration-150" : ""}
                  border-b border-gray-200 last:border-0
                `}
              >
                <td className={`${onClick ? "text-indigo-600" : "text-gray-500"}`}>{label}</td>
                <td className={`font-normal tabular-nums text-gray-600`}>{value}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export const WeeklySummaryCard = ({ stats, onClick }) => {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition ${
        onClick ? "cursor-pointer hover:border-indigo-300" : ""
      }`}
    >

      {/* Day */}
      <div className="text-sm text-gray-500 mb-3 font-medium text-center">
        {stats.weekDay}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-2 text-center">
        
        {/* Delivery */}
        <div className="bg-green-50 rounded-lg py-2 flex flex-row justify-center gap-2 items-center">
          <p className="text-xs font-normal text-gray-500">DL</p>
          <p className="text-sm font-normal text-green-600">
            {stats.Delivery}
          </p>
        </div>

        {/* Pickup */}
        <div className="bg-blue-50 rounded-lg py-2 flex flex-row justify-center gap-2 items-center">
          <p className="text-xs font-normal text-gray-500">PU</p>
          <p className="text-sm font-normal text-blue-600">
            {stats.Pickup}
          </p>
        </div>

        {/* Drop */}
        <div className="bg-purple-50 rounded-lg py-2 flex flex-row justify-center gap-2 items-center">
          <p className="text-xs font-normal text-gray-500">DR</p>
          <p className="text-sm font-normal text-purple-600">
            {stats.Drop}
          </p>
        </div>

      </div>
    </div>
  );
};

export default StatCard;