import Card from "./Card";
import SectionHeader from "./SectionHeader";
import InfoRow from "./InfoRow";
import StatusChip, { TRANSPORT_STATUS_COLOR } from "./StatusChip";
import { formatDate, formatDateTime } from "../../utils/dates";

const fmt = (v) =>
  v
    ? formatDate(v)
    : "—";

const fmtFull = (v) =>
  v
    ? formatDateTime(v)
    : "—";

const LoadDetailsLeft = ({ load }) => (
  <div>
    {/* ── Order Status ── */}
    <Card>
      <SectionHeader label="Order Status" accent="#6366f1" />
      <InfoRow
        label="Load Status"
        value={<StatusChip value={load.transportStatus} map={TRANSPORT_STATUS_COLOR} />}
      />
      <InfoRow label="Container Size" value={load.containerType} />
      <InfoRow label="Order Bill Date" value={fmt(load.orderBillDate)} />
      <InfoRow label="Last Free Date" value={fmtFull(load.lastFreeDate)} />
      <InfoRow label="Commodity" value={load.commodity} />
      <InfoRow
        label="Chassis Rent"
        value={
          load.chassisRent ? (
            <span className="text-green-700 font-bold">✔ Yes</span>
          ) : null
        }
      />
      <InfoRow
        label="Hazmat"
        value={
          load.hazmat ? (
            <span className="text-red-600 font-bold">✔ Yes</span>
          ) : null
        }
      />
      <InfoRow
        label="Rail Container"
        value={
          load.railContainer ? (
            <span className="text-green-700 font-bold">✔ Yes</span>
          ) : null
        }
      />
    </Card>

    {/* ── Routing ── */}
    <Card>
      <SectionHeader label="Routing" accent="#8b5cf6" />
      {/* deliveryType is legacy — every load is a single Drop or Pick now. */}
      <InfoRow label="Type" value={load.singleType} />
      <InfoRow label="Load Type" value={load.truckType} />
      <InfoRow label="Material" value={load.material} />
      <InfoRow
        label="Amount"
        value={
          load.amount ? (
            <span className="font-bold text-emerald-600">
              ${load.amount.toLocaleString()}
            </span>
          ) : null
        }
      />
      <div className="border-t border-gray-100 my-2"></div>
      {load.pickedUpAt && (
        <InfoRow
          label="Picked Up"
          value={
            <span className="text-indigo-600 font-semibold">
              {load.pickedUpCity}, {load.pickedUpState} @ {fmtFull(load.pickedUpAt)}
            </span>
          }
        />
      )}
      <div className="border-t border-gray-100 my-2"></div>
      {load.deliveredAt && (
        <InfoRow
          label="Delivered"
          value={
            <span className="text-blue-600 font-semibold">
              {load.deliveredCity}, {load.deliveredState} @ {fmtFull(load.deliveredAt)}
            </span>
          }
        />
      )}
    </Card>

    {/* ── Description / Remarks ── */}
    <Card>
      <SectionHeader label="Description / Remarks" accent="#10b981" />

      <div className="px-4 py-3 border-b border-gray-50">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
          Description
        </p>
        <p className={`text-sm ${load.description ? "text-gray-700" : "text-gray-300 italic"}`}>
          {load.description || "No description provided"}
        </p>
      </div>

      <div className="px-4 py-3">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
          Remarks
        </p>
        <p className={`text-sm ${load.remarks ? "text-gray-700" : "text-gray-300 italic"}`}>
          {load.remarks || "No remarks added"}
        </p>
      </div>
    </Card>
  </div>
);

export default LoadDetailsLeft;