/**
 * S Line Transport — design tokens.
 *
 * One source of truth for colour, elevation, spacing and type across the app.
 * The palette is Uber's dark mode: a black canvas, grey sections on it, white
 * type and white primary buttons, deep navy as the second action colour, and
 * colour only where it carries meaning (green done, red wrong, amber waiting).
 *
 * The ten keys the original theme exported (background, surface, border, text,
 * muted, primary, primaryLight, success, warning, danger) are all still here
 * under the same names, so screens not yet restyled keep rendering correctly.
 */

// ---------------------------------------------------------------------------
// Raw ramps. Reach for these when you need a specific shade; prefer `colors`
// when you are expressing intent.
// ---------------------------------------------------------------------------

// Uber style: a white canvas, black and deep navy for brand and every action,
// flat grey fills for chips and tiles, and Uber's own green, red and amber only
// where they mean something (done, wrong, waiting). The old hue
// ramps are kept by name, pointing at the greys, so every screen that reaches
// for one follows the theme.
const mono = {
  900: "#000000",
  800: "#141414",
  700: "#333333",
  600: "#545454",
  500: "#6B6B6B",
  400: "#AFAFAF",
  300: "#CBCBCB",
  200: "#E2E2E2",
  100: "#EEEEEE",
  50: "#F3F3F3",
};
// Dark mode: an accent drawn on the black canvas is white, and its tints are
// the greys the cards are made of.
const accentRamp = { 900: "#FFFFFF", 800: "#FFFFFF", 700: "#F3F3F3", 600: "#FFFFFF", 500: "#E2E2E2", 400: "#CBCBCB", 100: "#2E2E2E", 50: "#1C1C1C" };

export const palette = {
  mono,
  navy: accentRamp,
  blue: accentRamp,
  green: { 700: "#03703C", 600: "#06C167", 500: "#06C167", 100: "#0E3B25", 50: "#0A2419" },
  orange: accentRamp,
  red: { 700: "#AB1300", 600: "#F25C4A", 500: "#E85C4A", 100: "#4A1C17", 50: "#2B100D" },
  amber: { 700: "#674D1B", 600: "#FFC043", 500: "#FFC043", 100: "#4A3A12", 50: "#2B220A" },
  purple: accentRamp,
  teal: accentRamp,
  pink: accentRamp,
  slate: mono,
  // Deep navy: the second action colour beside black — blue enough to read as
  // a different bar, quiet enough to sit with black and white.
  navyAccent: { 700: "#173C6C", 600: "#1F4E8C", 400: "#6E9BD6", 100: "#1C3355", 50: "#132338" },
  white: "#FFFFFF",
};

// ---------------------------------------------------------------------------
// Semantic colours. Screens use these, not the ramps.
// ---------------------------------------------------------------------------

// Uber dark: a black canvas, grey sections on it, white type, and a white
// primary button with black type on it.
export const colors = {
  // Surfaces
  background: "#000000",
  surface: "#1C1C1C",
  surfaceAlt: "#262626",
  surfaceSunken: "#2E2E2E",
  border: "#2C2C2C",
  borderStrong: "#3D3D3D",

  // Type
  text: "#FFFFFF",
  textSoft: "#D6D6D6",
  muted: "#A6A6A6",
  faint: "#6E6E6E",
  onBrand: palette.white,

  // Brand — the grey of a raised section (stat tiles, bars, the logo tile)
  brand: "#2A2A2A",
  brandDeep: "#1C1C1C",
  brandSoft: "#333333",
  primary: palette.white,
  onPrimary: "#000000",
  primaryDark: "#E2E2E2",
  primaryLight: "#2E2E2E",
  primaryFaint: "#1C1C1C",

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
  // Deep navy: the second action colour beside black, and "information".
  info: palette.navyAccent[600],
  // Navy as type or an icon on black — the bar shade is too dark to read.
  infoInk: palette.navyAccent[400],
  infoLight: palette.navyAccent[100],
  infoFaint: palette.navyAccent[50],

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
 * Per-role identity. Every portal shares Uber's black app bar and white
 * accent; the label and tagline tell the portals apart.
 */
export const roleTheme = {
  driver: {
    key: "driver",
    label: "Driver",
    tagline: "Easy tools for drivers",
    accent: palette.white,
    accentDark: palette.white,
    accentLight: "#2E2E2E",
    accentFaint: "#1C1C1C",
    headerFrom: "#000000",
    headerTo: "#000000",
  },
  fleetOwner: {
    key: "fleetOwner",
    label: "Owner-Operator",
    tagline: "Find loads and grow your business",
    accent: palette.white,
    accentDark: palette.white,
    accentLight: "#2E2E2E",
    accentFaint: "#1C1C1C",
    headerFrom: "#000000",
    headerTo: "#000000",
  },
  client: {
    key: "client",
    label: "Shipper",
    tagline: "Ship freight with confidence",
    accent: palette.white,
    accentDark: palette.white,
    accentLight: "#2E2E2E",
    accentFaint: "#1C1C1C",
    headerFrom: "#000000",
    headerTo: "#000000",
  },
  staff: {
    key: "staff",
    label: "Freight Broker",
    tagline: "Find trucks, book loads fast",
    accent: palette.white,
    accentDark: palette.white,
    accentLight: "#2E2E2E",
    accentFaint: "#1C1C1C",
    headerFrom: "#000000",
    headerTo: "#000000",
  },
  admin: {
    key: "admin",
    label: "Administrator",
    tagline: "Manage your entire fleet",
    accent: palette.white,
    accentDark: palette.white,
    accentLight: "#2E2E2E",
    accentFaint: "#1C1C1C",
    headerFrom: "#000000",
    headerTo: "#000000",
  },
};

/** Falls back to the carrier theme for any role the app does not yet style. */
export const themeForRole = (role) => roleTheme[role] || roleTheme.fleetOwner;

// ---------------------------------------------------------------------------
// Elevation. `shadow` stays the default card depth for backwards compatibility.
// ---------------------------------------------------------------------------

export const shadow = {
  shadowColor: "#000000",
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
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
    shadowColor: "#000000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  md: shadow,
  lg: {
    shadowColor: "#000000",
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
};

/** Soft lift under primary CTAs — Uber buttons sit flat, so this stays quiet. */
export const glow = (color) => ({
  shadowColor: color,
  shadowOpacity: 0.18,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
});

// ---------------------------------------------------------------------------
// Scale
// ---------------------------------------------------------------------------

export const radius = { xs: 6, sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };

export const type = {
  display: { fontSize: 28, fontWeight: "800", letterSpacing: -0.6 },
  h1: { fontSize: 22, fontWeight: "800", letterSpacing: -0.4 },
  h2: { fontSize: 20, fontWeight: "800" },
  h3: { fontSize: 17, fontWeight: "700" },
  body: { fontSize: 16, fontWeight: "500" },
  label: { fontSize: 14, fontWeight: "700" },
  caption: { fontSize: 13, fontWeight: "600" },
  stat: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
};

export const brand = {
  name: "S LINE",
  nameAccent: "TRANSPORT",
  tagline: "All Roads. One Connection.",
};

/**
 * Black or white, whichever reads on the given background. Used wherever a
 * component takes its fill as a prop — a white button needs black type, a navy
 * bar needs white.
 */
export const inkOn = (hex) => {
  const h = String(hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return "#FFFFFF";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? "#000000" : "#FFFFFF";
};
