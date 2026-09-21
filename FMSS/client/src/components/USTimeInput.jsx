import { useState } from "react";

// ─── US-time pickers ──────────────────────────────────────────────────────────
// The browser's own <input type="time"> and <input type="datetime-local"> open
// on the VIEWER's clock — somebody in Pune gets 13:41 highlighted when it is
// 4:11 AM in New York — and render 12- or 24-hour depending on the laptop's
// Windows locale. Neither can be told which zone to use.
//
// These replace them with plain hour / minute / AM-PM selects, labelled ET, so
// there is no local clock anywhere to fall back on. They take and give the same
// strings the native inputs did ("14:30" and "2026-03-15T14:30"), and call
// onChange with an event-like { target: { name, value } }, so they drop in where
// the old inputs were.

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const pad = (n) => String(n).padStart(2, "0");

const parseTime = (value) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(value || "");
  if (!match) return { hour: "", minute: "", period: "AM" };
  const h24 = Number(match[1]);
  return {
    hour: String(h24 % 12 || 12),
    minute: String(Number(match[2])),
    period: h24 < 12 ? "AM" : "PM",
  };
};

const toTimeString = ({ hour, minute, period }) => {
  if (hour === "") return "";
  const h12 = Number(hour) % 12;
  const h24 = period === "PM" ? h12 + 12 : h12;
  return `${pad(h24)}:${pad(Number(minute || 0))}`;
};

const bare =
  "bg-transparent outline-none cursor-pointer disabled:cursor-not-allowed appearance-none text-center";

/** A US-clock time: value "HH:MM" (24h), shown as 1–12 : mm AM/PM ET. */
export const USTimeInput = ({ name, value, onChange, disabled, className = "" }) => {
  const parts = parseTime(value);
  // An odd minute typed in the past (say 14:07) stays selectable.
  const minutes =
    parts.minute !== "" && !MINUTES.includes(Number(parts.minute))
      ? [...MINUTES, Number(parts.minute)].sort((a, b) => a - b)
      : MINUTES;

  const emit = (next) => {
    const merged = { ...parts, ...next };
    // Picking an hour first fills in :00, so one click gives a valid time.
    if (merged.hour !== "" && merged.minute === "") merged.minute = "0";
    onChange?.({ target: { name, value: next.hour === "" ? "" : toTimeString(merged) } });
  };

  return (
    <div className={`${className} flex items-center gap-1`}>
      <select
        aria-label="Hour"
        className={`${bare} w-10`}
        value={parts.hour}
        disabled={disabled}
        onChange={(e) => emit({ hour: e.target.value })}
      >
        <option value="">--</option>
        {HOURS.map((h) => (
          <option key={h} value={String(h)}>{h}</option>
        ))}
      </select>
      <span className="text-ink-400">:</span>
      <select
        aria-label="Minute"
        className={`${bare} w-10`}
        value={parts.minute}
        disabled={disabled || parts.hour === ""}
        onChange={(e) => emit({ minute: e.target.value })}
      >
        <option value="">--</option>
        {minutes.map((m) => (
          <option key={m} value={String(m)}>{pad(m)}</option>
        ))}
      </select>
      <select
        aria-label="AM or PM"
        className={`${bare} w-12`}
        value={parts.period}
        disabled={disabled || parts.hour === ""}
        onChange={(e) => emit({ period: e.target.value })}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
      <span className="ml-auto rounded bg-ink-100 px-1.5 py-0.5 text-xs font-bold text-ink-500" title="US Eastern time">
        ET
      </span>
    </div>
  );
};

/** A US-clock date and time: value "YYYY-MM-DDTHH:mm", as the old datetime-local. */
export const USDateTimeInput = ({ name, value, onChange, disabled, className = "", max }) => {
  // A whole value lives in the parent. Only a half-picked pair — a date with no
  // time yet — is held here, because the parent is told "" until both are set.
  const [draft, setDraft] = useState({ date: "", time: "" });
  const date = value ? value.slice(0, 10) : draft.date;
  const time = value ? value.slice(11, 16) : draft.time;

  const emit = (nextDate, nextTime) => {
    const full = nextDate && nextTime ? `${nextDate}T${nextTime}` : "";
    setDraft(full ? { date: "", time: "" } : { date: nextDate, time: nextTime });
    onChange?.({ target: { name, value: full } });
  };

  return (
    <div className="flex flex-wrap gap-2">
      <input
        type="date"
        className={`${className} min-w-[9rem] flex-1`}
        value={date}
        max={max ? max.slice(0, 10) : undefined}
        disabled={disabled}
        onChange={(e) => emit(e.target.value, time)}
      />
      <USTimeInput
        className={`${className} min-w-[10rem] flex-1`}
        value={time}
        disabled={disabled}
        onChange={(e) => emit(date, e.target.value)}
      />
    </div>
  );
};

export default USTimeInput;
