import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import LogoutIcon from "@mui/icons-material/Logout";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
import { useSelector, useDispatch } from "react-redux";
import { logout } from "../redux/authSlice";
import { visibleNavItems } from "./navItems";
import NotificationBell from "./NotificationBell"; // 👈 import
import LocationSwitcher from "./LocationSwitcher";
import { clearActiveLocation } from "../utils/activeLocation";

const Topbar = () => {
  const [isProfileOpen, setIsProfileOpen]       = useState(false);
  const [isNotificationOpen, setNotificationOpen] = useState(false); // 👈 controlled here
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navigate = useNavigate();
  const user     = useSelector((state) => state.auth.user);
  const dispatch = useDispatch();
  const role     = user?.role;

  const handleLogout = () => {
    // Drop the stored branch too — otherwise the next person to sign in on this
    // machine starts pointed at a location that may not be theirs.
    clearActiveLocation();
    dispatch(logout());
    navigate(`/${role}-login`);
  };

  const handleNavigate = (path) => {
    navigate(`/${role}/${path}`);
    setIsMobileMenuOpen(false);
  };

  const isActive = (path) =>
    window.location.pathname === `/${role}/${path}`;

  // Same filter the sidebar uses, so the mobile menu can never offer a link the
  // desktop rail hides — see navItems.js.
  const filteredNavItems = visibleNavItems(user);

  // Groups start closed on a phone, where screen space is the scarce thing —
  // except the one holding the current screen, so the drawer always shows where
  // you are.
  const [openGroups, setOpenGroups] = useState({});
  const holdsActive = (item) =>
    (item.children || []).some((child) => isActive(child.path));

  return (
    <>
      <div className="w-full bg-white h-16 shadow flex items-center" style={{ zIndex: 100 }}>
        {/* Left: Logo (mobile) */}
        <div className="flex items-center px-4 md:hidden">
          <span className="text-xl font-bold text-gray-900">Freight</span>
        </div>

        {/* Right section */}
        <div className="flex justify-end px-4 md:px-8 h-full w-full items-center gap-4">

          {/* 📍 Active location — renders nothing for single-location users */}
          <LocationSwitcher />

          {/* 🔔 Notification Bell — replaces the old <span> */}
          <NotificationBell
            isOpen={isNotificationOpen}
            onToggle={() => {
              setNotificationOpen((v) => !v);
              setIsProfileOpen(false); // close profile if open
            }}
          />

          {/* Profile */}
          <div
            onClick={() => {
              setIsProfileOpen((v) => !v);
              setNotificationOpen(false); // close notifications if open
            }}
            className="relative flex cursor-pointer items-center gap-3"
          >
            <div className="w-10 h-10 rounded-full flex justify-center items-center bg-blue-600 text-white font-bold">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <div className="hidden md:flex flex-col">
              <h4 className="text-sm font-bold">{user?.firstName}</h4>
              <h4 className="text-xs text-gray-500">{user?.role?.toUpperCase()}</h4>
            </div>
            {isProfileOpen && (
              <div className="absolute z-40 w-40 shadow border-gray-200 border-r-2 cursor-pointer rounded-md border bg-white top-[120%] right-0 flex flex-col">
                <Link to="/profile">
                  <div className="flex hover:bg-gray-100 p-2 text-sm font-semibold text-gray-900 items-center gap-2">
                    <AccountCircleIcon fontSize="small" />
                    Profile
                  </div>
                </Link>
                <button onClick={handleLogout} className="w-full text-left">
                  <div className="flex hover:bg-gray-100 p-2 text-sm font-semibold text-gray-900 items-center gap-2">
                    <LogoutIcon fontSize="small" />
                    Logout
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Burger — mobile only */}
          <button
            className="md:hidden flex items-center justify-center w-10 h-10"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen
              ? <CloseIcon className="text-gray-700" />
              : <MenuIcon className="text-gray-700" />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown Nav */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-gray-900 w-full shadow-lg" style={{ zIndex: 99 }}>
          {filteredNavItems.map((item) => {
            const Icon = item.icon;

            // A plain screen.
            if (!item.children) {
              const active = isActive(item.path);
              return (
                <div
                  key={item.path}
                  onClick={() => handleNavigate(item.path)}
                  className={`flex items-center gap-3 px-5 py-3 cursor-pointer border-b border-gray-800
                    ${active
                      ? "bg-indigo-600 text-white"
                      : "text-gray-300 hover:bg-gray-800 hover:text-white"
                    }`}
                >
                  <Icon fontSize="small" />
                  <span className="text-sm font-medium">{item.label}</span>
                </div>
              );
            }

            // A group: tapping the header opens it in place rather than
            // navigating, because a group is not a screen.
            const containsActive = holdsActive(item);
            const expanded = openGroups[item.label] ?? containsActive;

            return (
              <div key={item.label}>
                <div
                  onClick={() =>
                    setOpenGroups((current) => ({
                      ...current,
                      [item.label]: !expanded,
                    }))
                  }
                  className="flex items-center gap-3 px-5 py-3 cursor-pointer border-b border-gray-800 text-gray-300 hover:bg-gray-800 hover:text-white"
                >
                  <Icon fontSize="small" />
                  <span className="text-sm font-medium flex-1">{item.label}</span>
                  <span className="text-xs text-gray-500">
                    {expanded ? "▾" : "▸"}
                  </span>
                </div>

                {expanded &&
                  item.children.map((child) => {
                    const active = isActive(child.path);
                    const ChildIcon = child.icon;
                    return (
                      <div
                        key={child.path}
                        onClick={() => handleNavigate(child.path)}
                        className={`flex items-center gap-3 pl-10 pr-5 py-2.5 cursor-pointer border-b border-gray-800
                          ${active
                            ? "bg-indigo-600 text-white"
                            : "text-gray-400 hover:bg-gray-800 hover:text-white"
                          }`}
                      >
                        <ChildIcon style={{ fontSize: 17 }} />
                        <span className="text-[13px] font-medium">
                          {child.label}
                        </span>
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

export default Topbar;