import Card from "./Card";
import SectionHeader from "./SectionHeader";
import { formatDate } from "../../utils/dates";

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
      name: assignment.driverName || assignment.driverCode || "—",
      via: leg?.fleetOwnerName || load.assignedFleetOwner?.fleetOwnerName || "",
      pickup: place(assignment.pickup) || place(leg?.origin) || place(load.pickup),
      destination: place(assignment.drop) || place(leg?.destination) || place(load.drop),
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
export const DriverPaymentsTable = ({ load }) => {
  const paymentRows = driverPaymentRows(load);

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
              <th className="px-4 py-3 text-left font-bold w-32">Driver Amount</th>
              <th className="px-4 py-3 text-left font-bold w-36">Payment Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paymentRows.length === 0 && (
              <tr>
                <td colSpan="5" className="px-4 py-8 text-center text-gray-400 italic">
                  Nobody assigned to this load yet
                </td>
              </tr>
            )}
            {paymentRows.map((row, idx) => (
              <tr key={idx} className="hover:bg-teal-50/20 transition-colors">
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
                <td className="px-4 py-4 font-bold text-gray-800">{money(row.amount)}</td>
                <td className="px-4 py-4">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold ${
                      row.paid
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {row.paid ? "Paid" : "Unpaid"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
