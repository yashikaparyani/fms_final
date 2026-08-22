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
// The hues track the journey rather than being picked at random: grey while
// nothing has happened yet, blue once it is committed, cyan and yellow through
// pickup and transit, green as it lands, purple once it is parked, red when it
// stops. Read down a column and the colour tells you how far along the load is.
//
// Tints are deliberately pale — a full-strength row colour behind small text is
// unreadable, and forty of them on screen at once is worse.
// ─────────────────────────────────────────────────────────────────────────────

// Pre-dispatch. Nothing has physically happened to these yet, so they are
// deliberately muted: a load sitting in the planner must not compete for
// attention with one that is actually in transit. Loads default to NEW_LOAD on
// creation, so without this the whole Pending table paints itself one loud
// colour and the journey — the thing worth seeing — is drowned out.
export const PRE_DISPATCH = new Set(["LOAD_PLANNER", "NEW_LOAD"]);

export const STATUS_ROW_COLORS = {
  // Pre-dispatch — muted on purpose, see above.
  LOAD_PLANNER: { bg: "#f8fafc", border: "#cbd5e1" },
  NEW_LOAD: { bg: "#f8fafc", border: "#94a3b8" },

  // Committed
  ASSIGNED: { bg: "#eff6ff", border: "#2563eb" },
  READY_TO_PICKUP: { bg: "#e0f2fe", border: "#0284c7" },

  // Moving — the journey, and the loudest part of the scale
  PICKED_UP: { bg: "#ecfeff", border: "#06b6d4" },
  IN_TRANSIT: { bg: "#fefce8", border: "#eab308" },
  DRIVER_ON_WAITING: { bg: "#fff7ed", border: "#f97316" },

  // Landed
  REACHED_DESTINATION: { bg: "#f0fdfa", border: "#14b8a6" },
  DELIVERED: { bg: "#f0fdf4", border: "#22c55e" },

  // Parked / interim
  DROP_IN_WAREHOUSE: { bg: "#faf5ff", border: "#a855f7" },
  EMPTY_IN_YARD: { bg: "#f5f3ff", border: "#8b5cf6" },
  LOADED_IN_YARD: { bg: "#fdf4ff", border: "#d946ef" },
  STREET_TURN: { bg: "#f7fee7", border: "#84cc16" },

  // Money and paperwork
  PAPERWORK_PENDING: { bg: "#fff1f2", border: "#fb7185" },
  INVOICED: { bg: "#f0f9ff", border: "#0ea5e9" },

  // Stopped
  TERMINATED: { bg: "#fef2f2", border: "#ef4444" },
};

/** Approval status, used for loads that have not been dispatched yet. */
export const LOAD_STATUS_ROW_COLORS = {
  DRAFT: { bg: "#f8fafc", border: "#94a3b8" },
  PENDING_VERIFICATION: { bg: "#fffbeb", border: "#f59e0b" },
  VERIFIED: { bg: "#f0fdf4", border: "#22c55e" },
  REQUIRES_CHANGES: { bg: "#fff7ed", border: "#f97316" },
  REJECTED: { bg: "#fef2f2", border: "#ef4444" },
  ASSIGNED: { bg: "#eff6ff", border: "#2563eb" },
};

/** Shown in the legend and on the mobile cards. */
export const STATUS_LABEL = (value) =>
  (value || "—").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const FALLBACK = { bg: "#f9fafb", border: "#d1d5db" };

/**
 * Which status actually describes this row, and what colour it gets.
 *
 * A load that has not been dispatched has a transportStatus, but it is a
 * placeholder — every load in the Pending table reads NEW_LOAD or LOAD_PLANNER.
 * Colouring by it there produces one flat block and tells you nothing, so those
 * rows fall back to their approval status, which is the axis that varies before
 * dispatch. Once a load is moving, the journey takes over.
 *
 * Both the row tint and the legend go through here, so the key always matches
 * what is on screen.
 */
export const resolveStatus = (row = {}) => {
  const transport = row.transportStatus;

  if (transport && !PRE_DISPATCH.has(transport) && STATUS_ROW_COLORS[transport]) {
    return { key: transport, label: STATUS_LABEL(transport), ...STATUS_ROW_COLORS[transport] };
  }

  const approval = row.status;
  if (approval && LOAD_STATUS_ROW_COLORS[approval]) {
    return { key: approval, label: STATUS_LABEL(approval), ...LOAD_STATUS_ROW_COLORS[approval] };
  }

  if (transport && STATUS_ROW_COLORS[transport]) {
    return { key: transport, label: STATUS_LABEL(transport), ...STATUS_ROW_COLORS[transport] };
  }

  return { key: "UNKNOWN", label: "—", ...FALLBACK };
};

/** The tint for one row under the active mode. */
export const rowColorFor = (row, mode, urgencyColors) => {
  if (mode === COLOR_MODE.STATUS) {
    const { bg, border } = resolveStatus(row);
    return { bg, border };
  }
  return urgencyColors?.[row.urgency] || FALLBACK;
};

/**
 * The statuses actually on screen, in journey order.
 *
 * Resolved the same way the rows are, so a Pending table shows its approval
 * statuses and a transit table shows pickup / in transit / delivered — rather
 * than a key full of colours that are not in the table.
 */
export const legendFor = (rows = []) => {
  const order = [
    ...Object.keys(STATUS_ROW_COLORS),
    ...Object.keys(LOAD_STATUS_ROW_COLORS),
  ];

  const seen = new Map();
  for (const row of rows) {
    const entry = resolveStatus(row);
    if (entry.key !== "UNKNOWN" && !seen.has(entry.key)) seen.set(entry.key, entry);
  }

  return [...seen.values()].sort(
    (a, b) => order.indexOf(a.key) - order.indexOf(b.key),
  );
};
