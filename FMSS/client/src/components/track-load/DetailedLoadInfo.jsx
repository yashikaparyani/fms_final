import Card from "./Card";
import SectionHeader from "./SectionHeader";
import InfoRow from "./InfoRow";
import StatusChip, { TRANSPORT_STATUS_COLOR } from "./StatusChip";

const fmt = (v) =>
  v
    ? new Date(v).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

const fmtFull = (v) =>
  v
    ? new Date(v).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const money = (v) =>
  v === null || v === undefined || v === "" || Number.isNaN(Number(v))
    ? "—"
    : `$${Number(v).toLocaleString()}`;

const CheckboxDisplay = ({ label, checked }) => (
  <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-tight">{label}</span>
    <div className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${checked ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-100 text-transparent border border-gray-200'}`}>
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
      </svg>
    </div>
  </div>
);

const DetailedLoadInfo = ({ load }) => {
  if (!load) return null;

  // Prefer the multi-stop arrays; fall back to the legacy single pickup/drop.
  const pickups = load.pickups?.length ? load.pickups : load.pickup ? [load.pickup] : [];
  const drops = load.drops?.length ? load.drops : load.drop ? [load.drop] : [];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      
      {/* ── TOP SECTIONS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* LEFT COLUMN */}
        <div className="space-y-6">
          {/* Identification */}
          <Card>
            <SectionHeader label="Identification" accent="#6366f1" />
            <div className="p-4 pt-2 grid grid-cols-2 gap-x-6">
              <InfoRow label="Ref.#" value={load.refNo} />
              <InfoRow label="Assigned To" value={load.assignedTo || load.assignedFleetOwner?.fleetOwnerName} />
              <InfoRow label="Invoice No" value={load.invoiceNo} />
              <InfoRow label="Load ID" value={<span className="font-bold text-indigo-600">{load.loadId}</span>} />
            </div>
          </Card>

          {/* Order Status */}
          <Card>
            <SectionHeader label="Order Status" accent="#8b5cf6" />
            <div className="p-4 pt-2">
              <div className="grid grid-cols-2 gap-x-6 mb-4">
                <InfoRow label="Load Status" value={<StatusChip value={load.transportStatus} map={TRANSPORT_STATUS_COLOR} />} />
                <InfoRow label="Container Size" value={load.containerLocation || load.containerType} />
                <InfoRow label="Order Bill Date" value={fmt(load.orderBillDate)} />
                <InfoRow label="Person Bill" value={load.personBill} />
              </div>
              <div className="grid grid-cols-2 gap-x-8 border-t border-gray-100 pt-4">
                <div className="space-y-1">
                  <CheckboxDisplay label="Booking Problem" checked={load.bookingProblem} />
                  <CheckboxDisplay label="Put on Hold" checked={load.putOnHold} />
                </div>
                <div className="space-y-1">
                  <CheckboxDisplay label="Chassis Rent" checked={load.chassisRent} />
                  <CheckboxDisplay label="Hot Shipment" checked={load.hotShipment} />
                  <CheckboxDisplay label="Is Accessorial Charges" checked={load.isAccessorialCharges} />
                </div>
              </div>
            </div>
          </Card>

          {/* Routing */}
          <Card>
            <SectionHeader label="Routing" accent="#06b6d4" />
            <div className="p-4 pt-2">
               <div className="mb-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase mb-2">Main Address</p>
                  <p className="text-sm font-semibold text-slate-700">{load.pickup?.company || "—"}</p>
                  <p className="text-sm text-slate-600">{load.pickup?.address || "—"}</p>
                  <p className="text-sm text-slate-600">{[load.pickup?.city, load.pickup?.state, load.pickup?.zip].filter(Boolean).join(", ")}</p>
               </div>
               <div className="grid grid-cols-1 gap-1">
                  <InfoRow label="Pier Termination / Empty Return" value={load.pierTermination} />
                  <InfoRow label="Contact Person(s)" value={load.contactPerson} />
               </div>
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">
          {/* Order Identification */}
          <Card>
            <SectionHeader label="Order Identification" accent="#f59e0b" />
            <div className="p-4 pt-2 grid grid-cols-2 gap-x-6">
              <InfoRow label="Customer" value={<span className="text-indigo-600 font-semibold">{load.customerName}</span>} />
              <InfoRow label="Pickup #" value={load.pickupNo || load.pickup?.poNumber} />
              <InfoRow label="Container #" value={load.containerNo} />
              <InfoRow label="Chassis #" value={load.chassisNo} />
              <InfoRow label="Pieces" value={load.pieces || load.pickup?.pieces} />
              <InfoRow label="Weight" value={load.weight || load.pickup?.weight} />
              <InfoRow label="Commodity" value={load.commodity} />
              <InfoRow label="Seal #" value={load.sealNo} />
              <InfoRow label="Booking #" value={load.bookingNo} />
              <InfoRow label="Last Free Date" value={fmt(load.lastFreeDate)} />
              <div className="col-span-2 border-t border-gray-50 my-2"></div>
              <InfoRow label="Created By" value={load.createdBy} />
              <InfoRow label="Created On" value={fmtFull(load.createdAt)} />
              <InfoRow label="Updated By" value={load.updatedBy} />
              <InfoRow label="Updated On" value={fmtFull(load.updatedAt)} />
            </div>
          </Card>

          {/* Description & Remarks */}
          <Card>
             <SectionHeader label="Details & Remarks" accent="#10b981" />
             <div className="p-4 pt-2 space-y-4">
                <div>
                   <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Description</p>
                   <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-700 border border-gray-100 min-h-[60px]">
                      {load.description || "—"}
                   </div>
                </div>
                <div>
                   <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Remarks</p>
                   <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-700 border border-gray-100 min-h-[60px]">
                      {load.remarks || "—"}
                   </div>
                </div>
             </div>
          </Card>
        </div>
      </div>

      {/* ── TABLES ── */}
      <div className="space-y-6">
        {/* Receivables */}
        <Card>
          <SectionHeader label="Receivables" accent="#059669" />
          <div className="p-4 pt-2">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              <InfoRow label="Customer" value={load.customerName} />
              <InfoRow label="Freight Charges (Base)" value={money(load.amount)} />
              <InfoRow
                label="Fleet Owner Payout"
                value={load.vendorRate != null ? money(load.vendorRate) : "—"}
              />
              <InfoRow
                label="Gross Margin"
                value={
                  load.amount != null && load.vendorRate != null
                    ? money(Number(load.amount) - Number(load.vendorRate))
                    : "—"
                }
              />
              <InfoRow
                label="Accessorial Charges"
                value={load.isAccessorialCharges ? "Yes" : "No"}
              />
              <InfoRow label="Invoice No" value={load.invoiceNo || "—"} />
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-2.5">
              <span className="text-xs font-bold uppercase tracking-wide text-emerald-600">
                Total Receivable (from Customer)
              </span>
              <span className="text-lg font-black text-emerald-700">
                {money(load.amount)}
              </span>
            </div>
          </div>
        </Card>

        {/* Origin Table */}
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

        {/* Destination Table */}
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

        {/* Load Status Information Table */}
        <Card>
          <SectionHeader label="Load Status Information" accent="#eab308" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-yellow-50/50 text-yellow-800 border-b border-yellow-100">
                  <th className="px-4 py-3 text-left font-bold">Name</th>
                  <th className="px-4 py-3 text-left font-bold">Status</th>
                  <th className="px-4 py-3 text-left font-bold">Location</th>
                  <th className="px-4 py-3 text-left font-bold">Date / Time</th>
                  <th className="px-4 py-3 text-left font-bold">Comments/Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(load.statusHistory || []).slice().reverse().map((entry, idx) => (
                  <tr key={idx} className="hover:bg-yellow-50/10 transition-colors">
                    <td className="px-4 py-3 text-gray-700 font-medium">{entry.updatedBy || "Staff"}</td>
                    <td className="px-4 py-3">
                      <StatusChip value={entry.status || entry.transportStatus} map={TRANSPORT_STATUS_COLOR} />
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs italic">{entry.location || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{fmtFull(entry.timestamp || entry.updatedAt)}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{entry.note || entry.comment || "—"}</td>
                  </tr>
                ))}
                {(!load.statusHistory || load.statusHistory.length === 0) && (
                   <tr>
                      <td colSpan="5" className="px-4 py-8 text-center text-gray-400 italic">No status history available</td>
                   </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default DetailedLoadInfo;
