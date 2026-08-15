import { useEffect, useRef } from "react";

// How often data views re-pull from the server. One shared constant so the
// whole app polls on the same cadence.
export const AUTO_REFRESH_MS = 10000;

/**
 * Re-runs `onRefresh` on a fixed interval so a screen left open keeps showing
 * current data.
 *
 * Callers pass a *silent* refresh — one that swaps the data in without raising
 * the page's loading flag — otherwise the list would flash a spinner every
 * tick. Pages with unsaved user input should stay off this hook, or gate it
 * with `enabled` while a draft is dirty, since a refresh overwrites state.
 *
 * @param {() => (void|Promise<void>)} onRefresh Read the latest data.
 * @param {object}  [options]
 * @param {boolean} [options.enabled=true]  Pause polling when false.
 * @param {number}  [options.intervalMs]    Override the shared cadence.
 */
export const useAutoRefresh = (
  onRefresh,
  { enabled = true, intervalMs = AUTO_REFRESH_MS } = {},
) => {
  // Held in a ref so callers don't have to memoise their callback: a new
  // function identity each render would otherwise restart the interval and
  // starve the refresh.
  const callbackRef = useRef(onRefresh);
  const inFlightRef = useRef(false);

  useEffect(() => {
    callbackRef.current = onRefresh;
  });

  useEffect(() => {
    if (!enabled) return undefined;

    const run = async () => {
      // A background tab has nobody watching, and a slow request would just
      // stack up behind the previous one.
      if (document.hidden || inFlightRef.current) return;

      inFlightRef.current = true;
      try {
        await callbackRef.current?.();
      } catch {
        // A background refresh that fails is not worth interrupting the user
        // for; the next tick tries again.
      } finally {
        inFlightRef.current = false;
      }
    };

    // Coming back to the tab, show current data rather than waiting a tick.
    const onVisible = () => {
      if (!document.hidden) run();
    };

    const id = setInterval(run, intervalMs);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, intervalMs]);
};

export default useAutoRefresh;
