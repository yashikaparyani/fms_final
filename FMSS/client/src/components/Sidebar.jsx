import { useNavigate, useLocation } from "react-router-dom";

import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import MenuIcon from "@mui/icons-material/Menu";

import { visibleNavItems } from "./navItems";
import { usePermissions } from "../hooks/usePermissions";

const Sidebar = ({ isMenuOpen, setIsMenuOpen }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = usePermissions();
  const role = user?.role;

  // Role and permission are both applied here — see navItems.js.
  const items = visibleNavItems(user);


  // ✅ Better Active Checker
  const isActive = (path) => {
    return location.pathname === `/${role}/${path}`;
  };

  const handleNavigate = (path) => {
    navigate(`/${role}/${path}`);
  };

  return (
    <div className="hidden md:flex flex-col w-full bg-gray-900 shadow h-screen transition-all duration-300">
      {/* Header */}
      <div className="mb-4 flex h-16 shadow border-b border-gray-800">
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={`w-full flex items-center  ${
            isMenuOpen ? "justify-between px-4" : "justify-center"
          }`}
        >
          {isMenuOpen ? (
            <>
              <span className="text-2xl font-bold tracking-wide text-white">
                Freight
              </span>
              <ChevronLeftIcon className="text-gray-300" />
            </>
          ) : (
            <MenuIcon className="text-gray-300" />
          )}
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);

          return (
            <div
              key={item.path}
              onClick={() => handleNavigate(item.path)}
              title={!isMenuOpen ? item.label : undefined}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg cursor-pointer transition-colors
          ${
            active
              ? "bg-indigo-600 text-white"
              : "text-gray-300 hover:bg-gray-800 hover:text-white"
          }`}
            >
              <Icon className={active ? "text-white" : ""} fontSize="small" />

              {isMenuOpen && (
                <span className="text-sm font-medium">{item.label}</span>
              )}
            </div>
          );
        })}

        {/* A staff account with nothing granted would otherwise render a blank
            rail with no hint that anything is wrong. */}
        {items.length <= 1 && role === "staff" && isMenuOpen && (
          <p className="px-4 py-3 text-xs text-gray-500 leading-relaxed">
            No modules have been assigned to you yet. Ask an administrator to
            grant access.
          </p>
        )}
      </nav>
    </div>
  );
};

export default Sidebar;
