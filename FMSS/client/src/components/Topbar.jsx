import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import LogoutIcon from "@mui/icons-material/Logout";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
import { useSelector, useDispatch } from "react-redux";
import { logout } from "../redux/authSlice";
import { navItems } from "./navItems";
import NotificationBell from "./NotificationBell"; // 👈 import

const Topbar = () => {
  const [isProfileOpen, setIsProfileOpen]       = useState(false);
  const [isNotificationOpen, setNotificationOpen] = useState(false); // 👈 controlled here
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navigate = useNavigate();
  const user     = useSelector((state) => state.auth.user);
  const dispatch = useDispatch();
  const role     = user?.role;

  const handleLogout = () => {
    dispatch(logout());
    navigate(`/${role}-login`);
  };

  const handleNavigate = (path) => {
    navigate(`/${role}/${path}`);
    setIsMobileMenuOpen(false);
  };

  const isActive = (path) =>
    window.location.pathname === `/${role}/${path}`;

  const filteredNavItems = navItems.filter((item) =>
    item.visible.includes(role)
  );

  return (
    <>
      <div className="w-full bg-white h-16 shadow flex items-center" style={{ zIndex: 100 }}>
        {/* Left: Logo (mobile) */}
        <div className="flex items-center px-4 md:hidden">
          <span className="text-xl font-bold text-gray-900">Freight</span>
        </div>

        {/* Right section */}
        <div className="flex justify-end px-4 md:px-8 h-full w-full items-center gap-4">

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
            const Icon   = item.icon;
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
          })}
        </div>
      )}
    </>
  );
};

export default Topbar;