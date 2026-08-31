import { PRE_DISPATCH, STATUS_BADGE_COLORS } from "../../utils/loadColorMode";
import { transportStatusLabel } from "../../utils/transportStatus";

// ─── Transit progress ─────────────────────────────────────────────────────────
// Origin to destination on one line: how far along the load is, and how long is
// left. It answers the question everybody actually opens a tracking page to ask,
// which the status timeline below it does not — the timeline is a list of things
// that already happened, and reading "how far along is this" off it means
// knowing the whole status order by heart.
//
// Two independent readings sit on the same bar, and keeping them apart is the
// point:
//
//   progress — where the load is in its journey, derived from the transport
//              status. This is a fact: the driver said they were in transit.
//   schedule — where it should be by now, derived from the pickup and delivery
//              dates. This is a plan, and the plan is frequently wrong.
//
// The bar shows progress; the schedule only supplies the ETA and the "running
// late" note. Blending them would produce a bar that moves on its own while the
// truck stands still, which is worse than no bar.
// ─────────────────────────────────────────────────────────────────────────────

// How far through the journey each status is, 0–1. Not evenly spaced: a load
// that has been picked up is a long way from a load merely assigned, and the
// stretch between picked up and reached destination is where nearly all of the
// waiting actually happens.
const JOURNEY = [
  { status: "ASSIGNED", at: 0.02, label: "Assigned" },
  { status: "READY_TO_PICKUP", at: 0.08, label: "Ready to pick up" },
  { status: "PICKED_UP", at: 0.25, label: "Picked up" },
  { status: "IN_TRANSIT", at: 0.55, label: "In transit" },
  { status: "REACHED_DESTINATION", at: 0.9, label: "At destination" },
  { status: "DELIVERED", at: 1, label: "Delivered" },
];

const JOURNEY_BY_STATUS = new Map(JOURNEY.map((step) => [step.status, step]));

// Statuses that are not a point on the line. A load sitting in a yard or handed
// over on a street turn has left the journey rather than advanced along it, so
// the bar stops where it was and says why instead of inventing a position.
const OFF_JOURNEY = {
  DRIVER_ON_WAITING: "Driver waiting",
  DROP_IN_WAREHOUSE: "Dropped at warehouse",
  LOADED_IN_YARD: "Loaded in yard",
  EMPTY_IN_YARD: "Empty in yard",
  STREET_TURN: "Street turned",
  PAPERWORK_PENDING: "Paperwork pending",
  INVOICED: "Invoiced",
  TERMINATED: "Terminated",
};

const MS_PER_HOUR = 3600000;

const dateOf = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** "3d 4h", "6h 20m", "12m" — the same shape the timeline's durations use. */
const humanise = (ms) => {
  const mins = Math.round(Math.abs(ms) / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const rest = mins % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${rest}m`;
  return `${rest}m`;
};

const fmtDateTime = (value) =>
  value
    ? new Date(value).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

const cityOf = (stop) =>
  [stop?.city, stop?.state].filter(Boolean).join(", ") || stop?.company || "—";

/**
 * Everything the bar needs, derived from the load.
 *
 * Kept out of the component so the arithmetic can be read on its own — it is
 * the only part of this file where being wrong is not merely ugly.
 */
const transitProgressOf = (load = {}) => {
  const status = load.transportStatus;
  const step = JOURNEY_BY_STATUS.get(status);
  const offJourney = OFF_JOURNEY[status] || null;

  // A load nobody is carrying has not started, whatever its dates say.
  const notStarted = !status || PRE_DISPATCH.has(status);

  // The furthest point the load has actually reached. An off-journey status
  // keeps whatever it had got to rather than falling back to zero — a load
  // dropped at a warehouse has still been picked up.
  const reached = (load.transportStatusHistory || [])
    .map((entry) => JOURNEY_BY_STATUS.get(entry.status)?.at)
    .filter((at) => typeof at === "number");

  const progress = notStarted
    ? 0
    : Math.max(step?.at ?? 0, ...(reached.length ? reached : [0]));

  const pickupDate =
    dateOf(load.pickedUpAt) ??
    dateOf(load.pickups?.[0]?.pickupDate) ??
    dateOf(load.pickup?.pickupDate);

  const deliveryDate =
    dateOf(load.drops?.[0]?.deliveryDate) ?? dateOf(load.drop?.deliveryDate);

  const deliveredAt = dateOf(load.deliveredAt);
  const now = new Date();

  // Planned journey length, only meaningful when both ends are known and in the
  // right order. A delivery date before the pickup is bad data, not a negative
  // journey, so it is treated as no plan at all.
  const plannedMs =
    pickupDate && deliveryDate && deliveryDate > pickupDate
      ? deliveryDate - pickupDate
      : null;

  const isDelivered = status === "DELIVERED";

  // Actual door-to-door time, once there is one. This is the number worth
  // keeping — it is what the next quote on this lane should be built from.
  const actualMs =
    isDelivered && pickupDate && deliveredAt ? deliveredAt - pickupDate : null;

  const remainingMs =
    !isDelivered && deliveryDate ? deliveryDate - now : null;

  return {
    status,
    offJourneyLabel: offJourney,
    notStarted,
    isDelivered,
    progress: Math.min(1, Math.max(0, progress)),
    percent: Math.round(Math.min(1, Math.max(0, progress)) * 100),
    origin: cityOf(load.pickups?.[0] || load.pickup),
    destination: cityOf(load.drops?.[0] || load.drop),
    pickupDate,
    deliveryDate,
    deliveredAt,
    plannedMs,
    actualMs,
    remainingMs,
    // Late only counts while the load is still moving. A delivered load that
    // arrived late is a fact for the timeline, not an alarm on a progress bar.
    isLate: !isDelivered && remainingMs !== null && remainingMs < 0,
    // Under an hour out and not there yet — worth saying, because it is the
    // point at which somebody should be waiting at the dock.
    isImminent:
      !isDelivered &&
      remainingMs !== null &&
      remainingMs >= 0 &&
      remainingMs < MS_PER_HOUR,
  };
};

const Endpoint = ({ label, place, when, align = "left" }) => (
  <div className={align === "right" ? "text-right" : ""}>
    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
      {label}
    </p>
    <p className="text-sm font-semibold text-gray-900 leading-tight">{place}</p>
    <p className="text-[11px] text-gray-500">{when}</p>
  </div>
);

const TransitProgress = ({ load }) => {
  const t = transitProgressOf(load);

  // Nothing honest to draw for a load nobody is carrying yet — the bar would
  // sit at zero and the ETA would be a guess about a truck that has not been
  // chosen.
  if (t.notStarted) return null;

  const colors = STATUS_BADGE_COLORS[t.status] || {
    bg: "#f3f4f6",
    color: "#374151",
    border: "#e5e7eb",
  };

  const eta = t.isDelivered
    ? `Delivered ${fmtDateTime(t.deliveredAt)}`
    : t.deliveryDate
      ? `Due ${fmtDateTime(t.deliveryDate)}`
      : "No delivery date on this load";

  const remaining = t.isDelivered
    ? t.actualMs !== null
      ? `${humanise(t.actualMs)} door to door`
      : null
    : t.remainingMs === null
      ? null
      : t.isLate
        ? `${humanise(t.remainingMs)} overdue`
        : `${humanise(t.remainingMs)} remaining`;

  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <Endpoint
          label="Origin"
          place={t.origin}
          when={t.pickupDate ? fmtDateTime(t.pickupDate) : "No pickup date"}
        />
        <Endpoint
          label="Destination"
          place={t.destination}
          when={eta}
          align="right"
        />
      </div>

      {/* The bar. Steps sit on it at their own point in the journey, so the fill
          can be read against where the load is meant to get to next. */}
      <div className="relative h-2 rounded-full bg-gray-100">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{
            width: `${t.percent}%`,
            backgroundColor: t.isLate ? "#ef4444" : colors.color,
          }}
        />
        {JOURNEY.map((step) => (
          <span
            key={step.status}
            title={step.label}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full border-2 border-white"
            style={{
              left: `${step.at * 100}%`,
              backgroundColor:
                t.progress >= step.at
                  ? t.isLate
                    ? "#ef4444"
                    : colors.color
                  : "#d1d5db",
            }}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 mt-2.5 flex-wrap">
        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold"
          style={{
            backgroundColor: colors.bg,
            color: colors.color,
            border: `1px solid ${colors.border}`,
          }}
        >
          {transportStatusLabel(t.status)}
          <span className="opacity-70">· {t.percent}%</span>
        </span>

        <div className="flex items-center gap-2 text-[11px]">
          {t.offJourneyLabel && (
            <span className="font-semibold text-gray-500">
              Off the road — {t.offJourneyLabel.toLowerCase()}
            </span>
          )}
          {remaining && (
            <span
              className={`font-bold ${
                t.isLate
                  ? "text-red-600"
                  : t.isImminent
                    ? "text-amber-600"
                    : "text-gray-600"
              }`}
            >
              {remaining}
            </span>
          )}
          {t.plannedMs !== null && !t.isDelivered && (
            <span className="text-gray-400">
              of {humanise(t.plannedMs)} planned
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default TransitProgress;
