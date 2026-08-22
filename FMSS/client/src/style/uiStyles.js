/**
 * Tailwind class strings shared across pages.
 *
 * A page composes these rather than spelling out utilities, which is what lets
 * the whole app change theme from this file plus style/global.css. Colours here
 * come from the tokens in style/tokens.css.
 */
export const uiStyles = {
  // Layout
  page: "space-y-6",
  card: "bg-surface rounded-card shadow-card p-6 border border-hairline",
  cardHover:
    "bg-surface rounded-card shadow-card p-6 border border-hairline transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5",
  cardHeader: "flex items-center justify-between mb-4",
  weekleyGrid:
    "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-2 mt-6 break-words lg:whitespace-nowrap",
  quickActionGrid: "grid grid-cols-2 gap-6 mt-3",
  grid4: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6",
  grid2: "grid grid-cols-1 lg:grid-cols-2 gap-6",

  // The coloured band at the top of a dashboard, matching the mobile headers.
  pageHeader:
    "role-gradient rounded-card px-6 py-5 text-white shadow-card flex items-center justify-between gap-4 flex-wrap",
  pageHeaderTitle: "text-xl font-extrabold tracking-tight",
  pageHeaderSubtitle: "text-xs font-medium text-white/75 mt-0.5",

  // Inputs
  input:
    "w-full px-3 py-2 border border-ink-300 rounded-lg text-sm bg-surface placeholder:text-ink-400 transition-colors focus:outline-none focus:ring-2 focus:ring-accent-600/30 focus:border-accent-600",

  inputError: "border-bad-500 focus:ring-bad-500/30 focus:border-bad-500",

  select:
    "w-full px-3 py-2 border border-ink-300 rounded-lg text-sm bg-surface transition-colors focus:outline-none focus:ring-2 focus:ring-accent-600/30 focus:border-accent-600",

  textarea:
    "w-full px-3 py-2 border border-ink-300 rounded-lg text-sm bg-surface placeholder:text-ink-400 transition-colors focus:outline-none focus:ring-2 focus:ring-accent-600/30 focus:border-accent-600",

  label: "block text-sm font-semibold text-ink-700 mb-1.5",

  // Table/List items
  listItem:
    "flex items-center justify-between p-3 bg-ink-50 rounded-lg border border-transparent transition-colors hover:bg-accent-50 hover:border-accent-100",

  // Flex helpers
  flexBetween: "flex items-center justify-between",
  flexCenter: "flex items-center justify-center",

  // Text
  title: "text-lg font-bold text-ink-800",
  subtitle: "text-sm text-ink-500",

  // Status colours (map-based)
  statusColor: {
    green: "text-good-600",
    red: "text-bad-600",
    yellow: "text-warn-600",
    blue: "text-accent-600",
    purple: "text-grape-600",
    orange: "text-fuel-600",
    teal: "text-aqua-600",
    gray: "text-ink-500",
  },

  // Tinted status backgrounds, for the same set of tones.
  statusTint: {
    green: "bg-good-50 text-good-700 border-good-100",
    red: "bg-bad-50 text-bad-700 border-bad-100",
    yellow: "bg-warn-50 text-warn-700 border-warn-100",
    blue: "bg-accent-50 text-accent-700 border-accent-100",
    purple: "bg-grape-100/50 text-grape-600 border-grape-100",
    orange: "bg-fuel-100/50 text-fuel-600 border-fuel-100",
    teal: "bg-aqua-100/50 text-aqua-600 border-aqua-100",
    gray: "bg-ink-50 text-ink-600 border-ink-200",
  },
};
