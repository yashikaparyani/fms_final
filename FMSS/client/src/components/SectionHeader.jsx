import React from "react";

const SectionHeader = ({
  title,
  subtitle,
  rightContent,
  icon,          // simple icon (e.g. <DashboardIcon />)
  titleExtra,    // full JSX (your pickup → drop UI)
  className = "",
}) => {
  if (!title && !rightContent && !titleExtra) return null;

  return (
    <div className={`flex items-center justify-between mb-4 ${className}`}>
      
      {/* LEFT SIDE */}
      <div>
        {/* Title row */}
        <div className="flex items-center gap-2">
          {icon && <span className="text-gray-600">{icon}</span>}

          {title && (
            <h2 className="text-lg font-bold text-gray-900">
              {title}
            </h2>
          )}
        </div>

        {/* Subtitle */}
        {subtitle && (
          <p className="text-sm text-gray-500 mt-0.5">
            {subtitle}
          </p>
        )}

        {/* Custom JSX below title (🔥 your use-case) */}
        {titleExtra && (
          <div className="mt-1">{titleExtra}</div>
        )}
      </div>

      {/* RIGHT SIDE */}
      {rightContent && <div>{rightContent}</div>}
    </div>
  );
};

export default SectionHeader;