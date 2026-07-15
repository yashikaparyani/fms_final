import Card from "./Card";
import SectionHeader from "./SectionHeader";
import InfoRow from "./InfoRow";

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

const LoadDetailsRight = ({ load }) => (
  <div>
    {/* ── Order Identification ── */}
    <Card>
      <SectionHeader label="Order Identification" accent="#f59e0b" />
      <InfoRow
        label="Customer"
        value={<span className="text-indigo-600 font-semibold">{load.customerName}</span>}
      />
      <InfoRow label="Pickup #" value={load.pickupNo} />
      <InfoRow label="Container #" value={load.containerNo} />
      <InfoRow label="Chassis #" value={load.chassisNo} />
      <InfoRow label="Seal #" value={load.sealNo} />
      <InfoRow label="Booking #" value={load.bookingNo} />
      <InfoRow label="Shipping Line" value={load.shippingLine} />
      <InfoRow label="Created By" value={load.createdBy} />
      <InfoRow label="Created On" value={fmtFull(load.createdAt)} />
      <InfoRow label="Updated On" value={fmtFull(load.updatedAt)} />
    </Card>

    {/* ── Origin ── */}
    <Card>
      <SectionHeader label="Origin(s)" accent="#f59e0b" />
      {load.pickup?.company || load.pickup?.address || load.pickup?.city ? (
        <>
          {load.pickup.company && <InfoRow label="Company" value={load.pickup.company} />}
          {load.pickup.address && <InfoRow label="Address" value={load.pickup.address} />}
          {load.pickup.city    && <InfoRow label="City"    value={load.pickup.city} />}
          {load.pickup.state   && <InfoRow label="State"   value={load.pickup.state} />}
          {load.pickup.zip     && <InfoRow label="Zip"     value={load.pickup.zip} />}
          {load.pickedUpAt && (
            <InfoRow 
              label="Actual Pickup" 
              value={`${load.pickedUpCity}, ${load.pickedUpState} @ ${fmtFull(load.pickedUpAt)}`} 
            />
          )}
          {!load.pickup.address && !load.pickup.city && (
            <p className="px-4 pb-3 text-xs text-amber-500 italic">Address details incomplete — please update via Edit Load or Update Address.</p>
          )}
        </>
      ) : (
        <p className="px-4 py-3.5 text-sm text-gray-300 italic">No pickup address set</p>
      )}
    </Card>

    {/* ── Destination ── */}
    <Card>
      <SectionHeader label="Destination(s)" accent="#3b82f6" />
      {load.drop?.company || load.drop?.address || load.drop?.city ? (
        <>
          {load.drop.company && <InfoRow label="Company" value={load.drop.company} />}
          {load.drop.address && <InfoRow label="Address" value={load.drop.address} />}
          {load.drop.city    && <InfoRow label="City"    value={load.drop.city} />}
          {load.drop.state   && <InfoRow label="State"   value={load.drop.state} />}
          {load.drop.zip     && <InfoRow label="Zip"     value={load.drop.zip} />}
          {load.deliveredAt && (
            <InfoRow 
              label="Actual Delivery" 
              value={`${load.deliveredCity}, ${load.deliveredState} @ ${fmtFull(load.deliveredAt)}`} 
            />
          )}
          {!load.drop.address && !load.drop.city && (
            <p className="px-4 pb-3 text-xs text-amber-500 italic">Address details incomplete — please update via Edit Load or Update Address.</p>
          )}
        </>
      ) : (
        <p className="px-4 py-3.5 text-sm text-gray-300 italic">No drop address set</p>
      )}
    </Card>

    {/* ── Contact / Emails ── */}
    <Card>
      <SectionHeader label="Contact Persons / Emails" accent="#0d9488" />
      <InfoRow label="ACC Charges Email" value={load.accChargesEmail} />
      <InfoRow label="POD Email" value={load.podEmail} />
      <InfoRow label="Delivery Email" value={load.deliveryEmail} />
      <InfoRow label="Billing Email" value={load.billingEmail} />
    </Card>
  </div>
);

export default LoadDetailsRight;