import { useEffect, useState } from "react";
import PlaceIcon from "@mui/icons-material/Place";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import api from "../api";
import {
  ALL_LOCATIONS,
  getActiveLocation,
  setActiveLocation,
} from "../utils/activeLocation";

/**
 * Which operating location the user is working in.
 *
 * Hidden entirely for anyone with a single location — most staff, and every
 * client and carrier — so the common case gains no clutter. Switching reloads
 * the app rather than refetching in place: nearly every screen holds
 * location-specific rows, and a hard reload is the honest way to guarantee none
 * of the previous branch's data survives on screen.
 */
const LocationSwitcher = () => {
  const [branches, setBranches] = useState([]);
  const [active, setActive] = useState(getActiveLocation());
  const [open, setOpen] = useState(false);
  const [canSwitch, setCanSwitch] = useState(false);

  useEffect(() => {
    let cancelled = false;

    api
      .get("/branches/mine")
      .then(({ data }) => {
        if (cancelled) return;
        setBranches(data.branches || []);
        setCanSwitch(!!data.canSwitch);

        // First load sends no header; adopt whichever branch the server chose
        // so the label matches the data actually on screen.
        if (!getActiveLocation() && data.activeLocationId) {
          setActiveLocation(data.activeLocationId);
          setActive(data.activeLocationId);
        }
      })
      .catch(() => {
        /* switcher is non-essential — stay quiet and render nothing */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!canSwitch || branches.length < 2) return null;

  const choose = (value) => {
    setOpen(false);
    if (value === active) return;
    setActiveLocation(value);
    window.location.reload();
  };

  const label =
    active === ALL_LOCATIONS
      ? "All locations"
      : branches.find((b) => b._id === active)?.name || "Select location";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-indigo-50 hover:border-indigo-300 transition"
        title="Switch location"
      >
        <PlaceIcon fontSize="small" className="text-indigo-600" />
        <span className="text-sm font-medium text-gray-700 max-w-[9rem] truncate">
          {label}
        </span>
        <ExpandMoreIcon fontSize="small" className="text-gray-400" />
      </button>

      {open && (
        <>
          {/* Click-away layer */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 right-0 top-[120%] w-60 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
            {branches.map((branch) => (
              <button
                key={branch._id}
                onClick={() => choose(branch._id)}
                className={`w-full text-left px-3 py-2 hover:bg-indigo-50 transition ${
                  branch._id === active ? "bg-indigo-100" : ""
                }`}
              >
                <div className="text-sm font-medium text-gray-800">{branch.name}</div>
                <div className="text-[11px] font-mono text-gray-500">
                  {branch.code}
                  {branch.city ? ` · ${branch.city}` : ""}
                </div>
              </button>
            ))}

            <button
              onClick={() => choose(ALL_LOCATIONS)}
              className={`w-full text-left px-3 py-2 border-t border-gray-200 hover:bg-indigo-50 transition ${
                active === ALL_LOCATIONS ? "bg-indigo-100" : ""
              }`}
            >
              <div className="text-sm font-medium text-gray-800">All locations</div>
              <div className="text-[11px] text-gray-500">
                Combined view — read-only reporting
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default LocationSwitcher;
