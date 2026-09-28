import MasterCrudPage from "../../components/admin/MasterCrudPage";
import { formatDate, todayKey, toDateKey } from "../../utils/dates";

const money = (value) =>
  `$${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** Rates oldest first, each with its effective day as "YYYY-MM-DD". */
const ratesOf = (row) =>
  (row?.rateHistory || [])
    .map((entry) => ({ ...entry, key: toDateKey(entry.effectiveDate) }))
    .sort((a, b) => a.key.localeCompare(b.key));

// The rate charged today, and a future one already booked in, if any. A rate
// entered with next month's effective date is not what today costs.
const RentCell = ({ row }) => {
  const rates = ratesOf(row);
  if (!rates.length) {
    return row?.dailyRent != null ? `${money(row.dailyRent)} / day` : "—";
  }

  const today = todayKey();
  const current = [...rates].reverse().find((r) => r.key <= today) || rates[0];
  const next = rates.find((r) => r.key > today);

  return (
    <div className="leading-tight">
      <p className="font-semibold text-gray-800">{money(current.dailyRent)} / day</p>
      <p className="text-[12px] text-gray-500">since {formatDate(current.effectiveDate)}</p>
      {next && (
        <p className="text-[12px] text-amber-700">
          {money(next.dailyRent)} from {formatDate(next.effectiveDate)}
        </p>
      )}
    </div>
  );
};

const RateHistory = (initial) => {
  const rates = ratesOf(initial);
  if (!rates.length) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="text-[12px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
        Rate history
      </p>
      <ul className="space-y-0.5 text-[13px] text-gray-700">
        {[...rates].reverse().map((r) => (
          <li key={r.key} className="flex justify-between gap-3">
            <span>From {formatDate(r.effectiveDate)}</span>
            <span className="font-semibold">{money(r.dailyRent)} / day</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

// Email is optional here: a chassis company is selectable on a load whether or
// not anyone needs to be notified about it.
//
// Daily rent is charged per day from the load's pickup date. Changing it needs
// an effective date, and the old rate is kept for the days before it — so a load
// already on the road is not re-priced backwards.
const config = {
  singular: "Chassis Company",
  plural: "Chassis Companies",
  endpoint: "/chassis-companies",
  namePlaceholder: "e.g. TRAC Intermodal",
  fields: [
    { name: "code", label: "Code", placeholder: "e.g. TRAC" },
    {
      name: "email",
      label: "Email",
      type: "email",
      placeholder: "Optional",
      hint: "If set, notified when a street turn is confirmed.",
    },
    { name: "phone", label: "Phone", placeholder: "Optional" },
    {
      name: "dailyRent",
      label: "Daily Rent ($ per day)",
      type: "number",
      placeholder: "e.g. 35",
      hint: "Chassis rent is charged per day, counted from the load's pickup date.",
      render: (row) => <RentCell row={row} />,
    },
    {
      name: "rateEffectiveDate",
      label: "Rate Effective Date",
      type: "date",
      formOnly: true,
      hint: "Required when you change the daily rent. Days before this date keep the old rate.",
    },
  ],
  modalExtra: RateHistory,
};

const ChassisCompanies = () => <MasterCrudPage config={config} />;

export default ChassisCompanies;
