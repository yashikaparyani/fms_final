import { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import Card from "./Card";
import SectionHeader from "./SectionHeader";
import api from "../../api";
import { notify } from "../../utils/swal";
import { formatDate } from "../../utils/dates";
import { transportStatusLabel } from "../../utils/transportStatus";

// ─── Load stop and driver tables ──────────────────────────────────────────────
// Driver Payments, Origin(s) and Destination(s): the three tables that say who
// moved a load and where it went.
//
// Their own file because two screens show them — the load's Details tab on the
// track page, and the load's accounting page. The second is where the office
// checks a driver's pay against the stops they ran, and a copy of the markup
// there would drift from this one the first time a column was added. Both
// screens pass the same load object from GET /loads/:id.
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (v) => (v ? formatDate(v) : "—");

const money = (v) =>
  v === null || v === undefined || v === "" || Number.isNaN(Number(v))
    ? "—"
    : `$${Number(v).toLocaleString()}`;

// A stop as two lines: who it is, then where. Drivers' own legs carry no
// company name — a handover happens at a yard — so those fall back to the
// street line as the title and read the same as a real stop.
const place = (stop) => {
  if (!stop) return null;
  const where = [stop.city, stop.state, stop.zip].filter(Boolean).join(", ");
  const title = stop.company || stop.address;
  if (!title && !where) return null;
  if (!title) return { title: where, sub: "" };

  return {
    title,
    sub: [stop.company && stop.address, where].filter(Boolean).join(" · "),
  };
};

// One row per person being paid to move this load.
//
// A load can be split between carriers, and each carrier names its own drivers,
// so "who is being paid" has two shapes at once: named drivers, and carrier legs
// nobody has been put on yet. Both are listed — a leg with no driver named is
// still money going out, and leaving it off makes the table disagree with the
// payables.
//
// Only the driver on `accounting.payroll` has a figure: payroll is one driver
// per load (see accountingController.js), so the rest show no amount rather
// than borrowing their carrier's leg rate — that rate is what the carrier is
// owed, not what the driver is paid, and printing it in a Driver Amount column
// once per driver would say the load costs several times what it does.
const driverPaymentRows = (load) => {
  const legs = load.assignments || [];
  const drivers = load.driverAssignments || [];
  const payroll = load.accounting?.payroll;
  const payablesPaid = Boolean(load.accounting?.payables?.paidAt);

  const legFor = (fleetOwnerId) =>
    legs.find((leg) => String(leg.fleetOwnerId || "") === String(fleetOwnerId || ""));

  const rows = drivers.map((assignment) => {
    const leg = legFor(assignment.fleetOwnerId);
    // `driver` is an id here — getLoadById does not populate it — so the name
    // comes from the copy the assignment kept when it was made.
    const isPaidDriver =
      payroll?.driver && String(payroll.driver) === String(assignment.driver);

    return {
      driverId: assignment.driver ? String(assignment.driver) : null,
      name: assignment.driverName || assignment.driverCode || "—",
      via: leg?.fleetOwnerName || load.assignedFleetOwner?.fleetOwnerName || "",
      pickup: place(assignment.pickup) || place(leg?.origin) || place(load.pickup),
      destination: place(assignment.drop) || place(leg?.destination) || place(load.drop),
      // This driver's own progress on their leg of the relay, falling back to the
      // load's status for older rows that were saved before driver legs tracked
      // their own status.
      status: assignment.transportStatus || leg?.transportStatus || load.transportStatus,
      amount: isPaidDriver ? payroll.amount : undefined,
      paid: isPaidDriver ? Boolean(payroll.settledAt) : false,
    };
  });

  const carriersWithDrivers = new Set(
    drivers.map((assignment) => String(assignment.fleetOwnerId || "")),
  );

  legs
    .filter((leg) => !carriersWithDrivers.has(String(leg.fleetOwnerId || "")))
    .forEach((leg) => {
      rows.push({
        name: leg.fleetOwnerName || "—",
        via: "Carrier — no driver named yet",
        pickup: place(leg.origin) || place(load.pickup),
        destination: place(leg.destination) || place(load.drop),
        status: leg.transportStatus,
        amount: leg.carrierRate,
        paid: payablesPaid,
      });
    });

  if (rows.length) return rows;

  // Neither drivers nor legs: the ordinary single-carrier load. Still worth a
  // row — the payroll figure and the carrier are what there is to show.
  const carrier = load.assignedFleetOwner?.fleetOwnerName;
  if (!payroll?.driverName && !carrier) return [];

  return [
    {
      name: payroll?.driverName || carrier || "—",
      via: payroll?.driverName ? carrier || "" : "Carrier — no driver named yet",
      pickup: place(load.pickup),
      destination: place(load.drop),
      status: load.transportStatus,
      amount: payroll?.driverName ? payroll.amount : load.vendorRate,
      paid: payroll?.driverName ? Boolean(payroll.settledAt) : payablesPaid,
    },
  ];
};

// Prefer the multi-stop arrays; fall back to the legacy single pickup/drop.
const pickupsOf = (load) =>
  load?.pickups?.length ? load.pickups : load?.pickup ? [load.pickup] : [];
const dropsOf = (load) =>
  load?.drops?.length ? load.drops : load?.drop ? [load.drop] : [];

/**
 * Who is being paid to move this load, and whether they have been.
 *
 * Office only: the load's drivers are deliberately kept off customer screens
 * (getLoadById strips driverAssignments for clients), and what a driver is paid
 * is not the carrier's business either. Callers decide whether to render it.
 */
/**
 * With `editable`, each named driver's amount can be set and the driver paid
 * right here — on any load, whatever its status, so a box parked in the yard
 * for weeks does not hold up the driver who put it there. Billing is not
 * touched.
 *
 * The figures then come from the load's payables (the same Driver Pay lines the
 * accounting screen edits), not from `accounting.payroll`, so the two screens
 * always agree. Carrier legs with no driver named stay read-only.
 */
export const DriverPaymentsTable = ({ load, editable = false }) => {
  const baseRows = driverPaymentRows(load);

  // driverId -> { amount, paid, uncosted } from the payables.
  const [pay, setPay] = useState(null);
  const [editing, setEditing] = useState(null); // driverId being edited
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(null); // driverId being saved

  const readPay = (accounting) =>
    setPay(
      Object.fromEntries(
        (accounting?.driverPayables || []).map((d) => [String(d.driverId), d]),
      ),
    );

  const fetchPay = useCallback(async () => {
    if (!editable || !load?.loadId) return;
    try {
      const { data } = await api.get(`/accounting/loads/${load.loadId}`);
      readPay(data);
    } catch {
      // Without the books (no permission, or offline) the table stays as it
      // was: read-only, from the load.
      setPay(null);
    }
  }, [editable, load?.loadId]);

  useEffect(() => {
    fetchPay();
  }, [fetchPay]);

  const live = editable && pay !== null;

  const rows = baseRows.map((row) => {
    if (!live || !row.driverId) return row;
    const d = pay[row.driverId];
    return {
      ...row,
      amount: d && !d.uncosted ? d.amount : undefined,
      paid: Boolean(d?.paid),
      canEdit: true,
    };
  });

  const startEdit = (row) => {
    setEditing(row.driverId);
    setDraft(row.amount !== undefined ? String(row.amount) : "");
  };

  const saveAmount = async (row) => {
    const amount = Number(String(draft).replace(/[$,\s]/g, ""));
    if (!Number.isFinite(amount) || amount < 0) {
      notify.warning("Enter the driver's amount — a number, $0 or more.");
      return;
    }
    setBusy(row.driverId);
    try {
      const { data } = await api.put(
        `/accounting/loads/${load.loadId}/payables/drivers/${row.driverId}/amount`,
        { amount },
      );
      readPay(data.accounting);
      setEditing(null);
      notify.success(data.message);
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not save the amount");
    } finally {
      setBusy(null);
    }
  };

  const togglePaid = async (row) => {
    const { isConfirmed } = await Swal.fire({
      title: row.paid
        ? `Mark ${row.name}'s pay as unpaid?`
        : `Pay ${money(row.amount)} to ${row.name}?`,
      text: row.paid
        ? "It goes back to outstanding and the amount can be changed again."
        : "This records the driver as paid. The load's status and billing do not change.",
      showCancelButton: true,
      confirmButtonText: row.paid ? "Mark unpaid" : "Mark paid",
      confirmButtonColor: row.paid ? "#b45309" : "#059669",
    });
    if (!isConfirmed) return;

    setBusy(row.driverId);
    try {
      const { data } = await api.put(
        `/accounting/loads/${load.loadId}/payables/drivers/${row.driverId}/pay`,
        { paid: !row.paid },
      );
      readPay(data.accounting);
      notify.success(data.message);
    } catch (err) {
      notify.error(err.response?.data?.message || "Could not update the payment");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <SectionHeader label="Driver Payments" accent="#0d9488" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-teal-50/50 text-teal-800 border-b border-teal-100">
              <th className="px-4 py-3 text-left font-bold">Driver Name</th>
              <th className="px-4 py-3 text-left font-bold">Pickup Location</th>
              <th className="px-4 py-3 text-left font-bold">Destination</th>
              <th className="px-4 py-3 text-left font-bold">Leg Status</th>
              <th className="px-4 py-3 text-left font-bold w-44">Driver Amount</th>
              <th className="px-4 py-3 text-left font-bold w-48">Payment Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan="6" className="px-4 py-8 text-center text-gray-400 italic">
                  Nobody assigned to this load yet
                </td>
              </tr>
            )}
            {rows.map((row, idx) => {
              const isBusy = busy && busy === row.driverId;
              const isEditing = row.canEdit && editing === row.driverId;
              const hasAmount = row.amount !== undefined && Number(row.amount) > 0;

              return (
                <tr key={row.driverId || idx} className="hover:bg-teal-50/20 transition-colors">
                  <td className="px-4 py-4">
                    <p className="font-bold text-gray-800">{row.name}</p>
                    {row.via && <p className="text-xs text-gray-500">{row.via}</p>}
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-medium text-gray-800">{row.pickup?.title || "—"}</p>
                    {row.pickup?.sub && <p className="text-xs text-gray-600">{row.pickup.sub}</p>}
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-medium text-gray-800">{row.destination?.title || "—"}</p>
                    {row.destination?.sub && (
                      <p className="text-xs text-gray-600">{row.destination.sub}</p>
                    )}
                  </td>

                  <td className="px-4 py-4">
                    {row.status ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700 whitespace-nowrap">
                        {transportStatusLabel(row.status)}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>

                  <td className="px-4 py-4">
                    {isEditing ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-700 font-bold">$</span>
                        <input
                          autoFocus
                          inputMode="decimal"
                          value={draft}
                          disabled={isBusy}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveAmount(row);
                            if (e.key === "Escape") setEditing(null);
                          }}
                          className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm font-bold text-gray-900 focus:border-teal-500 focus:outline-none"
                          placeholder="0.00"
                        />
                        <button
                          type="button"
                          onClick={() => saveAmount(row)}
                          disabled={isBusy}
                          className="text-xs font-semibold px-2 py-1 rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                        >
                          {isBusy ? "…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(null)}
                          disabled={isBusy}
                          className="text-xs font-semibold px-1.5 py-1 text-gray-600 hover:text-gray-900"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-800">{money(row.amount)}</span>
                        {row.canEdit && !row.paid && (
                          <button
                            type="button"
                            onClick={() => startEdit(row)}
                            disabled={Boolean(busy)}
                            className="text-xs font-semibold text-teal-700 hover:underline disabled:opacity-50"
                          >
                            {hasAmount ? "Edit" : "Add amount"}
                          </button>
                        )}
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold ${
                          row.paid
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {row.paid ? "Paid" : "Unpaid"}
                      </span>
                      {row.canEdit && !isEditing && (row.paid || hasAmount) && (
                        <button
                          type="button"
                          onClick={() => togglePaid(row)}
                          disabled={Boolean(busy)}
                          className={`text-xs font-semibold px-2.5 py-1 rounded-md border transition disabled:opacity-50 whitespace-nowrap ${
                            row.paid
                              ? "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                              : "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
                          }`}
                        >
                          {isBusy ? "…" : row.paid ? "Mark unpaid" : "Pay"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {live && rows.some((r) => r.canEdit) && (
        <p className="border-t border-gray-100 px-4 py-2 text-[13px] text-gray-600">
          Set a driver&apos;s amount, then Pay. Paying a driver does not change the
          load&apos;s status or its billing.
        </p>
      )}
    </Card>
  );
};

export const OriginsTable = ({ load }) => {
  const pickups = pickupsOf(load);

  return (
    <Card>
      <SectionHeader label="Origin(s)" accent="#f97316" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-orange-50/50 text-orange-800 border-b border-orange-100">
              <th className="px-4 py-3 text-left font-bold w-16">S.No</th>
              <th className="px-4 py-3 text-left font-bold">Origin(s)</th>
              <th className="px-4 py-3 text-left font-bold">Pickup Date / Time</th>
              <th className="px-4 py-3 text-left font-bold w-32">Appt.#</th>
              <th className="px-4 py-3 text-left font-bold w-40">Appt. Given by</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pickups.length === 0 && (
              <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-400 italic">No origin added yet</td></tr>
            )}
            {pickups.map((p, idx) => (
              <tr key={idx} className="hover:bg-orange-50/20 transition-colors">
                <td className="px-4 py-4 text-gray-500 font-medium">{idx + 1}</td>
                <td className="px-4 py-4">
                  <p className="font-bold text-gray-800">{p?.company || "—"}</p>
                  <p className="text-xs text-gray-600">{p?.address || ""}</p>
                  <p className="text-xs text-gray-600">{[p?.city, p?.state, p?.zip].filter(Boolean).join(", ")}</p>
                </td>
                <td className="px-4 py-4">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-orange-100 text-orange-700 text-xs font-bold">
                    {p?.pickupDate ? (
                      <>
                        {fmt(p.pickupDate)}
                        <span className="mx-1.5 opacity-50">|</span>
                        {p.fromTime || "—"} To {p.toTime || "—"}
                      </>
                    ) : "—"}
                  </span>
                </td>
                <td className="px-4 py-4 text-gray-700 font-medium">{p?.apptNumber || "—"}</td>
                <td className="px-4 py-4 text-gray-700 font-medium">{p?.apptGivenBy || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

export const DestinationsTable = ({ load }) => {
  const drops = dropsOf(load);

  return (
    <Card>
      <SectionHeader label="Destination(s)" accent="#3b82f6" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-blue-50/50 text-blue-800 border-b border-blue-100">
              <th className="px-4 py-3 text-left font-bold w-16">S.No</th>
              <th className="px-4 py-3 text-left font-bold">Destination(s)</th>
              <th className="px-4 py-3 text-left font-bold">Appt. Date / Time</th>
              <th className="px-4 py-3 text-left font-bold w-32">Appt.#</th>
              <th className="px-4 py-3 text-left font-bold w-40">Appt. Given by</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {drops.length === 0 && (
              <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-400 italic">No destination added yet</td></tr>
            )}
            {drops.map((d, idx) => (
              <tr key={idx} className="hover:bg-blue-50/20 transition-colors">
                <td className="px-4 py-4 text-gray-500 font-medium">{idx + 1}</td>
                <td className="px-4 py-4">
                  <p className="font-bold text-gray-800">{d?.company || "—"}</p>
                  <p className="text-xs text-gray-600">{d?.address || ""}</p>
                  <p className="text-xs text-gray-600">{[d?.city, d?.state, d?.zip].filter(Boolean).join(", ")}</p>
                </td>
                <td className="px-4 py-4">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-blue-100 text-blue-700 text-xs font-bold">
                    {d?.deliveryDate ? (
                      <>
                        {fmt(d.deliveryDate)}
                        <span className="mx-1.5 opacity-50">|</span>
                        {d.fromTime || "—"} To {d.toTime || "—"}
                      </>
                    ) : "—"}
                  </span>
                </td>
                <td className="px-4 py-4 text-gray-700 font-medium">{d?.apptNumber || "—"}</td>
                <td className="px-4 py-4 text-gray-700 font-medium">{d?.apptGivenBy || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
