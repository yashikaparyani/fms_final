/**
 * S Line Transport — shared UI kit.
 *
 * The building blocks every screen composes from: gradient headers, the big
 * colour-coded action tiles, stat strips, list rows and the bottom tab bar.
 * Screens should not hand-roll these shapes — when the design moves, it moves
 * here once.
 */

import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

import { colors, elevation, glow, radius, spacing, type } from "./theme";

export const ANDROID_TOP_INSET =
  Platform.OS === "android" ? RNStatusBar.currentHeight || 0 : 0;

/**
 * How far the coloured header has to clear the status bar. Android reports its
 * bar height; iOS does not without react-native-safe-area-context, and 44pt
 * clears the notch on every device the app supports.
 */
export const TOP_INSET = Platform.OS === "ios" ? 44 : ANDROID_TOP_INSET;

/**
 * Icons come from two families. Rather than make every caller remember which,
 * `<Icon name="fuel" />` resolves through one table of product-level names.
 */
const ICONS = {
  // navigation / chrome
  menu: [Ionicons, "menu"],
  back: [Ionicons, "chevron-back"],
  chevron: [Ionicons, "chevron-forward"],
  bell: [Ionicons, "notifications-outline"],
  close: [Ionicons, "close"],
  search: [Ionicons, "search"],
  filter: [Ionicons, "options-outline"],
  refresh: [Ionicons, "refresh"],
  logout: [Ionicons, "log-out-outline"],
  check: [Ionicons, "checkmark-circle"],
  warning: [Ionicons, "warning"],
  pin: [Ionicons, "location-sharp"],
  clock: [Ionicons, "time-outline"],
  calendar: [Ionicons, "calendar-outline"],
  camera: [Ionicons, "camera"],
  phone: [Ionicons, "call"],
  star: [Ionicons, "star"],
  shield: [Ionicons, "shield-checkmark"],
  eye: [Ionicons, "eye-outline"],

  // tabs
  home: [Ionicons, "home"],
  loads: [MaterialCommunityIcons, "package-variant-closed"],
  scan: [MaterialCommunityIcons, "line-scan"],
  messages: [Ionicons, "chatbubble-ellipses-outline"],
  more: [Ionicons, "ellipsis-horizontal"],
  dashboard: [MaterialCommunityIcons, "view-dashboard"],
  fleet: [MaterialCommunityIcons, "truck-multiple"],
  drivers: [Ionicons, "people"],
  profile: [Ionicons, "person-circle-outline"],
  shipments: [MaterialCommunityIcons, "cube-send"],

  // product categories
  truck: [MaterialCommunityIcons, "truck"],
  trailer: [MaterialCommunityIcons, "truck-trailer"],
  fuel: [MaterialCommunityIcons, "gas-station"],
  roadside: [MaterialCommunityIcons, "car-wrench"],
  tires: [MaterialCommunityIcons, "tire"],
  parking: [MaterialCommunityIcons, "parking"],
  jobs: [MaterialCommunityIcons, "briefcase-search"],
  insurance: [MaterialCommunityIcons, "shield-car"],
  money: [MaterialCommunityIcons, "cash-multiple"],
  doc: [Ionicons, "document-text-outline"],
  bid: [MaterialCommunityIcons, "gavel"],
  post: [MaterialCommunityIcons, "upload-outline"],
  map: [MaterialCommunityIcons, "map-marker-radius"],
  quote: [MaterialCommunityIcons, "file-document-edit-outline"],
  track: [MaterialCommunityIcons, "map-marker-path"],
  history: [MaterialCommunityIcons, "history"],
  signature: [MaterialCommunityIcons, "draw-pen"],
  licence: [MaterialCommunityIcons, "card-account-details-outline"],
};

export function Icon({ name, size = 20, color = colors.text, style }) {
  const entry = ICONS[name];
  if (!entry) return <Ionicons name="help-circle-outline" size={size} color={color} style={style} />;
  const [Family, glyph] = entry;
  return <Family name={glyph} size={size} color={color} style={style} />;
}

/* -------------------------------------------------------------------------- */
/* Headers                                                                     */
/* -------------------------------------------------------------------------- */

/** How many bands make up a gradient. At header heights the seams are invisible. */
const GRADIENT_BANDS = 28;

/** Blends two #rrggbb colours. `t` runs 0 → 1 from `a` to `b`. */
function mixHex(a, b, t) {
  const parse = (hex) => {
    const clean = String(hex).replace("#", "");
    const full =
      clean.length === 3
        ? clean
            .split("")
            .map((c) => c + c)
            .join("")
        : clean;
    const int = parseInt(full, 16);
    // eslint-disable-next-line no-bitwise
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
  };

  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const at = (x, y) => Math.round(x + (y - x) * t);
  return `rgb(${at(r1, r2)},${at(g1, g2)},${at(b1, b2)})`;
}

/**
 * The coloured band at the top of every screen. `from`/`to` come from the role
 * theme, so each portal is instantly identifiable.
 *
 * Drawn as a stack of flexed bands rather than with expo-linear-gradient. That
 * library is a native module, and the app ships its redesigns as over-the-air
 * updates — which carry JavaScript and assets but never native code. A gradient
 * built out of plain Views can go out in an OTA update; a native one would need
 * every user to install a new binary first.
 */
export function GradientHeader({ from, to, style, children }) {
  const bands = React.useMemo(
    () =>
      Array.from({ length: GRADIENT_BANDS }, (_, i) =>
        mixHex(from, to, i / (GRADIENT_BANDS - 1)),
      ),
    [from, to],
  );

  return (
    <View style={[s.gradientHeader, { backgroundColor: to }, style]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {bands.map((color, i) => (
          <View key={i} style={{ flex: 1, backgroundColor: color }} />
        ))}
      </View>
      {children}
    </View>
  );
}

/**
 * The company mark: an "SL" tile and the wordmark, the same pairing the web app
 * puts in its sidebar.
 *
 * Drawn rather than shipped as an image on purpose — it stays crisp at every
 * screen density, costs no asset download, and travels in an over-the-air
 * update like any other code. Swap in an <Image> here when there is a real
 * logo file to use.
 */
export function BrandMark({ compact = false }) {
  return (
    <View style={s.brandRow}>
      <View style={[s.brandTile, compact && s.brandTileCompact]}>
        <Text style={[s.brandTileText, compact && s.brandTileTextCompact]}>SL</Text>
      </View>
      <Text style={[s.brandWord, compact && s.brandWordCompact]}>
        S LINE <Text style={s.brandWordLight}>TRANSPORT</Text>
      </Text>
    </View>
  );
}

/**
 * Standard screen header. Renders either a greeting (home screens) or a back
 * title (detail screens), plus the bell with its unread dot.
 */
export function AppHeader({
  theme,
  eyebrow,
  title,
  subtitle,
  onBack,
  onBell,
  unread = 0,
  right,
  children,
}) {
  return (
    <GradientHeader from={theme.headerFrom} to={theme.headerTo}>
      <BrandMark />
      <View style={s.headerRow}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={12} style={s.headerIconBtn}>
            <Icon name="back" size={22} color={colors.onBrand} />
          </Pressable>
        ) : null}

        <View style={s.headerTitles}>
          {eyebrow ? <Text style={s.headerEyebrow}>{eyebrow}</Text> : null}
          <Text style={s.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={s.headerSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {right}

        {onBell ? (
          <Pressable onPress={onBell} hitSlop={12} style={s.headerIconBtn}>
            <Icon name="bell" size={22} color={colors.onBrand} />
            {unread > 0 ? (
              <View style={s.bellDot}>
                <Text style={s.bellDotText}>{unread > 9 ? "9+" : unread}</Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
      </View>

      {children}
    </GradientHeader>
  );
}

/** Pill that sits in a header — "On Duty", "3 Active", a location. */
export function HeaderChip({ icon, label, tone = "light" }) {
  const dark = tone === "dark";
  return (
    <View style={[s.headerChip, dark && { backgroundColor: "rgba(0,0,0,0.22)" }]}>
      {icon ? <Icon name={icon} size={13} color={colors.onBrand} /> : null}
      <Text style={s.headerChipText}>{label}</Text>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Cards and actions                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The full-width primary call to action — "FIND LOADS / Search & Book Loads".
 * Solid and coloured, with a glow so it reads as the one thing to tap.
 */
export function BigAction({
  icon,
  title,
  subtitle,
  color = colors.primary,
  onPress,
  disabled,
  style,
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.bigAction,
        { backgroundColor: color },
        glow(color),
        pressed && s.pressed,
        disabled && s.disabled,
        style,
      ]}
    >
      <View style={s.bigActionIcon}>
        <Icon name={icon} size={22} color={colors.onBrand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.bigActionTitle}>{title}</Text>
        {subtitle ? <Text style={s.bigActionSubtitle}>{subtitle}</Text> : null}
      </View>
      <Icon name="chevron" size={18} color="rgba(255,255,255,0.85)" />
    </Pressable>
  );
}

/**
 * A colour-coded square in the action grid. The icon sits in a tinted chip and
 * the tile itself stays white, which keeps a six-tile grid readable where six
 * saturated blocks would not be.
 */
export function ActionTile({ icon, title, subtitle, color = colors.primary, tint, onPress, badge }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.tile, pressed && s.pressed]}
    >
      <View style={[s.tileIcon, { backgroundColor: tint || withAlpha(color, 0.12) }]}>
        <Icon name={icon} size={20} color={color} />
      </View>
      <Text style={s.tileTitle} numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={s.tileSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
      {badge ? (
        <View style={[s.tileBadge, { backgroundColor: color }]}>
          <Text style={s.tileBadgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Lays tiles out `columns`-up with even gutters. */
export function TileGrid({ children, columns = 3 }) {
  const items = React.Children.toArray(children);
  return (
    <View style={s.tileGrid}>
      {items.map((child, i) => (
        <View key={i} style={{ width: `${100 / columns}%`, padding: spacing.xs }}>
          {child}
        </View>
      ))}
    </View>
  );
}

/** Row of headline numbers — "165 Total Trucks | 68 Available | 74 On Load". */
export function StatStrip({ stats, tone = "light" }) {
  const dark = tone === "dark";
  return (
    <View style={[s.statStrip, dark && { backgroundColor: "transparent" }]}>
      {stats.map((stat, i) => (
        <View
          key={stat.label}
          style={[
            s.statBox,
            dark && s.statBoxDark,
            i < stats.length - 1 && !dark && s.statDivider,
          ]}
        >
          <Text style={[s.statValue, dark && { color: colors.onBrand }, stat.color && { color: stat.color }]}>
            {stat.value}
          </Text>
          <Text style={[s.statLabel, dark && { color: "rgba(255,255,255,0.75)" }]} numberOfLines={1}>
            {stat.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** White rounded container with an optional title and trailing action. */
export function SectionCard({ title, actionLabel, onAction, style, children, padded = true }) {
  return (
    <View style={[s.sectionCard, style]}>
      {title ? (
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>{title}</Text>
          {onAction ? (
            <Pressable onPress={onAction} hitSlop={8}>
              <Text style={s.sectionAction}>{actionLabel || "View all"}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View style={padded ? s.sectionBody : null}>{children}</View>
    </View>
  );
}

/**
 * Icon + title + subtitle + trailing control. Used for incoming requests,
 * matching trucks, recent orders — anything that is a scannable list.
 */
export function ListRow({
  icon,
  iconColor = colors.primary,
  title,
  subtitle,
  meta,
  actionLabel,
  actionColor,
  onAction,
  onPress,
  last,
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.listRow, !last && s.listRowDivider, pressed && onPress && s.pressed]}
    >
      {icon ? (
        <View style={[s.listIcon, { backgroundColor: withAlpha(iconColor, 0.12) }]}>
          <Icon name={icon} size={18} color={iconColor} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={s.listTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={s.listSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? <Text style={s.listMeta}>{meta}</Text> : null}
      </View>
      {onAction ? (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => [
            s.listAction,
            { backgroundColor: actionColor || colors.success },
            pressed && s.pressed,
          ]}
        >
          <Text style={s.listActionText}>{actionLabel}</Text>
        </Pressable>
      ) : onPress ? (
        <Icon name="chevron" size={16} color={colors.faint} />
      ) : null}
    </Pressable>
  );
}

/** Small status pill. */
export function Tag({ label, color = colors.primary, solid }) {
  return (
    <View
      style={[
        s.tag,
        solid ? { backgroundColor: color } : { backgroundColor: withAlpha(color, 0.12) },
      ]}
    >
      <Text style={[s.tagText, { color: solid ? colors.onBrand : color }]}>{label}</Text>
    </View>
  );
}

export function EmptyState({ icon = "loads", title, subtitle, action }) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <Icon name={icon} size={28} color={colors.faint} />
      </View>
      <Text style={s.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={s.emptySubtitle}>{subtitle}</Text> : null}
      {action}
    </View>
  );
}

export function Loader({ label }) {
  return (
    <View style={s.loader}>
      <ActivityIndicator color={colors.primary} />
      {label ? <Text style={s.loaderText}>{label}</Text> : null}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Bottom tab bar                                                              */
/* -------------------------------------------------------------------------- */

export function BottomTabs({ tabs, active, onChange, accent = colors.primary }) {
  return (
    <View style={s.tabBar}>
      {tabs.map((tab) => {
        const on = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={s.tabItem}
            hitSlop={6}
          >
            <View>
              <Icon name={tab.icon} size={22} color={on ? accent : colors.faint} />
              {tab.badge ? (
                <View style={s.tabBadge}>
                  <Text style={s.tabBadgeText}>{tab.badge > 9 ? "9+" : tab.badge}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[s.tabLabel, on && { color: accent, fontWeight: "800" }]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Scrolling body with the padding every screen wants. */
export function Body({ children, style, ...rest }) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[s.body, style]}
      showsVerticalScrollIndicator={false}
      {...rest}
    >
      {children}
    </ScrollView>
  );
}

/* -------------------------------------------------------------------------- */

/** #RRGGBB → rgba(). Used for the 12%-opacity icon chips. */
export function withAlpha(hex, alpha) {
  const clean = String(hex).replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const int = parseInt(full, 16);
  if (Number.isNaN(int)) return `rgba(29,111,224,${alpha})`;
  // eslint-disable-next-line no-bitwise
  return `rgba(${(int >> 16) & 255},${(int >> 8) & 255},${int & 255},${alpha})`;
}

const s = StyleSheet.create({
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  brandTile: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    // Reads as a tile on the gradient without a second colour to maintain.
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  brandTileCompact: { width: 22, height: 22, borderRadius: 6 },
  brandTileText: {
    color: colors.onBrand,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  brandTileTextCompact: { fontSize: 10 },
  brandWord: {
    color: colors.onBrand,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  brandWordCompact: { fontSize: 11, letterSpacing: 1 },
  // The second word sits back so the eye lands on "S LINE".
  brandWordLight: { fontWeight: "600", opacity: 0.75 },
  gradientHeader: {
    paddingTop: TOP_INSET + spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    // The gradient bands are absolutely positioned children; without this they
    // paint over the rounded bottom corners.
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 44,
  },
  headerTitles: { flex: 1 },
  headerEyebrow: {
    ...type.caption,
    color: "rgba(255,255,255,0.78)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  headerTitle: { ...type.h1, color: colors.onBrand },
  headerSubtitle: {
    ...type.caption,
    color: "rgba(255,255,255,0.82)",
    marginTop: 2,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  bellDot: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.onBrand,
  },
  bellDotText: { color: colors.onBrand, fontSize: 9, fontWeight: "800" },
  headerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  headerChipText: { ...type.caption, color: colors.onBrand },

  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },

  bigAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  bigActionIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  bigActionTitle: {
    ...type.h3,
    fontSize: 16,
    color: colors.onBrand,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  bigActionSubtitle: {
    ...type.caption,
    color: "rgba(255,255,255,0.85)",
    marginTop: 2,
    textTransform: "none",
  },

  tileGrid: { flexDirection: "row", flexWrap: "wrap", margin: -spacing.xs },
  tile: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 92,
    gap: 6,
    ...elevation.sm,
  },
  tileIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  tileTitle: { ...type.label, color: colors.text },
  tileSubtitle: { ...type.caption, color: colors.muted, fontWeight: "500" },
  tileBadge: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    minWidth: 18,
    paddingHorizontal: 5,
    height: 18,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  tileBadgeText: { color: colors.onBrand, fontSize: 10, fontWeight: "800" },

  statStrip: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...elevation.sm,
  },
  statBox: { flex: 1, alignItems: "center", paddingVertical: spacing.md, paddingHorizontal: 4 },
  statBoxDark: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: radius.sm,
    marginHorizontal: 3,
  },
  statDivider: { borderRightWidth: 1, borderRightColor: colors.border },
  statValue: { ...type.stat, color: colors.text },
  statLabel: { ...type.caption, color: colors.muted, marginTop: 2, fontWeight: "500" },

  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...elevation.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  sectionTitle: { ...type.h3, color: colors.text },
  sectionAction: { ...type.caption, color: colors.primary },
  sectionBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm },

  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  listRowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  listIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  listTitle: { ...type.h3, fontSize: 14, color: colors.text },
  listSubtitle: { ...type.caption, color: colors.muted, marginTop: 2, fontWeight: "500" },
  listMeta: { ...type.caption, color: colors.faint, marginTop: 1, fontWeight: "500" },
  listAction: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.sm,
  },
  listActionText: { ...type.caption, color: colors.onBrand },

  tag: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  tagText: { ...type.caption, fontSize: 10.5 },

  empty: { alignItems: "center", padding: spacing.xxl, gap: spacing.sm },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSunken,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { ...type.h3, color: colors.textSoft, marginTop: spacing.xs },
  emptySubtitle: { ...type.caption, color: colors.muted, textAlign: "center", fontWeight: "500" },

  loader: { padding: spacing.xxl, alignItems: "center", gap: spacing.sm },
  loaderText: { ...type.caption, color: colors.muted, fontWeight: "500" },

  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    paddingBottom: Platform.OS === "ios" ? spacing.xl : spacing.sm,
    ...elevation.lg,
  },
  tabItem: { flex: 1, alignItems: "center", gap: 3 },
  tabLabel: { fontSize: 10.5, fontWeight: "600", color: colors.faint },
  tabBadge: {
    position: "absolute",
    top: -3,
    right: -8,
    minWidth: 15,
    height: 15,
    paddingHorizontal: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBadgeText: { color: colors.onBrand, fontSize: 8.5, fontWeight: "800" },

  pressed: { opacity: 0.75, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.5 },
});
