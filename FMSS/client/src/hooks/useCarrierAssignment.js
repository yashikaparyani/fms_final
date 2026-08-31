import { useState } from "react";
import Swal from "sweetalert2";
import api from "../api";
import { notify } from "../utils/swal";

// ─── Assigning and unassigning a carrier ──────────────────────────────────────
// The two write actions the load tables share, with their confirmations. Held
// here rather than copied per table so a change to what unassigning does — or
// to what the confirmation warns about — lands everywhere it is offered.
//
// `saving` is returned so the caller can disable its buttons and hold its
// background refresh while a write is in flight; a row shifting or vanishing
// underneath a half-finished action is how the wrong load gets reassigned.
// ─────────────────────────────────────────────────────────────────────────────

export const useCarrierAssignment = (refresh) => {
  const [saving, setSaving] = useState(false);

  const assign = async (loadId, ownerId, owners) => {
    const owner = owners.find((o) => o._id === ownerId);
    if (!owner) {
      notify.error("Owner not found");
      return false;
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
    if (!result.isConfirmed) return false;

    setSaving(true);
    try {
      await api.put(`/loads/${loadId}/assign-fleet-owner`, {
        fleetOwnerId: owner._id,
        fleetOwnerName: owner.carrierName,
      });
      await refresh();
      notify.success(`Load ${loadId} assigned to ${owner.carrierName}!`);
      return true;
    } catch (err) {
      notify.error(
        err?.response?.data?.message || "Assignment failed. Please try again.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const unassign = async (load) => {
    const result = await Swal.fire({
      title: "Unassign Load?",
      html: `Load <strong>${load.loadId}</strong> will be returned to <strong>Dispatch Management</strong> and will be available for bidding / reassignment.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "✓ Yes, Unassign",
      cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return false;

    setSaving(true);
    try {
      await api.put(`/loads/${load.loadId}/unassign`);
      await refresh();
      notify.success(
        `Load ${load.loadId} unassigned — back in Dispatch Management.`,
      );
      return true;
    } catch (err) {
      notify.error(
        err?.response?.data?.message || "Unassign failed. Please try again.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { saving, assign, unassign };
};
