/**
 * S Line Transport — design tokens.
 *
 * One source of truth for colour, elevation, spacing and type across the app.
 * The palette is black and white, Uber style: black for the brand and every
 * action, neutral greys for surfaces and secondary type, and colour only where
 * it carries meaning (green done, red wrong, amber waiting).
 *
 * The ten keys the original theme exported (background, surface, border, text,
 * muted, primary, primaryLight, success, warning, danger) are all still here
 * under the same names, so screens not yet restyled keep rendering correctly.
 */

// ---------------------------------------------------------------------------
// Raw ramps. Reach for these when you need a specific shade; prefer `colors`
// when you are expressing intent.
// ---------------------------------------------------------------------------

// Black-and-white, Uber style: black for brand and actions, neutral greys for
// everything around it. Green, red and amber stay because they mean something
// (done, wrong, waiting). The old hue ramps are kept by name, pointing at the
// greys, so every screen that reaches for one follows the theme.
const mono = {
  900: "#000000",
  800: "#141414",
  700: "#333333",
  600: "#545454",
  500: "#757575",
  400: "#AFAFAF",
  300: "#CBCBCB",
  200: "#E2E2E2",
  100: "#EEEEEE",
  50: "#F6F6F6",
};
const accentRamp = { 900: mono[900], 800: mono[900], 700: mono[900], 600: mono[900], 500: mono[800], 400: mono[700], 100: mono[200], 50: mono[50] };

export const palette = {
  mono,
  navy: accentRamp,
  blue: accentRamp,
  green: { 700: "#12803C", 600: "#16A34A", 500: "#22C55E", 100: "#D6F5E0", 50: "#ECFDF3" },
  orange: accentRamp,
  red: { 700: "#B91C1C", 600: "#DC2626", 500: "#EF4444", 100: "#FEE2E2", 50: "#FEF2F2" },
  amber: { 700: "#B45309", 600: "#D97706", 500: "#F59E0B", 100: "#FEF0C7", 50: "#FFFBEB" },
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
  background: palette.mono[50],
  surface: palette.white,
  surfaceAlt: palette.slate[50],
  surfaceSunken: palette.slate[100],
  border: "#E2E2E2",
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
    accent: palette.navy[900],
    accentDark: palette.navy[900],
    accentLight: palette.navy[100],
    accentFaint: palette.navy[50],
    headerFrom: palette.navy[900],
    headerTo: palette.mono[700],
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
    headerTo: palette.mono[700],
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
    headerTo: palette.mono[700],
  },
  // Deep indigo — the same family as admin, a clear step lighter. The two
  // back-office portals reading as related is deliberate; the red-to-orange this
  // replaced was the loudest thing on a screen people sit in front of all day,
  // and it collided with the red the app uses to mean "something is wrong".
  staff: {
    key: "staff",
    label: "Freight Broker",
    tagline: "Find trucks, book loads fast",
    accent: palette.navy[400],
    accentDark: palette.navy[600],
    accentLight: palette.navy[100],
    accentFaint: palette.navy[50],
    headerFrom: palette.navy[600],
    headerTo: palette.mono[700],
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
    headerTo: palette.mono[700],
  },
};

/** Falls back to the carrier theme for any role the app does not yet style. */
export const themeForRole = (role) => roleTheme[role] || roleTheme.fleetOwner;

// ---------------------------------------------------------------------------
// Elevation. `shadow` stays the default card depth for backwards compatibility.
// ---------------------------------------------------------------------------

export const shadow = {
  shadowColor: "#000000",
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
    shadowColor: "#000000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  md: shadow,
  lg: {
    shadowColor: "#000000",
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
