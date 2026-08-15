// The fleet-owner pickers used by the "Assign Driver" action, in desktop and
// mobile form. They live apart from hooks/useDispatchActions.jsx, which owns the
// state and the assignment call, so that each file exports only one kind of
// thing and fast refresh keeps working.

import { useState } from "react";
import AppSelect from "./AppSelect";
import { fleetOwnerLabel } from "../utils/fleetOwner";

const ownerOptions = (fleetOwners) =>
  fleetOwners.map((fo) => ({ value: fo._id, label: fleetOwnerLabel(fo) }));

// ─── Desktop: replaces the row's buttons while open ─────────────────────────
export const AssignDropdown = ({
  loadId,
  fleetOwners,
  onConfirm,
  onCancel,
  saving,
}) => {
  const [ownerId, setOwnerId] = useState("");
  return (
    <div className="flex flex-col gap-1.5 max-w-[280px]">
      <AppSelect
        options={ownerOptions(fleetOwners)}
        value={ownerId}
        onChange={setOwnerId}
        placeholder="Search fleet owner…"
      />
      <div className="flex gap-1.5">
        <button
          disabled={!ownerId || saving}
          onClick={() => onConfirm(loadId, ownerId, fleetOwners)}
          className="flex-1 text-xs py-1.5 px-2 rounded-md font-semibold text-white transition"
          style={{
            background: !ownerId || saving ? "#d1d5db" : "#16a34a",
            cursor: !ownerId || saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Confirm"}
        </button>
        <button
          onClick={onCancel}
          className="text-xs py-1.5 px-2 rounded-md border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

// ─── Mobile: rendered inside the card body ──────────────────────────────────
export const MobileAssignInline = ({
  loadId,
  fleetOwners,
  onConfirm,
  onCancel,
  saving,
}) => {
  const [ownerId, setOwnerId] = useState("");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <AppSelect
        options={ownerOptions(fleetOwners)}
        value={ownerId}
        onChange={setOwnerId}
        placeholder="Search fleet owner…"
      />
      <div style={{ display: "flex", gap: 6 }}>
        <button
          disabled={!ownerId || saving}
          onClick={() => onConfirm(loadId, ownerId, fleetOwners)}
          style={{
            flex: 1,
            fontSize: 12,
            padding: "6px 0",
            borderRadius: 6,
            border: "none",
            background: !ownerId || saving ? "#d1d5db" : "#16a34a",
            color: "#fff",
            fontWeight: 600,
            cursor: !ownerId || saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Confirm"}
        </button>
        <button
          onClick={onCancel}
          style={{
            fontSize: 12,
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid #d1d5db",
            background: "#f3f4f6",
            color: "#374151",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
