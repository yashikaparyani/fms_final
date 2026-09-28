// The promo lines staff can pin on a load when scheduling its bid, and how each
// one is dressed on the carrier's bid board. Anything not in this list is a
// custom message typed by staff and gets the CUSTOM look.

export const BID_HIGHLIGHT_MAX = 60;

export const BID_HIGHLIGHT_PRESETS = [
  { text: "Premium Load",            emoji: "💎", from: "#7c3aed", via: "#db2777", to: "#f59e0b" },
  { text: "Most Rewarding",          emoji: "💰", from: "#059669", via: "#10b981", to: "#facc15" },
  { text: "Shorter Wait Time",       emoji: "⚡", from: "#0284c7", via: "#06b6d4", to: "#22d3ee" },
  { text: "Longer Wait Time",        emoji: "⏳", from: "#b45309", via: "#f59e0b", to: "#fde047" },
  { text: "Best Delivery Available", emoji: "🚚", from: "#1d4ed8", via: "#6366f1", to: "#a855f7" },
  { text: "Weekly Best Offer",       emoji: "🏆", from: "#dc2626", via: "#f97316", to: "#facc15" },
  { text: "Hot Lane",                emoji: "🔥", from: "#b91c1c", via: "#ef4444", to: "#fb923c" },
  { text: "Top Priority Load",       emoji: "⭐", from: "#9333ea", via: "#6366f1", to: "#38bdf8" },
  { text: "Quick Pay",               emoji: "💵", from: "#15803d", via: "#22c55e", to: "#a3e635" },
  { text: "Limited Time Offer",      emoji: "⏰", from: "#be123c", via: "#e11d48", to: "#f472b6" },
];

const CUSTOM_STYLE = { emoji: "✨", from: "#4f46e5", via: "#ec4899", to: "#f59e0b" };

/** The look for a stored message: the matching preset, or the custom style. */
export const highlightStyle = (text) =>
  BID_HIGHLIGHT_PRESETS.find((p) => p.text.toLowerCase() === String(text || "").trim().toLowerCase()) ||
  { text, ...CUSTOM_STYLE };
