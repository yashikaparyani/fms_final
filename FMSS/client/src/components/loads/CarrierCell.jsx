import { carrierOnLoad } from "../../utils/loadCarrier";

// ─── Who is on this load ──────────────────────────────────────────────────────
// A load split between carriers is shown as its legs, in running order. Naming
// only the first would read as "this load is with one carrier" when it is with
// two, and the leg each one runs is the thing dispatch is actually asked about.
//
// Shared by All Transit and Over so the two tabs cannot end up answering the
// same question differently — which is exactly what they were doing.
// ─────────────────────────────────────────────────────────────────────────────

// wa.me needs digits only (with country code if the number has one)
const waLink = (phone) => `https://wa.me/${String(phone).replace(/\D/g, "")}`;

export const WhatsAppButton = ({ phone }) => {
  if (!phone) return null;
  return (
    <a
      href={waLink(phone)}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={`WhatsApp ${phone}`}
      className="flex-shrink-0 text-green-600 hover:text-green-700 transition-colors"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    </a>
  );
};

const CarrierLegs = ({ load }) => (
  <div className="space-y-1.5">
    {load.assignments.map((leg, index) => (
      <div key={leg._id || index} className="leading-tight">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold text-white bg-indigo-600 rounded px-1 py-px flex-shrink-0">
            {index + 1}
          </span>
          <span className="text-xs font-bold text-green-800 truncate">
            {leg.fleetOwnerName}
          </span>
        </div>
        <p className="text-[10px] text-gray-500 pl-5 truncate">
          {[leg.origin?.city, leg.destination?.city].filter(Boolean).join(" → ") ||
            "—"}
          {leg.transportStatus
            ? " · " + leg.transportStatus.replace(/_/g, " ").toLowerCase()
            : ""}
        </p>
      </div>
    ))}
  </div>
);

const CarrierCell = ({ load, fleetOwners = [] }) => {
  if (load.assignments?.length) return <CarrierLegs load={load} />;

  const carrier = carrierOnLoad(load, fleetOwners);
  if (!carrier) {
    return <span className="text-xs text-gray-400 italic">Not assigned</span>;
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full bg-green-600 flex-shrink-0" />
      <span className="text-xs font-bold text-green-800">
        {carrier.name}
        {carrier.phone && (
          <span className="font-semibold text-green-700"> ({carrier.phone})</span>
        )}
      </span>
      <WhatsAppButton phone={carrier.phone} />
    </div>
  );
};

export default CarrierCell;
