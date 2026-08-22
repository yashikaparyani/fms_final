import { useCallback, useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import CloseIcon from "@mui/icons-material/Close";
import api from "../api";

/**
 * The scrolling announcement bar.
 *
 * Sits under the topbar in every portal, so an announcement addressed to
 * drivers reaches them wherever they are rather than on one page they might
 * never open.
 *
 * Dismissal is per-announcement and kept in localStorage: a marquee that
 * reappears on every navigation is one people learn to look past, and the
 * server has no business storing "Priya has read the maintenance notice".
 * Re-posting gives a new id, so a genuinely new announcement always shows.
 */

const DISMISSED_KEY = "fmss_dismissed_announcements";

const TONES = {
  info: "bg-accent-600",
  success: "bg-good-600",
  warning: "bg-warn-600",
  danger: "bg-bad-600",
};

const readDismissed = () => {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
};

const MarqueeBanner = () => {
  const isAuthenticated = useSelector((state) => state.auth.isAuthenticated);
  const [items, setItems] = useState([]);
  const [dismissed, setDismissed] = useState(readDismissed);
  const timer = useRef(null);

  // The bar and the text inside it. Compared on mount and on resize so the
  // animation is only switched on for text that genuinely does not fit.
  const trackRef = useRef(null);
  const [overflow, setOverflow] = useState(0);

  const measure = useCallback((node) => {
    if (!node) return;
    trackRef.current = node;
    const extra = node.scrollWidth - node.clientWidth;
    setOverflow(extra > 8 ? extra : 0);
  }, []);

  useEffect(() => {
    const onResize = () => measure(trackRef.current);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measure]);

  useEffect(() => {
    // Nothing to fetch when signed out. State is not cleared here — rendering
    // is gated on `isAuthenticated` below instead, which avoids a set-state
    // inside the effect body and the extra render it would cost.
    if (!isAuthenticated) return undefined;

    let cancelled = false;

    const fetchMarquee = () =>
      api
        .get("/announcements/marquee")
        .then(({ data }) => {
          if (!cancelled) setItems(data?.announcements || []);
        })
        // Silent: the marquee is decoration on top of the app, and a failed
        // poll must not put an error in front of someone doing their job.
        .catch(() => {});

    fetchMarquee();
    // Slow poll — an announcement is not real-time, and every signed-in tab
    // runs this.
    timer.current = setInterval(fetchMarquee, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(timer.current);
    };
  }, [isAuthenticated]);

  const visible = isAuthenticated
    ? items.filter((item) => !dismissed.has(item._id))
    : [];
  if (!visible.length) return null;

  const dismiss = (id) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
    } catch {
      /* a full or blocked store just means it shows again next time */
    }
  };

  // One bar at a time — stacking three marquees costs more vertical space than
  // any announcement is worth. The newest is the one on screen.
  const current = visible[0];
  const tone = TONES[current.tone] || TONES.info;

  return (
    <div className={`${tone} text-white`}>
      <div className="flex items-center gap-3 px-4 py-2">
        <CampaignOutlinedIcon fontSize="small" className="shrink-0" />

        {/* The text scrolls only when it is too long to sit still. A short
            notice that slides past for no reason is harder to read, not more
            noticeable. */}
        <div ref={measure} className="flex-1 min-w-0 overflow-hidden">
          <p
            className={`text-sm font-semibold whitespace-nowrap ${
              overflow ? "marquee-scrolling" : "truncate"
            }`}
            style={
              overflow
                ? {
                    // Shift by exactly the hidden distance, at a readable pace
                    // rather than a fixed duration that races long text.
                    "--marquee-shift": `-${overflow}px`,
                    "--marquee-duration": `${Math.max(8, Math.round(overflow / 40))}s`,
                  }
                : undefined
            }
          >
            {current.title ? (
              <span className="font-extrabold">{current.title} — </span>
            ) : null}
            {current.message}
            {current.link ? (
              <a
                href={current.link}
                target="_blank"
                rel="noreferrer"
                className="ml-2 underline underline-offset-2 font-bold"
              >
                {current.linkLabel || "Open"}
              </a>
            ) : null}
          </p>
        </div>

        {visible.length > 1 ? (
          <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold">
            +{visible.length - 1}
          </span>
        ) : null}

        <button
          onClick={() => dismiss(current._id)}
          className="shrink-0 rounded p-1 hover:bg-white/20 transition-colors"
          aria-label="Dismiss announcement"
        >
          <CloseIcon style={{ fontSize: 16 }} />
        </button>
      </div>
    </div>
  );
};

export default MarqueeBanner;
