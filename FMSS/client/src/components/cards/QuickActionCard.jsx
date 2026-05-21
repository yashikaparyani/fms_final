import React from "react";

const colorMap = {
  blue:   { bg: "bg-blue-50",   icon: "text-blue-600",   hover: "hover:border-blue-300   hover:bg-blue-50"   },
  green:  { bg: "bg-green-50",  icon: "text-green-600",  hover: "hover:border-green-300  hover:bg-green-50"  },
  yellow: { bg: "bg-yellow-50", icon: "text-yellow-600", hover: "hover:border-yellow-300 hover:bg-yellow-50" },
  gray:   { bg: "bg-gray-50",   icon: "text-gray-600",   hover: "hover:border-gray-300   hover:bg-gray-50"   },
  indigo: { bg: "bg-indigo-50", icon: "text-indigo-600", hover: "hover:border-indigo-300 hover:bg-indigo-50" },
  red:    { bg: "bg-red-50",    icon: "text-red-600",    hover: "hover:border-red-300    hover:bg-red-50"    },
  purple: { bg: "bg-purple-50", icon: "text-purple-600", hover: "hover:border-purple-300 hover:bg-purple-50" },
  orange: { bg: "bg-orange-50", icon: "text-orange-600", hover: "hover:border-orange-300 hover:bg-orange-50" },
};

const QuickActionCard = ({ label, icon, color = "gray", onClick }) => {
  const c = colorMap[color] || colorMap.gray;

  return (
    <button
      onClick={onClick}
      className={`group flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-gray-200 bg-white ${c.hover} transition-all duration-200 shadow-sm hover:shadow-md`}
    >
      <div className={`p-3 rounded-xl ${c.bg} ${c.icon} group-hover:scale-110 transition-transform duration-200`}>
        {icon}
      </div>
      <span className="text-xs font-medium text-gray-600 text-center leading-tight">
        {label}
      </span>
    </button>
  );
};

export default QuickActionCard;