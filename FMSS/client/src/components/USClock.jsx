import { useEffect, useState } from "react";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import { getActiveTimeZone } from "../utils/dates";

// The clock every date and time in the app is shown on. Put in the header so
// somebody can see at a glance which zone "3:00 PM" on a load means — it is the
// viewer's own zone, taken from their device at sign-in, named here so there is
// no guessing (a dispatcher on Pacific and one on Eastern each see their own).

// The IANA id as a readable place, e.g. "America/Los_Angeles" → "Los Angeles".
const zoneLabel = (tz) => (tz || "").split("/").pop().replace(/_/g, " ");

const USClock = () => {
  const [now, setNow] = useState(() => new Date());
  // Resolved on each tick so it follows a timezone captured after this mounted.
  const tz = getActiveTimeZone();

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeFormat = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });

  const dayFormat = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-hairline bg-surface px-3 py-1.5 mr-auto"
      title={`All dates and times in this app are shown in your timezone (${tz})`}
    >
      <AccessTimeIcon fontSize="small" className="text-ink-500" />
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-bold tabular-nums text-ink-800">
          {timeFormat.format(now)}
        </span>
        <span className="hidden sm:block text-[13px] font-semibold text-ink-500">
          {dayFormat.format(now)} · {zoneLabel(tz)}
        </span>
      </div>
    </div>
  );
};

export default USClock;
