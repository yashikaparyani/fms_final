/**
 * S Line Transport — design tokens.
 *
 * One source of truth for colour, elevation, spacing and type across the app.
 * The palette is Uber style: a white canvas, black for the brand and every
 * action, flat greys for chips and secondary type, and colour only where it
 * carries meaning (green done, red wrong, amber waiting).
 *
 * The ten keys the original theme exported (background, surface, border, text,
 * muted, primary, primaryLight, success, warning, danger) are all still here
 * under the same names, so screens not yet restyled keep rendering correctly.
 */

// ---------------------------------------------------------------------------
// Raw ramps. Reach for these when you need a specific shade; prefer `colors`
// when you are expressing intent.
// ---------------------------------------------------------------------------

// Uber style: a white canvas, black and charcoal for brand and every action,
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
const accentRamp = { 900: mono[900], 800: mono[900], 700: mono[900], 600: mono[900], 500: mono[800], 400: mono[700], 100: mono[200], 50: mono[50] };

export const palette = {
  mono,
  navy: accentRamp,
  blue: accentRamp,
  green: { 700: "#03703C", 600: "#05944F", 500: "#06C167", 100: "#ADDEC9", 50: "#E6F2ED" },
  orange: accentRamp,
  red: { 700: "#AB1300", 600: "#E11900", 500: "#E85C4A", 100: "#FED7D2", 50: "#FFEFED" },
  amber: { 700: "#674D1B", 600: "#996F00", 500: "#FFC043", 100: "#FFF2D9", 50: "#FFFAF0" },
  purple: accentRamp,
  teal: accentRamp,
  pink: accentRamp,
  slate: mono,
  white: "#FFFFFF",
};

// ---------------------------------------------------------------------------
// Semantic colours. Screens use these, not the ramps.
// ---------------------------------------------------------------------------

export const colors = {
  // Surfaces
  background: palette.white,
  surface: palette.white,
  surfaceAlt: palette.slate[50],
  surfaceSunken: palette.slate[100],
  border: palette.slate[100],
  borderStrong: palette.slate[200],

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
  // Uber charcoal: the second action colour beside black, and "information".
  info: palette.mono[600],
  infoLight: palette.mono[100],
  infoFaint: palette.mono[50],

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
 * Per-role identity. Every portal shares Uber's white app bar and black
 * accent; the label and tagline tell the portals apart.
 */
export const roleTheme = {
  driver: {
    key: "driver",
    label: "Driver",
    tagline: "Easy tools for drivers",
    accent: palette.mono[900],
    accentDark: palette.mono[900],
    accentLight: palette.mono[100],
    accentFaint: palette.mono[50],
    headerFrom: palette.white,
    headerTo: palette.white,
  },
  fleetOwner: {
    key: "fleetOwner",
    label: "Owner-Operator",
    tagline: "Find loads and grow your business",
    accent: palette.mono[900],
    accentDark: palette.mono[900],
    accentLight: palette.mono[100],
    accentFaint: palette.mono[50],
    headerFrom: palette.white,
    headerTo: palette.white,
  },
  client: {
    key: "client",
    label: "Shipper",
    tagline: "Ship freight with confidence",
    accent: palette.mono[900],
    accentDark: palette.mono[900],
    accentLight: palette.mono[100],
    accentFaint: palette.mono[50],
    headerFrom: palette.white,
    headerTo: palette.white,
  },
  staff: {
    key: "staff",
    label: "Freight Broker",
    tagline: "Find trucks, book loads fast",
    accent: palette.mono[900],
    accentDark: palette.mono[900],
    accentLight: palette.mono[100],
    accentFaint: palette.mono[50],
    headerFrom: palette.white,
    headerTo: palette.white,
  },
  admin: {
    key: "admin",
    label: "Administrator",
    tagline: "Manage your entire fleet",
    accent: palette.mono[900],
    accentDark: palette.mono[900],
    accentLight: palette.mono[100],
    accentFaint: palette.mono[50],
    headerFrom: palette.white,
    headerTo: palette.white,
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
