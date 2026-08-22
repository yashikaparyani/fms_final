import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import MenuIcon from "@mui/icons-material/Menu";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

import { visibleNavItems } from "./navItems";
import { usePermissions } from "../hooks/usePermissions";

const Sidebar = ({ isMenuOpen, setIsMenuOpen }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = usePermissions();
  const role = user?.role;

  // Role and permission are both applied here — see navItems.js.
  const items = visibleNavItems(user);

  // Which groups the user has opened by hand. A group holding the current screen
  // is open regardless, so landing on Report Centre from a link never leaves the
  // rail looking as though that screen belongs nowhere.
  const [openGroups, setOpenGroups] = useState({});

  const isActive = (path) => location.pathname === `/${role}/${path}`;

  const holdsActive = (item) =>
    (item.children || []).some((child) => isActive(child.path));

  const handleNavigate = (path) => {
    navigate(`/${role}/${path}`);
  };

  const toggleGroup = (label) => {
    // On a collapsed rail there is nowhere to show children, so opening a group
    // opens the rail with it rather than doing nothing visible.
    if (!isMenuOpen) setIsMenuOpen(true);
    setOpenGroups((current) => ({ ...current, [label]: !current[label] }));
  };

  // The active row is painted in the signed-in portal's own accent
  // (--role-accent), so the rail says which product you are in before you have
  // read a word of it.
  const rowClasses = (active) =>
    `group flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 ${
      active
        ? "text-white shadow-[0_4px_14px_rgba(0,0,0,0.35)]"
        : "text-brand-100/70 hover:bg-white/10 hover:text-white"
    }`;

  const rowStyle = (active) =>
    active ? { background: "var(--role-accent)" } : undefined;

  return (
    <div className="hidden md:flex flex-col w-full brand-gradient shadow-rail h-screen transition-all duration-300">
      {/* Header */}
      <div className="mb-2 flex h-16 border-b border-white/10">
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={`w-full flex items-center transition-colors hover:bg-white/5 ${
            isMenuOpen ? "justify-between px-4" : "justify-center"
          }`}
        >
          {isMenuOpen ? (
            <>
              <span className="flex items-center gap-2 text-xl font-extrabold tracking-wide text-white">
                <span
                  className="grid h-8 w-8 place-items-center rounded-lg text-[13px]"
                  style={{ background: "var(--role-accent)" }}
                >
                  SL
                </span>
                S&nbsp;LINE
                <span className="text-accent-500">TRANSPORT</span>
              </span>
              <ChevronLeftIcon className="text-brand-100/70" />
            </>
          ) : (
            <MenuIcon className="text-brand-100/70" />
          )}
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {items.map((item) => {
          const Icon = item.icon;

          // ── A plain screen ──────────────────────────────────────────────
          if (!item.children) {
            const active = isActive(item.path);

            return (
              <div
                key={item.path}
                onClick={() => handleNavigate(item.path)}
                title={!isMenuOpen ? item.label : undefined}
                className={rowClasses(active)}
                style={rowStyle(active)}
              >
                <Icon className={active ? "text-white" : ""} fontSize="small" />
                {isMenuOpen && (
                  <span className="text-sm font-medium">{item.label}</span>
                )}
              </div>
            );
          }

          // ── A group of screens ──────────────────────────────────────────
          const containsActive = holdsActive(item);
          const expanded = openGroups[item.label] ?? containsActive;

          return (
            <div key={item.label}>
              <div
                onClick={() => toggleGroup(item.label)}
                title={!isMenuOpen ? item.label : undefined}
                className={rowClasses(false)}
              >
                <Icon
                  fontSize="small"
                  style={
                    containsActive ? { color: "var(--role-accent)" } : undefined
                  }
                />
                {isMenuOpen && (
                  <>
                    <span
                      className={`text-sm font-medium flex-1 ${
                        containsActive ? "text-white" : ""
                      }`}
                    >
                      {item.label}
                    </span>
                    {expanded ? (
                      <ExpandMoreIcon fontSize="small" />
                    ) : (
                      <ChevronRightIcon fontSize="small" />
                    )}
                  </>
                )}
              </div>

              {isMenuOpen && expanded && (
                <div className="mt-1 ml-4 space-y-1 border-l border-white/12 pl-2">
                  {item.children.map((child) => {
                    const active = isActive(child.path);
                    const ChildIcon = child.icon;

                    return (
                      <div
                        key={child.path}
                        onClick={() => handleNavigate(child.path)}
                        style={rowStyle(active)}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 ${
                          active
                            ? "text-white"
                            : "text-brand-100/60 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <ChildIcon fontSize="small" style={{ fontSize: 17 }} />
                        <span className="text-[13px] font-medium">
                          {child.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* A staff account with nothing granted would otherwise render a blank
            rail with no hint that anything is wrong. */}
        {items.length <= 1 && role === "staff" && isMenuOpen && (
          <p className="px-4 py-3 text-xs text-brand-100/50 leading-relaxed">
            No modules have been assigned to you yet. Ask an administrator to
            grant access.
          </p>
        )}
      </nav>
    </div>
  );
};

export default Sidebar;
