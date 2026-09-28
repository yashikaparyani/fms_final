import { highlightStyle } from "../utils/bidHighlights";

// The promo line staff attached to a load's bid, shown to carriers as an
// animated ribbon — a moving gradient, a light sweep and a glow — so the load
// stands out on the board. Renders nothing when the load has no message.
//
// size: "sm" for table rows and dashboard lists, "lg" for the bid page banner.
const BidHighlightBadge = ({ text, size = "sm", className = "" }) => {
  if (!text || !String(text).trim()) return null;
  const { emoji, from, via, to } = highlightStyle(text);

  const sizing =
    size === "lg"
      ? "px-5 py-3 text-base md:text-lg rounded-2xl gap-3"
      : "px-2.5 py-1 text-[12px] rounded-full gap-1.5";

  return (
    <span
      className={`bid-highlight inline-flex items-center font-extrabold uppercase tracking-wide text-white ${sizing} ${className}`}
      style={{
        "--bh-from": from,
        "--bh-via": via,
        "--bh-to": to,
      }}
      title={text}
    >
      <span className={`bid-highlight-emoji ${size === "lg" ? "text-2xl" : "text-sm"}`}>
        {emoji}
      </span>
      <span className="relative z-[1] truncate">{text}</span>
    </span>
  );
};

export default BidHighlightBadge;
