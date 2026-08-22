import { useCallback, useEffect, useState } from "react";

// ─── How load rows are tinted ────────────────────────────────────────────────
// The tables can colour a row two ways, and which one is useful depends
// entirely on the question being asked:
//
//   priority — how soon it picks up. The planning view: what has to move next.
//   status   — where it actually is. The dispatch view: what is stuck, what is
//              rolling, what needs paperwork.
//
// One of them has to lose, so it is a choice rather than a default. The choice
// is per-person and remembered, because it tracks the job somebody does all day
// rather than the screen they happen to be on — a dispatcher wants status
// everywhere, a planner wants priority everywhere.
// ─────────────────────────────────────────────────────────────────────────────

export const COLOR_MODE = {
  PRIORITY: "priority",
  STATUS: "status",
};

const STORAGE_KEY = "fmss_load_color_mode";

// Changing the mode in one table should change it in the others on the same
// screen. Storage events only fire in *other* tabs, so same-tab listeners are
// kept here and notified directly.
const listeners = new Set();

const readMode = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === COLOR_MODE.STATUS ? COLOR_MODE.STATUS : COLOR_MODE.PRIORITY;
  } catch {
    return COLOR_MODE.PRIORITY;
  }
};

const writeMode = (mode) => {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* a blocked store just means the choice does not outlive the session */
  }
  listeners.forEach((fn) => fn(mode));
};

/** `[mode, setMode, isStatusMode]`. */
export const useLoadColorMode = () => {
  const [mode, setModeState] = useState(readMode);

  useEffect(() => {
    const onChange = (next) => setModeState(next);
    listeners.add(onChange);

    // Another tab switching mode should not leave this one disagreeing.
    const onStorage = (event) => {
      if (event.key === STORAGE_KEY) setModeState(readMode());
    };
    window.addEventListener("storage", onStorage);

    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setMode = useCallback((next) => {
    const value = next === COLOR_MODE.STATUS ? COLOR_MODE.STATUS : COLOR_MODE.PRIORITY;
    writeMode(value);
    setModeState(value);
  }, []);

  return [mode, setMode, mode === COLOR_MODE.STATUS];
};

// ─── Status row tints ────────────────────────────────────────────────────────
// Every transport status gets its own colour. The chip map in
// components/track-load/StatusChip.jsx reused one green for ASSIGNED, REACHED
// DESTINATION and DELIVERED, which is fine on a badge you read the text of and
// useless as a row tint — three different situations that look identical.
//
// The hues follow the journey rather than being picked at random: violet while
// it is being planned, blue once it is real work, teal through pickup and
// transit, green as it lands, grey once it is parked, red when it stops.
// Tints are deliberately pale — a full-strength row colour behind small text is
// unreadable, and forty of them on screen at once is worse.
// ─────────────────────────────────────────────────────────────────────────────

export const STATUS_ROW_COLORS = {
  // Planning
  LOAD_PLANNER: { bg: "#f5f3ff", border: "#8b5cf6" },
  NEW_LOAD: { bg: "#eef2ff", border: "#6366f1" },

  // Committed
  ASSIGNED: { bg: "#eff6ff", border: "#2563eb" },
  READY_TO_PICKUP: { bg: "#e0f2fe", border: "#0284c7" },

  // Moving
  PICKED_UP: { bg: "#ecfeff", border: "#06b6d4" },
  IN_TRANSIT: { bg: "#fefce8", border: "#eab308" },
  DRIVER_ON_WAITING: { bg: "#fff7ed", border: "#f97316" },

  // Landed
  REACHED_DESTINATION: { bg: "#f0fdfa", border: "#14b8a6" },
  DELIVERED: { bg: "#f0fdf4", border: "#22c55e" },

  // Parked / interim
  DROP_IN_WAREHOUSE: { bg: "#faf5ff", border: "#a855f7" },
  EMPTY_IN_YARD: { bg: "#f8fafc", border: "#94a3b8" },
  LOADED_IN_YARD: { bg: "#fdf4ff", border: "#d946ef" },
  STREET_TURN: { bg: "#f7fee7", border: "#84cc16" },

  // Money and paperwork
  PAPERWORK_PENDING: { bg: "#fff1f2", border: "#fb7185" },
  INVOICED: { bg: "#f0f9ff", border: "#0ea5e9" },

  // Stopped
  TERMINATED: { bg: "#fef2f2", border: "#ef4444" },
};

/** Approval status, for the tables that colour by that instead. */
export const LOAD_STATUS_ROW_COLORS = {
  DRAFT: { bg: "#f8fafc", border: "#94a3b8" },
  PENDING_VERIFICATION: { bg: "#fffbeb", border: "#f59e0b" },
  VERIFIED: { bg: "#f0fdf4", border: "#22c55e" },
  REQUIRES_CHANGES: { bg: "#fff7ed", border: "#f97316" },
  REJECTED: { bg: "#fef2f2", border: "#ef4444" },
};

/** Shown in the legend and on the mobile cards. */
export const STATUS_LABEL = (value) =>
  (value || "—").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const FALLBACK = { bg: "#f9fafb", border: "#d1d5db" };

/** The tint for one row under the active mode. */
export const rowColorFor = (row, mode, urgencyColors) => {
  if (mode === COLOR_MODE.STATUS) {
    return (
      STATUS_ROW_COLORS[row.transportStatus] ||
      LOAD_STATUS_ROW_COLORS[row.status] ||
      FALLBACK
    );
  }
  return urgencyColors?.[row.urgency] || FALLBACK;
};

/**
 * Which statuses are actually present in the rows on screen, in journey order.
 * The legend lists these rather than all sixteen — a legend explaining twelve
 * colours that are not on the page is noise.
 */
export const legendFor = (rows = []) => {
  const order = Object.keys(STATUS_ROW_COLORS);
  const present = new Set(
    rows.map((row) => row.transportStatus).filter((s) => s && STATUS_ROW_COLORS[s]),
  );
  return order
    .filter((status) => present.has(status))
    .map((status) => ({
      status,
      label: STATUS_LABEL(status),
      ...STATUS_ROW_COLORS[status],
    }));
};
