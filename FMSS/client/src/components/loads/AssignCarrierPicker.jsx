import { useState } from "react";
import AppSelect from "../AppSelect";

// ─── Assign / reassign a carrier ──────────────────────────────────────────────
// The inline picker that replaces a row's action buttons while a carrier is
// being chosen. Shared by All Transit and Over: reassigning a finished load —
// the usual reason being that it was booked against the wrong carrier and the
// settlement is about to go out — is the same action as reassigning a moving
// one.
// ─────────────────────────────────────────────────────────────────────────────

const AssignCarrierPicker = ({
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
        options={fleetOwners.map((fo) => ({
          value: fo._id,
          label: fo.phone ? `${fo.carrierName} (${fo.phone})` : fo.carrierName,
        }))}
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

export default AssignCarrierPicker;
