// ─── Schedule Bid / Assign Driver, shared between load lists ─────────────────
// Dispatch Management and the dashboard drill-down lists both offer the same
// two actions on a load, backed by the same modal, the same fleet-owner picker
// and the same confirmation. Keeping them in one hook means a change to how a
// load is assigned lands in both places at once — and neither list can quietly
// grow a second, subtly different way of assigning the same load.

import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import api from "../api";
import {
  AssignDropdown,
  MobileAssignInline,
} from "../components/AssignFleetOwnerPickers";
import ScheduleBidding from "../pages/ScheduleBidding";
import { notify } from "../utils/swal";

/** The carrier a load is already with, by direct assignment or a won bid. */
export const getAssignedName = (load, fleetOwners) => {
  if (load?.assignedFleetOwner?.fleetOwnerName)
    return load.assignedFleetOwner.fleetOwnerName;
  const winId = load?.winningBid?.fleetOwnerId;
  if (winId && fleetOwners.length) {
    const fo = fleetOwners.find((o) => o._id === winId || o._id === winId?.$oid);
    if (fo) return fo.carrierName;
  }
  return null;
};

/**
 * The assigned carrier's code. The load stores only the carrier *name*, so the
 * code is resolved from the fleet-owner list by id where possible.
 */
export const getAssignedCode = (load, fleetOwners) => {
  const id =
    load?.assignedFleetOwner?.fleetOwnerId || load?.winningBid?.fleetOwnerId;
  if (!id || !fleetOwners.length) return null;
  const fo = fleetOwners.find((o) => o._id === id || o._id === id?.$oid);
  return fo?.fleetOwnerCode || null;
};

/**
 * Dispatch actions for a load list.
 *
 * @param {Function} refresh   Re-fetches the list after an assignment or a
 *                             schedule, so the row reflects what just happened.
 * @returns {{
 *   fleetOwners: Array,
 *   busy: boolean,              true while a picker or the modal is open — hold
 *                               the auto-refresh, so a row cannot shift or
 *                               vanish out from under the action.
 *   isPickerOpen: Function,
 *   desktopActions: Function,   (load) => JSX for the Actions cell
 *   mobileActions: Function,    (load) => MobileCard `actions` array
 *   mobilePicker: Function,     (load) => the inline picker, or null
 *   modal: JSX,                 render once per page
 * }}
 */
export const useDispatchActions = (refresh) => {
  const [fleetOwners, setFleetOwners] = useState([]);
  const [openRow, setOpenRow] = useState(null);
  const [saving, setSaving] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selectedLoad, setSelectedLoad] = useState(null);

  useEffect(() => {
    api
      .get("/fleet-owners")
      .then((res) => setFleetOwners(res.data))
      .catch((err) => console.error("Failed to fetch fleet owners:", err));
  }, []);

  const handleAssign = async (loadId, ownerId, owners) => {
    const owner = owners.find((o) => o._id === ownerId);
    if (!owner) {
      notify.error("Owner not found");
      return;
    }
    const result = await Swal.fire({
      title: "Assign Fleet Owner?",
      html: `Assign <strong>${owner.carrierName}</strong> to load <strong>${loadId}</strong>?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#2563eb",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "✓ Yes, Assign",
      cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return;
    setSaving(true);
    try {
      await api.put(`/loads/${loadId}/assign-fleet-owner`, {
        fleetOwnerId: owner._id,
        fleetOwnerName: owner.carrierName,
      });
      setOpenRow(null);
      await refresh();
      notify.success(`Load ${loadId} assigned to ${owner.carrierName}!`);
    } catch (err) {
      console.error("Assignment failed:", err);
      notify.error("Assignment failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const openSchedule = (load) => {
    setSelectedLoad(load);
    setScheduleOpen(true);
  };

  const isPickerOpen = (load) => openRow === load.loadId;

  const desktopActions = (load) => {
    if (isPickerOpen(load)) {
      return (
        <AssignDropdown
          loadId={load.loadId}
          fleetOwners={fleetOwners}
          onConfirm={handleAssign}
          onCancel={() => setOpenRow(null)}
          saving={saving}
        />
      );
    }

    const assignedName = getAssignedName(load, fleetOwners);
    return (
      // Wraps rather than overflowing: the Actions column is wide on Dispatch
      // Management but narrow on the dashboard drill-downs, where these sit
      // under the existing buttons.
      <div className="flex flex-wrap items-center gap-2 justify-center">
        <button onClick={() => openSchedule(load)} className="btn-primary-small">
          {load.bidStartTime ? "Reschedule Bid" : "Schedule Bid"}
        </button>
        <button
          onClick={() => setOpenRow(load.loadId)}
          className="btn-secondary-small"
        >
          {assignedName ? "Reassign" : "Assign Driver"}
        </button>
      </div>
    );
  };

  const mobileActions = (load) => {
    // While the picker is open the card shows it instead — offering the buttons
    // as well would let a second action start on top of the one in progress.
    if (isPickerOpen(load)) return [];

    const assignedName = getAssignedName(load, fleetOwners);
    return [
      {
        label: load.bidStartTime ? "Reschedule Bid" : "Schedule Bid",
        color: "#16a34a",
        onClick: () => openSchedule(load),
      },
      {
        label: assignedName ? "Reassign" : "Assign Driver",
        color: "#2563eb",
        onClick: () => setOpenRow(load.loadId),
      },
    ];
  };

  const mobilePicker = (load) =>
    isPickerOpen(load) ? (
      <MobileAssignInline
        loadId={load.loadId}
        fleetOwners={fleetOwners}
        onConfirm={handleAssign}
        onCancel={() => setOpenRow(null)}
        saving={saving}
      />
    ) : null;

  const modal = (
    <ScheduleBidding
      open={scheduleOpen}
      onClose={() => {
        setScheduleOpen(false);
        setSelectedLoad(null);
      }}
      load={selectedLoad}
      refreshLoads={refresh}
    />
  );

  return {
    fleetOwners,
    busy: Boolean(openRow) || saving || scheduleOpen,
    isPickerOpen,
    desktopActions,
    mobileActions,
    mobilePicker,
    modal,
  };
};

export default useDispatchActions;
