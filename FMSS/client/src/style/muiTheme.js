import { createTheme } from "@mui/material/styles";

/**
 * The MUI half of the design system.
 *
 * Roughly half this app is MUI (dialogs, DataGrid, selects, buttons) and half
 * is Tailwind. Left alone the two drift: MUI ships its own blue, its own
 * radii and its own shadows, and the result reads as two products stitched
 * together. This theme restates the tokens from index.css in the shape MUI
 * wants, so a Button and a `.btn-primary` are the same object.
 *
 * The hex values are duplicated from index.css deliberately — MUI needs real
 * colours at theme-construction time, and `var(--…)` breaks its colour maths
 * (alpha(), contrastText). When a token changes, change it in both files.
 */

const brand = {
  900: "#07152E",
  800: "#0B1E3D",
  700: "#102B57",
  600: "#16386F",
};

const accent = {
  700: "#1544A3",
  600: "#1D6FE0",
  500: "#2E86F0",
  100: "#DDEBFD",
  50: "#EFF6FF",
};

const ink = {
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
};

const HAIRLINE = "#E3E9F4";
const CANVAS = "#F4F7FC";

const CARD_SHADOW =
  "0 1px 2px rgba(11,30,61,0.04), 0 4px 12px rgba(11,30,61,0.06)";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: accent[600],
      dark: accent[700],
      light: accent[500],
      contrastText: "#fff",
    },
    secondary: {
      main: brand[800],
      dark: brand[900],
      light: brand[600],
      contrastText: "#fff",
    },
    success: { main: "#16A34A", dark: "#12803C", light: "#22C55E", contrastText: "#fff" },
    warning: { main: "#D97706", dark: "#B45309", light: "#F59E0B", contrastText: "#fff" },
    error: { main: "#DC2626", dark: "#B91C1C", light: "#EF4444", contrastText: "#fff" },
    info: { main: "#0D9488", dark: "#0F766E", light: "#14B8A6", contrastText: "#fff" },
    grey: ink,
    background: { default: CANVAS, paper: "#FFFFFF" },
    text: { primary: ink[900], secondary: ink[500], disabled: ink[400] },
    divider: HAIRLINE,
  },

  shape: { borderRadius: 12 },

  typography: {
    fontFamily: '"Poppins", ui-sans-serif, system-ui, sans-serif',
    // The app is dense — tables, forms, dashboards. MUI's defaults are set for
    // a roomier page than this one ever is.
    fontSize: 14,
    h1: { fontWeight: 800, fontSize: "1.75rem", letterSpacing: "-0.02em" },
    h2: { fontWeight: 800, fontSize: "1.5rem", letterSpacing: "-0.015em" },
    h3: { fontWeight: 700, fontSize: "1.25rem", letterSpacing: "-0.01em" },
    h4: { fontWeight: 700, fontSize: "1.125rem" },
    h5: { fontWeight: 700, fontSize: "1rem" },
    h6: { fontWeight: 700, fontSize: "0.9375rem" },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600, fontSize: "0.8125rem" },
    body1: { fontSize: "0.875rem" },
    body2: { fontSize: "0.8125rem" },
    button: { fontWeight: 700, textTransform: "none", letterSpacing: 0 },
    caption: { fontSize: "0.75rem", fontWeight: 500 },
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: { body: { backgroundColor: CANVAS } },
    },

    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 10, paddingInline: 16, minHeight: 40 },
        // A coloured lift under filled buttons, matching the mobile CTAs.
        containedPrimary: {
          boxShadow: "0 4px 14px rgba(29,111,224,0.32)",
          "&:hover": { boxShadow: "0 6px 18px rgba(29,111,224,0.4)" },
        },
        containedSuccess: { boxShadow: "0 4px 14px rgba(22,163,74,0.3)" },
        containedError: { boxShadow: "0 4px 14px rgba(220,38,38,0.3)" },
        outlined: { borderColor: HAIRLINE, "&:hover": { borderColor: accent[600] } },
        sizeSmall: { minHeight: 32, paddingInline: 12, fontSize: "0.8125rem" },
      },
    },

    MuiPaper: {
      styleOverrides: {
        rounded: { borderRadius: 14 },
        elevation1: { boxShadow: CARD_SHADOW },
      },
    },

    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          border: `1px solid ${HAIRLINE}`,
          boxShadow: CARD_SHADOW,
        },
      },
    },

    MuiDialog: {
      styleOverrides: { paper: { borderRadius: 18 } },
    },
    MuiDialogTitle: {
      styleOverrides: { root: { fontWeight: 800, fontSize: "1.0625rem" } },
    },

    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 700, fontSize: "0.6875rem", height: 24 },
        outlined: { borderColor: HAIRLINE },
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          backgroundColor: "#fff",
          "& fieldset": { borderColor: ink[300] },
          "&:hover fieldset": { borderColor: ink[400] },
          "&.Mui-focused fieldset": { borderWidth: 2, borderColor: accent[600] },
        },
        input: { fontSize: "0.875rem" },
      },
    },

    MuiInputLabel: {
      styleOverrides: { root: { fontSize: "0.875rem", fontWeight: 600 } },
    },

    MuiTableHead: {
      styleOverrides: {
        root: {
          "& .MuiTableCell-head": {
            backgroundColor: ink[50],
            fontWeight: 700,
            color: ink[600],
            fontSize: "0.75rem",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            borderBottom: `1px solid ${HAIRLINE}`,
          },
        },
      },
    },

    MuiTableCell: {
      styleOverrides: {
        root: { borderBottomColor: HAIRLINE, fontSize: "0.8125rem" },
      },
    },

    MuiTableRow: {
      styleOverrides: {
        root: { "&:hover": { backgroundColor: accent[50] } },
      },
    },

    // The data grid is the densest surface in the app and MUI's default styling
    // fights the rest of the page hardest.
    MuiDataGrid: {
      styleOverrides: {
        root: {
          border: `1px solid ${HAIRLINE}`,
          borderRadius: 14,
          backgroundColor: "#fff",
          fontSize: "0.8125rem",
          "--DataGrid-rowBorderColor": HAIRLINE,
        },
        columnHeaders: { backgroundColor: ink[50] },
        columnHeaderTitle: {
          fontWeight: 700,
          fontSize: "0.75rem",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: ink[600],
        },
        row: { "&:hover": { backgroundColor: accent[50] } },
        footerContainer: { borderTopColor: HAIRLINE },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: brand[800],
          fontSize: "0.75rem",
          fontWeight: 600,
          borderRadius: 8,
          paddingBlock: 6,
        },
        arrow: { color: brand[800] },
      },
    },

    MuiTabs: {
      styleOverrides: {
        indicator: { height: 3, borderRadius: 3 },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: { textTransform: "none", fontWeight: 700, minHeight: 44 },
      },
    },

    MuiAlert: {
      styleOverrides: { root: { borderRadius: 12, fontWeight: 600 } },
    },

    MuiLinearProgress: {
      styleOverrides: { root: { borderRadius: 999, height: 6 } },
    },
  },
});

export default theme;
