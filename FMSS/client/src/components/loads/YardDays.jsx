// ─── How long a container has stood in the yard ───────────────────────────────
// Reads the `yard` the server attaches to a parked load ({ since, days } — see
// server/utils/yardAge.js) rather than working it out here, so the Over tab and
// the accounting queue can never show two different ages for the same box.
//
// The tone steps up with age: a week is normal, a month is worth a look, and
// anything past that is a box somebody may have forgotten — and a driver who
// may have been missed on a pay cycle.
// ─────────────────────────────────────────────────────────────────────────────

const toneFor = (days) =>
  days >= 30
    ? "bg-red-100 text-red-800 border-red-200"
    : days >= 7
      ? "bg-amber-100 text-amber-800 border-amber-200"
      : "bg-gray-100 text-gray-800 border-gray-200";

const YardDays = ({ yard, className = "" }) => {
  if (!yard || yard.days === null || yard.days === undefined) return null;

  const { days } = yard;
  const label = days === 0 ? "Today" : `${days} ${days === 1 ? "day" : "days"}`;

  return (
    <span
      title="Days since it was put down in the yard or at the warehouse"
      className={`inline-block whitespace-nowrap rounded border px-2 py-0.5 text-[13px] font-bold ${toneFor(days)} ${className}`}
    >
      {label} in yard
    </span>
  );
};

export default YardDays;
