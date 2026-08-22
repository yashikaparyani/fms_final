/**
 * S Line Transport — design tokens.
 *
 * One source of truth for colour, elevation, spacing and type across the app.
 * The palette is deliberately saturated: the old muted teal/grey read as an
 * internal tool, and drivers use this in a cab, in daylight, at a glance.
 *
 * The ten keys the original theme exported (background, surface, border, text,
 * muted, primary, primaryLight, success, warning, danger) are all still here
 * under the same names, so screens not yet restyled keep rendering correctly.
 */

// ---------------------------------------------------------------------------
// Raw ramps. Reach for these when you need a specific shade; prefer `colors`
// when you are expressing intent.
// ---------------------------------------------------------------------------

export const palette = {
  navy: { 900: "#07152E", 800: "#0B1E3D", 700: "#102B57", 600: "#16386F" },
  blue: { 700: "#1544A3", 600: "#1D6FE0", 500: "#2E86F0", 100: "#DDEBFD", 50: "#EFF6FF" },
  green: { 700: "#12803C", 600: "#16A34A", 500: "#22C55E", 100: "#D6F5E0", 50: "#ECFDF3" },
  orange: { 700: "#C2410C", 600: "#EA580C", 500: "#F97316", 100: "#FFEAD5", 50: "#FFF7ED" },
  red: { 700: "#B91C1C", 600: "#DC2626", 500: "#EF4444", 100: "#FEE2E2", 50: "#FEF2F2" },
  amber: { 700: "#B45309", 600: "#D97706", 500: "#F59E0B", 100: "#FEF0C7", 50: "#FFFBEB" },
  purple: { 700: "#6D28D9", 600: "#7C3AED", 500: "#8B5CF6", 100: "#EDE4FE", 50: "#F5F3FF" },
  teal: { 700: "#0F766E", 600: "#0D9488", 500: "#14B8A6", 100: "#CCFBF1", 50: "#F0FDFA" },
  pink: { 600: "#DB2777", 500: "#EC4899", 100: "#FCE7F3" },
  slate: {
    900: "#0F172A",
    800: "#1E293B",
    700: "#334155",
    600: "#475569",
    500: "#64748B",
    400: "#94A3B8",
    300: "#CBD5E1",
    200: "#E2E8F0",
    100: "#F1F5F9",
    50: "#F8FAFC",
  },
  white: "#FFFFFF",
};

// ---------------------------------------------------------------------------
// Semantic colours. Screens use these, not the ramps.
// ---------------------------------------------------------------------------

export const colors = {
  // Surfaces
  background: "#F4F7FC",
  surface: palette.white,
  surfaceAlt: palette.slate[50],
  surfaceSunken: palette.slate[100],
  border: "#E3E9F4",
  borderStrong: palette.slate[300],

  // Type
  text: palette.slate[900],
  textSoft: palette.slate[700],
  muted: palette.slate[500],
  faint: palette.slate[400],
  onBrand: palette.white,

  // Brand
  brand: palette.navy[800],
  brandDeep: palette.navy[900],
  brandSoft: palette.navy[700],
  primary: palette.blue[600],
  primaryDark: palette.blue[700],
  primaryLight: palette.blue[100],
  primaryFaint: palette.blue[50],

  // Status
  success: palette.green[600],
  successLight: palette.green[100],
  successFaint: palette.green[50],
  warning: palette.amber[600],
  warningLight: palette.amber[100],
  warningFaint: palette.amber[50],
  danger: palette.red[600],
  dangerLight: palette.red[100],
  dangerFaint: palette.red[50],
  info: palette.teal[600],
  infoLight: palette.teal[100],
  infoFaint: palette.teal[50],

  // Category accents — the colour-coded action tiles on the dashboards.
  fuel: palette.orange[500],
  fuelLight: palette.orange[100],
  roadside: palette.red[500],
  roadsideLight: palette.red[100],
  jobs: palette.blue[600],
  jobsLight: palette.blue[100],
  parking: palette.purple[600],
  parkingLight: palette.purple[100],
  tires: palette.teal[600],
  tiresLight: palette.teal[100],
  insurance: palette.blue[500],
  insuranceLight: palette.blue[50],
  trailer: palette.pink[500],
  trailerLight: palette.pink[100],
  more: palette.slate[600],
  moreLight: palette.slate[100],
};

/**
 * Per-role accent. Each portal gets its own identity colour so a driver and a
 * dispatcher never mistake one screen for the other — the colour-coded columns
 * from the product reference, applied as theme rather than as decoration.
 */
export const roleTheme = {
  driver: {
    key: "driver",
    label: "Driver",
    tagline: "Easy tools for drivers",
    accent: palette.green[600],
    accentDark: palette.green[700],
    accentLight: palette.green[100],
    accentFaint: palette.green[50],
    headerFrom: palette.green[700],
    headerTo: palette.green[500],
  },
  fleetOwner: {
    key: "fleetOwner",
    label: "Owner-Operator",
    tagline: "Find loads and grow your business",
    accent: palette.blue[600],
    accentDark: palette.blue[700],
    accentLight: palette.blue[100],
    accentFaint: palette.blue[50],
    headerFrom: palette.navy[800],
    headerTo: palette.blue[600],
  },
  client: {
    key: "client",
    label: "Shipper",
    tagline: "Ship freight with confidence",
    accent: palette.teal[600],
    accentDark: palette.teal[700],
    accentLight: palette.teal[100],
    accentFaint: palette.teal[50],
    headerFrom: palette.teal[700],
    headerTo: palette.teal[500],
  },
  staff: {
    key: "staff",
    label: "Freight Broker",
    tagline: "Find trucks, book loads fast",
    accent: palette.red[600],
    accentDark: palette.red[700],
    accentLight: palette.red[100],
    accentFaint: palette.red[50],
    headerFrom: palette.red[700],
    headerTo: palette.orange[500],
  },
  admin: {
    key: "admin",
    label: "Administrator",
    tagline: "Manage your entire fleet",
    accent: palette.navy[800],
    accentDark: palette.navy[900],
    accentLight: palette.blue[100],
    accentFaint: palette.blue[50],
    headerFrom: palette.navy[900],
    headerTo: palette.navy[600],
  },
};

/** Falls back to the carrier theme for any role the app does not yet style. */
export const themeForRole = (role) => roleTheme[role] || roleTheme.fleetOwner;

// ---------------------------------------------------------------------------
// Elevation. `shadow` stays the default card depth for backwards compatibility.
// ---------------------------------------------------------------------------

export const shadow = {
  shadowColor: "#0B1E3D",
  shadowOpacity: 0.08,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

export const elevation = {
  none: {
    shadowColor: "transparent",
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  sm: {
    shadowColor: "#0B1E3D",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  md: shadow,
  lg: {
    shadowColor: "#0B1E3D",
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
};

/** Coloured glow used under primary CTAs so they lift off the page. */
export const glow = (color) => ({
  shadowColor: color,
  shadowOpacity: 0.32,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 5,
});

// ---------------------------------------------------------------------------
// Scale
// ---------------------------------------------------------------------------

export const radius = { xs: 6, sm: 10, md: 14, lg: 18, xl: 24, pill: 999 };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };

export const type = {
  display: { fontSize: 28, fontWeight: "800", letterSpacing: -0.4 },
  h1: { fontSize: 22, fontWeight: "800", letterSpacing: -0.2 },
  h2: { fontSize: 18, fontWeight: "800" },
  h3: { fontSize: 15, fontWeight: "700" },
  body: { fontSize: 14, fontWeight: "500" },
  label: { fontSize: 12, fontWeight: "700" },
  caption: { fontSize: 11, fontWeight: "600" },
  stat: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
};

export const brand = {
  name: "S LINE",
  nameAccent: "TRANSPORT",
  tagline: "All Roads. One Connection.",
};
