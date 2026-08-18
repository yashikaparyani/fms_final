import { useMemo, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import AppSelect from "./AppSelect";
import { uiStyles } from "../style/uiStyles";
import { fleetOwnerLabel } from "../utils/fleetOwner";

// ─── Assigning a load to more than one carrier ────────────────────────────────
// A load that changes hands part way is described as a list of legs: one carrier
// takes it from the port to a yard, another takes it from the yard to the door.
// Each leg names its carrier and its own two ends.
//
// Each end is either a stop already on the load — picked from the dropdown, so
// the address comes off the load itself — or somewhere typed in that exists only
// for the handover. The yard two carriers meet at is usually the second kind,
// which is why free entry sits alongside the picker rather than behind a
// setting.
//
// One leg is the ordinary case and it stays the ordinary case: the dialog opens
// with a single leg whose ends default to the load's own pickup and drop, so
// assigning one carrier is still pick-a-name-and-save.
// ─────────────────────────────────────────────────────────────────────────────

const BLANK_POINT = {
  source: "CUSTOM",
  stopIndex: null,
  company: "",
  address: "",
  city: "",
  state: "",
  zip: "",
};

const blankLeg = () => ({
  _id: null,
  fleetOwnerId: "",
  origin: { ...BLANK_POINT },
  destination: { ...BLANK_POINT },
  carrierRate: "",
  note: "",
});

/** The stops on a load, as options for one end of a leg. */
const stopsOf = (load, kind) => {
  const list =
    kind === "origin"
      ? load?.pickups?.length
        ? load.pickups
        : [load?.pickup]
      : load?.drops?.length
        ? load.drops
        : [load?.drop];

  return (list || [])
    .filter(Boolean)
    .map((stop, index) => ({
      index,
      label:
        [stop.company, stop.city, stop.state].filter(Boolean).join(" · ") ||
        `${kind === "origin" ? "Pickup" : "Drop"} ${index + 1}`,
    }));
};

const pointSummary = (point) =>
  [point.company, point.city, point.state].filter(Boolean).join(", ");

// ─── One end of one leg ──────────────────────────────────────────────────────
const LegPoint = ({ label, value, stops, onChange }) => {
  const isStop = value.source === "STOP";

  const options = [
    ...stops.map((s) => ({ value: `stop:${s.index}`, label: s.label })),
    { value: "custom", label: "Somewhere else — type it in" },
  ];

  return (
    <div>
      <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500 block mb-1">
        {label}
      </label>

      <AppSelect
        options={options}
        value={isStop ? `stop:${value.stopIndex}` : "custom"}
        onChange={(picked) => {
          if (picked === "custom") {
            onChange({ ...BLANK_POINT, source: "CUSTOM" });
            return;
          }
          onChange({
            ...BLANK_POINT,
            source: "STOP",
            stopIndex: Number(String(picked).split(":")[1]),
          });
        }}
        placeholder="Choose…"
      />

      {isStop ? (
        <p className="text-[11px] text-gray-500 mt-1">
          Taken from the load — {stops[value.stopIndex]?.label || "stop"}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 mt-2">
          {[
            { key: "company", placeholder: "Company / yard", full: true },
            { key: "city", placeholder: "City" },
            { key: "state", placeholder: "State" },
          ].map((f) => (
            <input
              key={f.key}
              className={`${uiStyles.input} ${f.full ? "col-span-2" : ""}`}
              placeholder={f.placeholder}
              value={value[f.key] || ""}
              onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── The dialog ──────────────────────────────────────────────────────────────
const AssignCarrierLegsDialog = ({
  load,
  fleetOwners,
  saving,
  onSave,
  onClose,
}) => {
  const originStops = useMemo(() => stopsOf(load, "origin"), [load]);
  const destStops = useMemo(() => stopsOf(load, "destination"), [load]);

  // Worked out once, on mount. The dialog is mounted fresh per load (see the
  // key where it is rendered), so there is no stale state to reset and no
  // effect that has to notice the load changed underneath it.
  const [legs, setLegs] = useState(() => {
    if (load?.assignments?.length) {
      return load.assignments.map((leg) => ({
        _id: leg._id,
        fleetOwnerId: leg.fleetOwnerId?._id || leg.fleetOwnerId || "",
        origin: { ...BLANK_POINT, ...leg.origin },
        destination: { ...BLANK_POINT, ...leg.destination },
        carrierRate: leg.carrierRate ?? "",
        note: leg.note || "",
      }));
    }

    // A fresh split starts as the load already reads: its own pickup to its own
    // drop, with one carrier to name.
    return [
      {
        ...blankLeg(),
        fleetOwnerId: load?.assignedFleetOwner?.fleetOwnerId || "",
        origin: stopsOf(load, "origin").length
          ? { ...BLANK_POINT, source: "STOP", stopIndex: 0 }
          : { ...BLANK_POINT },
        destination: stopsOf(load, "destination").length
          ? { ...BLANK_POINT, source: "STOP", stopIndex: 0 }
          : { ...BLANK_POINT },
      },
    ];
  });
  const [error, setError] = useState("");

  if (!load) return null;

  const ownerOptions = fleetOwners.map((fo) => ({
    value: fo._id,
    label: fleetOwnerLabel(fo),
  }));

  const patchLeg = (index, patch) =>
    setLegs((current) =>
      current.map((leg, i) => (i === index ? { ...leg, ...patch } : leg)),
    );

  const addLeg = () =>
    setLegs((current) => {
      const previous = current[current.length - 1];
      // The next leg starts where the last one ended — that is what a handover
      // is, and making somebody retype the yard they just entered is how the
      // two ends end up not matching.
      return [
        ...current,
        {
          ...blankLeg(),
          origin: { ...previous.destination },
          destination: destStops.length
            ? { ...BLANK_POINT, source: "STOP", stopIndex: 0 }
            : { ...BLANK_POINT },
        },
      ];
    });

  const removeLeg = (index) =>
    setLegs((current) => current.filter((_, i) => i !== index));

  const submit = () => {
    if (legs.some((leg) => !leg.fleetOwnerId)) {
      setError("Every leg needs a carrier.");
      return;
    }

    const incomplete = legs.findIndex(
      (leg) =>
        (leg.origin.source === "CUSTOM" && !pointSummary(leg.origin)) ||
        (leg.destination.source === "CUSTOM" && !pointSummary(leg.destination)),
    );

    if (incomplete !== -1) {
      setError(`Leg ${incomplete + 1} needs both an origin and a destination.`);
      return;
    }

    setError("");
    onSave(
      legs.map((leg) => ({
        ...(leg._id ? { _id: leg._id } : {}),
        fleetOwnerId: leg.fleetOwnerId,
        origin: leg.origin,
        destination: leg.destination,
        carrierRate: leg.carrierRate === "" ? undefined : Number(leg.carrierRate),
        note: leg.note,
      })),
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl my-6">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-200 p-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Assign carriers — {load.loadId}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              One carrier for the whole load, or split it into legs with a
              handover point in between.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Legs */}
        <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
          {legs.map((leg, index) => (
            <div key={index} className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
                  {legs.length === 1 ? "Carrier" : `Leg ${index + 1}`}
                </span>
                {legs.length > 1 && (
                  <button
                    onClick={() => removeLeg(index)}
                    className="text-red-600 hover:text-red-800"
                    aria-label={`Remove leg ${index + 1}`}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </button>
                )}
              </div>

              <div className="mb-3">
                <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500 block mb-1">
                  Carrier
                </label>
                <AppSelect
                  options={ownerOptions}
                  value={leg.fleetOwnerId}
                  onChange={(value) => patchLeg(index, { fleetOwnerId: value })}
                  placeholder="Search fleet owner…"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <LegPoint
                  label="From"
                  value={leg.origin}
                  stops={originStops}
                  onChange={(origin) => patchLeg(index, { origin })}
                />
                <LegPoint
                  label="To"
                  value={leg.destination}
                  stops={destStops}
                  onChange={(destination) => patchLeg(index, { destination })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500 block mb-1">
                    Carrier rate
                  </label>
                  <input
                    type="number"
                    className={uiStyles.input}
                    placeholder="What this carrier is paid"
                    value={leg.carrierRate}
                    onChange={(e) => patchLeg(index, { carrierRate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500 block mb-1">
                    Note
                  </label>
                  <input
                    className={uiStyles.input}
                    placeholder="Anything this carrier needs to know"
                    value={leg.note}
                    onChange={(e) => patchLeg(index, { note: e.target.value })}
                  />
                </div>
              </div>

              {index < legs.length - 1 && (
                <div className="flex justify-center mt-3 -mb-1 text-gray-300">
                  <ArrowDownwardIcon fontSize="small" />
                </div>
              )}
            </div>
          ))}

          <button
            onClick={addLeg}
            className="btn-secondary w-full justify-center"
          >
            <AddIcon fontSize="small" /> Add another carrier
          </button>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 p-5">
          <p className="text-xs text-gray-500">
            {legs.length === 1
              ? "One carrier runs the whole load."
              : `${legs.length} carriers — the load is only delivered once the last leg is.`}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary" disabled={saving}>
              Cancel
            </button>
            <button onClick={submit} className="btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save assignment"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssignCarrierLegsDialog;
