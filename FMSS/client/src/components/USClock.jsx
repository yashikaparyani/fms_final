import { useEffect, useState } from "react";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import { BUSINESS_TIME_ZONE } from "../utils/dates";

// The clock every date and time in the app is shown on. Put in the header so
// somebody working from India can see at a glance what "3:00 PM" on a load means
// — it is US time, not theirs.

const dayFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const timeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  timeZoneName: "short",
});

const USClock = () => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-hairline bg-surface px-3 py-1.5 mr-auto"
      title={`All dates and times in this app are US time (${BUSINESS_TIME_ZONE})`}
    >
      <AccessTimeIcon fontSize="small" className="text-ink-500" />
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-bold tabular-nums text-ink-800">
          {timeFormat.format(now)}
        </span>
        <span className="hidden sm:block text-[11px] font-semibold text-ink-500">
          {dayFormat.format(now)} · US Eastern
        </span>
      </div>
    </div>
  );
};

export default USClock;
