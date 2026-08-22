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
    navigate("/login");
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
      <div className="w-full bg-surface h-16 border-b border-hairline shadow-card flex items-center" style={{ zIndex: 100 }}>
        {/* Left: Logo (mobile) */}
        <div className="flex items-center px-4 md:hidden">
          <span className="flex items-center gap-1.5 text-lg font-extrabold text-brand-800">
            <span
              className="grid h-7 w-7 place-items-center rounded-md text-[11px] text-white"
              style={{ background: "var(--role-accent)" }}
            >
              SL
            </span>
            S&nbsp;LINE&nbsp;<span className="text-accent-600">TRANSPORT</span>
          </span>
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
            <div
              className="w-10 h-10 rounded-full flex justify-center items-center text-white font-bold shadow-card"
              style={{ background: "var(--role-accent)" }}
            >
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <div className="hidden md:flex flex-col">
              <h4 className="text-sm font-bold">{user?.firstName}</h4>
              <h4 className="text-[11px] font-semibold tracking-wide text-ink-500">{user?.role?.toUpperCase()}</h4>
            </div>
            {isProfileOpen && (
              <div className="absolute z-40 w-44 overflow-hidden cursor-pointer rounded-xl border border-hairline bg-surface shadow-card-hover top-[120%] right-0 flex flex-col">
                <Link to="/profile">
                  <div className="flex hover:bg-accent-50 hover:text-accent-700 px-3 py-2.5 text-sm font-semibold text-ink-800 items-center gap-2 transition-colors">
                    <AccountCircleIcon fontSize="small" />
                    Profile
                  </div>
                </Link>
                <button onClick={handleLogout} className="w-full text-left">
                  <div className="flex hover:bg-bad-50 hover:text-bad-700 px-3 py-2.5 text-sm font-semibold text-ink-800 items-center gap-2 transition-colors border-t border-hairline">
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
              ? <CloseIcon className="text-ink-700" />
              : <MenuIcon className="text-ink-700" />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown Nav */}
      {isMobileMenuOpen && (
        <div className="md:hidden brand-gradient w-full shadow-rail" style={{ zIndex: 99 }}>
          {filteredNavItems.map((item) => {
            const Icon = item.icon;

            // A plain screen.
            if (!item.children) {
              const active = isActive(item.path);
              return (
                <div
                  key={item.path}
                  onClick={() => handleNavigate(item.path)}
                  style={active ? { background: "var(--role-accent)" } : undefined}
                  className={`flex items-center gap-3 px-5 py-3 cursor-pointer border-b border-white/10
                    ${active
                      ? "text-white"
                      : "text-brand-100/70 hover:bg-white/10 hover:text-white"
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
                  className="flex items-center gap-3 px-5 py-3 cursor-pointer border-b border-white/10 text-brand-100/70 hover:bg-white/10 hover:text-white"
                >
                  <Icon fontSize="small" />
                  <span className="text-sm font-medium flex-1">{item.label}</span>
                  <span className="text-xs text-brand-100/50">
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
                        style={active ? { background: "var(--role-accent)" } : undefined}
                        className={`flex items-center gap-3 pl-10 pr-5 py-2.5 cursor-pointer border-b border-white/10
                          ${active
                            ? "text-white"
                            : "text-brand-100/60 hover:bg-white/10 hover:text-white"
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