import { useEffect, useRef, useState } from "react";
import PlaceIcon from "@mui/icons-material/Place";
import api from "../api";
import { getActiveLocation, isAllLocations } from "../utils/activeLocation";
import { uiStyles } from "../style/uiStyles";

/**
 * "Available at" — which locations list this record and offer it in their
 * dropdowns. Used on customers, carriers, stop companies, street-turn
 * partners, shipping lines and chassis companies.
 *
 * Offers only the locations the signed-in user works in (an admin sees all).
 * Anything the record is also available at outside that set is shown as a
 * count and kept by the server on save — see server/utils/availability.js.
 *
 * Renders nothing for someone with a single location: there is nothing to
 * choose, and the server files the record under that location by itself.
 *
 * `value` is undefined for a brand-new record; the picker then preselects the
 * location being worked in and reports it through `onChange`.
 */
const LocationAvailabilityPicker = ({ value, onChange, disabled = false, hint }) => {
  const [branches, setBranches] = useState(null);
  const seeded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/branches/mine")
      .then(({ data }) => !cancelled && setBranches(data.branches || []))
      .catch(() => !cancelled && setBranches([]));
    return () => {
      cancelled = true;
    };
  }, []);

  // New record: start from the location being worked in. In "all locations"
  // view there is no such location, so nothing is ticked and the user picks.
  useEffect(() => {
    if (!branches || seeded.current || value !== undefined) return;
    seeded.current = true;
    if (branches.length < 2) return;
    const active = getActiveLocation();
    if (active && !isAllLocations(active) && branches.some((b) => b._id === active)) {
      onChange([active]);
    } else {
      onChange([]);
    }
  }, [branches, value, onChange]);

  if (!branches || branches.length < 2) return null;

  const selected = (value || []).map(String);
  const mine = new Set(branches.map((b) => String(b._id)));
  const elsewhere = selected.filter((id) => !mine.has(id)).length;
  const mineSelected = selected.filter((id) => mine.has(id));

  const toggle = (id) =>
    onChange(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
    );

  const allMine = branches.every((b) => selected.includes(String(b._id)));
  const setAll = (on) =>
    onChange(
      on
        ? [...new Set([...selected, ...branches.map((b) => String(b._id))])]
        : selected.filter((id) => !mine.has(id)),
    );

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <label className={uiStyles.label}>
          Available at locations <span className="text-red-500">*</span>
        </label>
        <button
          type="button"
          className="text-xs font-medium text-accent-600 hover:underline disabled:opacity-50"
          onClick={() => setAll(!allMine)}
          disabled={disabled}
        >
          {allMine ? "Clear all" : "Select all"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {branches.map((branch) => {
          const id = String(branch._id);
          const on = selected.includes(id);
          return (
            <label
              key={id}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm cursor-pointer select-none transition-colors ${
                on
                  ? "bg-accent-50 border-accent-600 text-accent-700"
                  : "bg-surface border-ink-300 text-ink-600 hover:border-ink-400"
              } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              <input
                type="checkbox"
                className="rounded"
                checked={on}
                onChange={() => toggle(id)}
                disabled={disabled}
              />
              <PlaceIcon style={{ fontSize: 15 }} />
              {branch.name}
            </label>
          );
        })}
      </div>

      <p className="text-[13px] text-gray-500 mt-1.5">
        {hint || "Only the ticked locations will list this and offer it in their dropdowns."}
        {elsewhere > 0 &&
          ` Also available at ${elsewhere} other location${elsewhere > 1 ? "s" : ""} you don't manage — that stays as it is.`}
      </p>
      {mineSelected.length === 0 && elsewhere === 0 && (
        <p className="text-[13px] text-red-600 mt-1">Tick at least one location.</p>
      )}
    </div>
  );
};

export default LocationAvailabilityPicker;
