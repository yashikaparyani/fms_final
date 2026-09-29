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
    const legs = legsOf(load);
    if (legs.length > 1) return unassignLegs(load, legs);

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

  // A load run by two carriers, or relayed between two drivers of one carrier:
  // ask which to take off. All of them is the full unassign; fewer keeps the
  // load with whoever is left and the server puts its status back to where
  // their leg stands (Loaded in Yard, say) — see unassignLegs on the server.
  const unassignLegs = async (load, legs) => {
    const rows = legs
      .map(
        (leg, i) => `
          <label style="display:flex;gap:10px;align-items:flex-start;text-align:left;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;margin-top:8px;cursor:pointer">
            <input type="checkbox" class="unassign-leg" value="${leg.id}" style="margin-top:3px;width:16px;height:16px">
            <span>
              <strong>Leg ${i + 1}: ${esc(leg.title)}</strong>
              ${leg.drivers ? `<br><span style="font-size:13px;color:#4b5563">Driver: ${esc(leg.drivers)}</span>` : ""}
              ${leg.route ? `<br><span style="font-size:13px;color:#6b7280">${esc(leg.route)}</span>` : ""}
              <br><span style="font-size:12px;color:#6b7280">Status: ${esc(statusLabel(leg.status))}</span>
            </span>
          </label>`,
      )
      .join("");

    const result = await Swal.fire({
      title: "Which one to unassign?",
      html: `
        <p style="font-size:14px;color:#4b5563;text-align:left">
          Load <strong>${esc(load.loadId)}</strong> has ${legs.length} legs.
          Select all to send it back to <strong>Dispatch Management</strong>.
          Select only some and the load stays with the rest, its status going
          back to where their leg stands.
        </p>
        ${rows}`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "✓ Unassign selected",
      cancelButtonText: "Cancel",
      preConfirm: () => {
        const picked = [...document.querySelectorAll(".unassign-leg:checked")].map(
          (box) => box.value,
        );
        if (!picked.length) {
          Swal.showValidationMessage("Select at least one to unassign.");
          return false;
        }
        return picked;
      },
    });
    if (!result.isConfirmed) return false;

    const legIds = result.value;
    const all = legIds.length === legs.length;

    setSaving(true);
    try {
      const { data } = await api.put(`/loads/${load.loadId}/unassign`, { legIds });
      await refresh();
      notify.success(
        all
          ? `Load ${load.loadId} unassigned — back in Dispatch Management.`
          : `${data.message} Status: ${statusLabel(data.load?.transportStatus)}.`,
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

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const statusLabel = (status) =>
  String(status || "—")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());

const placeOf = (point) =>
  [point?.company, point?.city, point?.state].filter(Boolean).join(", ");

const routeOf = (from, to) => {
  const a = placeOf(from);
  const b = placeOf(to);
  return a || b ? `${a || "?"} → ${b || "?"}` : "";
};

/**
 * The legs a load can be partly unassigned by — carrier legs when it is split
 * between carriers, otherwise driver legs when one carrier relays it between
 * its own drivers. The server applies the same choice (hasLegs first).
 */
const legsOf = (load) => {
  const drivers = load.driverAssignments || [];

  if ((load.assignments || []).length) {
    return load.assignments.map((leg) => ({
      id: leg._id,
      title: leg.fleetOwnerName || "Carrier",
      drivers: drivers
        .filter((d) => String(d.fleetOwnerId) === String(leg.fleetOwnerId))
        .map((d) => d.driverName)
        .filter(Boolean)
        .join(", "),
      route: routeOf(leg.origin, leg.destination),
      status: leg.transportStatus,
    }));
  }

  return drivers
    .filter((d) => d.transportStatus)
    .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
    .map((d) => ({
      id: d._id,
      title: d.driverName || "Driver",
      drivers: "",
      route: routeOf(d.pickup, d.drop),
      status: d.transportStatus,
    }));
};
