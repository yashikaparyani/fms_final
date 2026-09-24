import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as DocumentPicker from "expo-document-picker";
import * as Updates from "expo-updates";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Signature from "react-native-signature-canvas";

import api, {
  API_BASE_URL,
  TOKEN_KEY,
  clearSession,
  getStoredSession,
  saveSession,
} from "./src/api";
import {
  brand,
  colors,
  elevation,
  glow,
  radius,
  shadow,
  spacing,
  themeForRole,
  type as typeScale,
} from "./src/theme";
import {
  TOP_INSET as UI_TOP_INSET,
  AppHeader,
  BrandMark,
  BottomTabs,
  GradientHeader,
  Icon,
  LiveBadge,
  Loader,
} from "./src/ui";
import { homeForRole } from "./src/dashboards";
import {
  listenForNotificationTaps,
  registerForPush,
  unregisterFromPush,
} from "./src/push";

// The four portals the app ships. Everything else — the service-marketplace
// roles in the product design — has no backend yet and is deliberately not
// offered a sign-in it could not fulfil.
const MOBILE_ROLES = ["driver", "fleetOwner", "client", "staff", "admin"];

const LOCATION_TASK = "fmss-live-location";
const ACTIVE_TRACKING_LOAD_KEY = "fmss_active_tracking_load";
const LOCATION_UPDATE_INTERVAL_MS = 2000;
const LOCATION_DISTANCE_INTERVAL_METERS = 5;

const statusOptions = [
  "PICKED_UP",
  "IN_TRANSIT",
  "REACHED_DESTINATION",
  "DELIVERED",
  "DRIVER_ON_WAITING",
  "DROP_IN_WAREHOUSE",
  "STREET_TURN",
  "EMPTY_IN_YARD",
  "LOADED_IN_YARD",
  "TERMINATED",
];

// Terminal statuses that mean the load is "over" — it moves out of the
// Assigned tab and into the Over tab.
// What the figure on a card means right now. Without this a carrier cannot
// tell a rate the load was posted at from the amount they actually won it for
// — the same slot on the card holds both at different points.
const PAYOUT_LABEL = {
  AWARDED: "awarded",
  NEGOTIATING: "offered",
  BID: "your bid",
  LEG_RATE: "your leg",
  OFFERED: "posted",
};

// Kept in step with COMPLETED_TRANSPORT_STATUSES in
// server/controllers/loadController.js — the web Over tab and this one have to
// agree about which loads a carrier has finished with.
// Setting one of these hands the load off for good: it leaves the carrier's
// board entirely rather than moving to Over. Kept in step with
// CARRIER_HIDDEN_TRANSPORT_STATUSES in server/utils/carrierAccount.js — the
// server is what actually stops returning them; this list only decides whether
// the driver is warned first.
const REMOVES_FROM_BOARD = ["INVOICED", "DROP_IN_WAREHOUSE", "TERMINATED"];

// What the carrier has finished driving. Deliberately NOT the list the web Over
// tab uses: that one is the office's archive of every load that stopped moving,
// this one answers a driver asking whether anything is left for them to do.
//
//   PAPERWORK_PENDING is here — the driving is done, only documents remain.
//   LOADED_IN_YARD is not — the box is loaded and still has to be taken
//   somewhere, which is work, so it stays under Assigned.
//
// TERMINATED and DROP_IN_WAREHOUSE are in neither: the server stops returning
// those to a carrier at all — see CARRIER_HIDDEN_TRANSPORT_STATUSES.
// ── When a load stops being the carrier's ────────────────────────────────────
// Mirrors CARRIER_FINISHED_STATUSES in server/config/transportStatuses.js, and
// must stay in step with it: the Assigned tile's count comes from the server
// using that list, and this filters the list underneath it.
//
// PAPERWORK_PENDING used to be in here, which was the bug. It sits mid-journey,
// so moving a load into it made the load vanish from Assigned without arriving
// in Completed — and the tile still counted it in neither. A load is the
// carrier's until it is delivered (or the trip ends some other way); paperwork
// is not the end of the trip.
const completedStatuses = [
  "DELIVERED",
  "TERMINATED",
  "STREET_TURN",
  "EMPTY_IN_YARD",
  "LOADED_IN_YARD",
  "DROP_IN_WAREHOUSE",
  "INVOICED",
];

// Forward-only progression order. A stage already reached can't be redone,
// except PICKED_UP on a multi-origin load (one pickup per origin).
const MAIN_ORDER = [
  "ASSIGNED",
  "READY_TO_PICKUP",
  "PICKED_UP",
  "IN_TRANSIT",
  "REACHED_DESTINATION",
  "DELIVERED",
];

// ─── Status colour maps (mirrors the web StatusChip so every status the web
// shows is displayed with the same colour on mobile) ────────────────────────
const TRANSPORT_STATUS_COLOR = {
  LOAD_PLANNER: { bg: "#EEEEEE", color: "#000000", border: "#CBCBCB" },
  NEW_LOAD: { bg: "#E2E2E2", color: "#000000", border: "#CBCBCB" },
  ASSIGNED: { bg: "#dcfce7", color: "#15803d", border: "#bbf7d0" },
  READY_TO_PICKUP: { bg: "#EEEEEE", color: "#000000", border: "#CBCBCB" },
  PICKED_UP: { bg: "#E2E2E2", color: "#000000", border: "#CBCBCB" },
  IN_TRANSIT: { bg: "#fef9c3", color: "#a16207", border: "#fde047" },
  REACHED_DESTINATION: { bg: "#dcfce7", color: "#15803d", border: "#bbf7d0" },
  DELIVERED: { bg: "#dcfce7", color: "#15803d", border: "#bbf7d0" },
  TERMINATED: { bg: "#fee2e2", color: "#dc2626", border: "#fca5a5" },
  PAPERWORK_PENDING: { bg: "#fef9c3", color: "#a16207", border: "#fde047" },
  INVOICED: { bg: "#EEEEEE", color: "#000000", border: "#CBCBCB" },
  STREET_TURN: { bg: "#f0fdf4", color: "#166534", border: "#bbf7d0" },
  EMPTY_IN_YARD: { bg: "#F4F4F4", color: "#767676", border: "#E8E8E8" },
  LOADED_IN_YARD: { bg: "#F6F6F6", color: "#000000", border: "#CBCBCB" },
  DRIVER_ON_WAITING: { bg: "#EEEEEE", color: "#000000", border: "#CBCBCB" },
  DROP_IN_WAREHOUSE: { bg: "#F6F6F6", color: "#000000", border: "#CBCBCB" },
};

const LOAD_STATUS_COLOR = {
  DRAFT: { bg: "#F4F4F4", color: "#767676", border: "#E8E8E8" },
  PENDING_VERIFICATION: { bg: "#fef9c3", color: "#a16207", border: "#fde047" },
  REQUIRES_CHANGES: { bg: "#fee2e2", color: "#dc2626", border: "#fca5a5" },
  VERIFIED: { bg: "#dcfce7", color: "#15803d", border: "#bbf7d0" },
  ASSIGNED: { bg: "#dcfce7", color: "#15803d", border: "#bbf7d0" },
  REJECTED: { bg: "#fee2e2", color: "#dc2626", border: "#fca5a5" },
};

const BID_STATUS_COLOR = {
  UPCOMING: { bg: "#EEEEEE", color: "#000000", border: "#CBCBCB" },
  OPEN: { bg: "#dcfce7", color: "#15803d", border: "#bbf7d0" },
  CLOSED: { bg: "#F4F4F4", color: "#767676", border: "#E8E8E8" },
};

const STATUS_FALLBACK = { bg: "#F4F4F4", color: "#767676", border: "#E8E8E8" };

const uploadableDocumentTypes = [
  // Beside the generated POD: a consignee's own stamped copy.
  "Additional POD",
  "Bill Of Lading",
  "Scale Ticket",
  "Lumper Receipt",
  "Carrier Invoice",
  "Misc.",
];

const POD_DOCUMENT_TYPE = "Proof of Delivery";

// Office-side paperwork the driver has no business seeing. Filtered out of
// every document list in this app; it is never in uploadableDocumentTypes
// either, so a driver can neither view nor upload one.
const DRIVER_HIDDEN_DOCUMENT_TYPES = new Set(["Load Document"]);

const visibleToDriver = (documents = []) =>
  documents.filter((doc) => !DRIVER_HIDDEN_DOCUMENT_TYPES.has(doc?.documentType));

const getCleanDocumentPath = (filePath) => {
  if (!filePath) return null;
  const normalized = String(filePath).replace(/\\/g, "/");
  return normalized.includes("uploads")
    ? normalized.substring(normalized.indexOf("uploads"))
    : normalized;
};

const getDocumentUrl = (filePath) => {
  const cleanPath = getCleanDocumentPath(filePath);
  if (!cleanPath) return null;
  return `${API_BASE_URL.replace(/\/api\/?$/, "")}/${cleanPath}`;
};

const DocumentChip = ({ label, tone = "default" }) => {
  const palette = {
    default: { backgroundColor: "#EEEEEE", color: colors.muted, borderColor: "#E2E2E2" },
    success: { backgroundColor: "#dcfce7", color: colors.success, borderColor: "#bbf7d0" },
    warning: { backgroundColor: "#fef3c7", color: colors.warning, borderColor: "#fde68a" },
    muted: { backgroundColor: "#F6F6F6", color: "#787878", borderColor: "#E2E2E2" },
  };
  const style = palette[tone] || palette.default;

  return (
    <Text style={[styles.docChip, { backgroundColor: style.backgroundColor, color: style.color, borderColor: style.borderColor }]}>
      {label}
    </Text>
  );
};

const DocumentCard = ({
  title,
  document,
  isPOD = false,
  isDelivered = false,
  // Set once the office has approved this load's paperwork. The server refuses
  // the upload from that point either way — this stops the button offering an
  // action that is going to come back as an error.
  locked = false,
  onUpload,
  onCamera,
  onView,
}) => {
  const uploaded = Boolean(document);
  const fileLabel = document?.fileName || (isPOD ? (isDelivered ? "Auto-generated when delivered" : "Auto-generated after delivery") : "No file uploaded");

  return (
    <View style={[styles.documentCard, uploaded && styles.documentCardUploaded]}>
      <View style={styles.documentCardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.documentTitle}>{title}</Text>
          <Text style={styles.documentSubtitle}>{fileLabel}</Text>
        </View>
        <DocumentChip label={uploaded ? "Uploaded" : isPOD ? "Auto-generated" : "Missing"} tone={uploaded ? "success" : isPOD ? "warning" : "default"} />
      </View>

      <View style={styles.documentActions}>
        <Pressable
          disabled={!uploaded}
          onPress={onView}
          style={[styles.documentActionButton, !uploaded && styles.documentActionButtonDisabled]}
        >
          <Text style={[styles.documentActionText, !uploaded && styles.documentActionTextDisabled]}>View</Text>
        </Pressable>

        {!isPOD && (
          <Pressable
            onPress={onUpload}
            style={[styles.documentUploadButton, locked && styles.documentUploadButtonLocked]}
            disabled={locked}
          >
            <Text
              style={[styles.documentUploadText, locked && styles.documentUploadTextLocked]}
            >
              {locked ? "Locked" : uploaded ? "Replace" : "Upload"}
            </Text>
          </Pressable>
        )}

        {/* Paperwork is usually a sheet of paper in the cab — photographing it
            is quicker than finding a file. */}
        {!isPOD && onCamera && !locked && (
          <Pressable onPress={onCamera} style={styles.documentCameraButton}>
            <Icon name="camera" size={16} color="#fff" />
            <Text style={styles.documentCameraText}>Camera</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

// ─── What the office is waiting on ───────────────────────────────────────────
// The driver's view of the paperwork review. The wording of a change request
// is the whole point of showing it: "changes requested" with the reason left
// on the office's screen is how a document goes round the loop four times over
// a photo nobody explained.
//
// Renders nothing until a review has actually started, so it stays off every
// load that is still being driven.
const PAPERWORK_BANNER = {
  AWAITING_DOCUMENTS: {
    title: "Paperwork needed",
    tone: { bg: "#fef9c3", border: "#fde047", color: "#a16207" },
    body: "This load has been delivered. Upload its documents below to send them to the office.",
  },
  IN_REVIEW: {
    title: "With the office",
    tone: { bg: "#EEEEEE", border: "#CBCBCB", color: "#000000" },
    body: "Your documents are being checked. Nothing more is needed unless the office asks for a change.",
  },
  CHANGES_REQUESTED: {
    title: "Changes requested",
    tone: { bg: "#fee2e2", border: "#fca5a5", color: "#b91c1c" },
    body: null, // the office's own words are used instead
  },
  APPROVED: {
    title: "Approved",
    tone: { bg: "#dcfce7", border: "#bbf7d0", color: "#15803d" },
    body: "The office has approved this load's paperwork. Its documents are locked and can no longer be changed.",
  },
};

const PaperworkBanner = ({ paperwork }) => {
  const meta = PAPERWORK_BANNER[paperwork?.state];
  if (!meta) return null;

  const body =
    paperwork.state === "CHANGES_REQUESTED"
      ? paperwork.changesNote || "The office needs a document corrected."
      : meta.body;

  return (
    <View
      style={[
        styles.paperworkBanner,
        { backgroundColor: meta.tone.bg, borderColor: meta.tone.border },
      ]}
    >
      <Text style={[styles.paperworkBannerTitle, { color: meta.tone.color }]}>
        {meta.title}
      </Text>
      <Text style={styles.paperworkBannerBody}>{body}</Text>
      {paperwork.state === "CHANGES_REQUESTED" && (
        <Text style={styles.paperworkBannerHint}>
          Upload the corrected document below — it goes straight back to the office.
        </Text>
      )}
    </View>
  );
};

const labelize = (value) =>
  value ? value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "-";

const money = (value) =>
  value || value === 0 ? `$ ${Number(value).toLocaleString()}` : "-";

// ─── Dates ────────────────────────────────────────────────────────────────────
// Mirrors server/utils/dates.js and client/src/utils/dates.js. The distinction
// matters more here than anywhere else, because a driver's phone is set to
// whatever timezone they are standing in.
//
// A CALENDAR DATE — a pickup date, a due date — is stored at UTC midnight and
// read back in UTC, so it says the same day on a phone in Newark, a phone in
// Los Angeles and the invoice the office printed. Read in the device's own zone
// it moves: UTC midnight on the 15th is 8pm on the 14th in New York.
//
// An INSTANT — createdAt, a status change — is shown on the US business clock,
// so a driver and a dispatcher discussing "the 3:42 update" mean the same
// moment.
const BUSINESS_TIME_ZONE = "America/New_York";

const fmtDate = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const fmtDateTime = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleString("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
};

const toLocationPayload = (position) => ({
  latitude: position.coords.latitude,
  longitude: position.coords.longitude,
  accuracy: position.coords.accuracy,
  altitude: position.coords.altitude,
  heading: position.coords.heading,
  speed: position.coords.speed,
  recordedAt: new Date(position.timestamp || Date.now()).toISOString(),
  source: "mobile",
  platform: Platform.OS,
});

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const locations = data?.locations || [];
  if (!locations.length) return;

  const [[, token], [, loadId]] = await AsyncStorage.multiGet([
    TOKEN_KEY,
    ACTIVE_TRACKING_LOAD_KEY,
  ]);

  if (!token || !loadId) return;

  for (const location of locations) {
    await fetch(`${API_BASE_URL}/tracking/${encodeURIComponent(loadId)}/location`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(toLocationPayload(location)),
    }).catch(() => null);
  }
});

const fileNameFromUri = (uri, fallback) => {
  const name = uri?.split("/").pop();
  return name || fallback;
};

const assetToFile = (asset, fallbackName) => ({
  uri: asset.uri,
  name: asset.name || asset.fileName || fileNameFromUri(asset.uri, fallbackName),
  type: asset.mimeType || asset.type || "image/jpeg",
});

function Pill({ children, tone = "default" }) {
  const toneStyle = {
    default: { backgroundColor: "#EEEEEE", color: colors.muted },
    success: { backgroundColor: "#dcfce7", color: colors.success },
    warning: { backgroundColor: "#fef3c7", color: colors.warning },
    danger: { backgroundColor: "#fee2e2", color: colors.danger },
  }[tone];

  return (
    <Text style={[styles.pill, { backgroundColor: toneStyle.backgroundColor, color: toneStyle.color }]}>
      {children}
    </Text>
  );
}

// Colour-coded status badge that supports every status the web shows.
function StatusChip({ value, map = TRANSPORT_STATUS_COLOR, style }) {
  const s = map[value] || STATUS_FALLBACK;
  return (
    <View
      style={[styles.statusChip, { backgroundColor: s.bg, borderColor: s.border }, style]}
    >
      <Text style={[styles.statusChipText, { color: s.color }]} numberOfLines={1}>
        {(value || "—").replace(/_/g, " ")}
      </Text>
    </View>
  );
}

function PrimaryButton({ title, onPress, disabled, tone = "primary", style }) {
  const backgroundColor =
    tone === "danger" ? colors.danger : tone === "success" ? colors.success : colors.primary;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor, opacity: disabled ? 0.55 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}

function SecondaryButton({ title, onPress, disabled, style }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.secondaryButton,
        { opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      <Text style={styles.secondaryButtonText} numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  );
}

function Field({ label, value, onChangeText, secureTextEntry, keyboardType, placeholder }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        placeholder={placeholder}
        autoCapitalize="none"
        style={styles.input}
        placeholderTextColor="#A5A5A5"
      />
    </View>
  );
}

// ─── Carrier self-registration ───────────────────────────────────────────────
// The same request the web "Create an account" page files (POST /api/signups):
// it does not create an account or sign anybody in. The office reviews it on
// the Registrations screen, and approval is what mints the login and emails the
// password. Carriers only here — this app is where carriers and drivers work.
// ─────────────────────────────────────────────────────────────────────────────
const REGISTER_FIELDS = [
  { key: "carrierName", label: "Carrier / company name", required: true, placeholder: "S Line Carriers LLC", caps: "words" },
  { key: "mcLicense", label: "MC number", placeholder: "MC-123456", caps: "characters" },
  { key: "dotLicense", label: "DOT number", placeholder: "DOT-7654321", caps: "characters" },
  { key: "email", label: "Email", required: true, placeholder: "you@example.com", keyboardType: "email-address" },
  { key: "phone", label: "Phone", required: true, placeholder: "(555) 010-2030", keyboardType: "phone-pad" },
  { key: "street", label: "Street", placeholder: "1200 Commerce St", caps: "words" },
  { key: "city", label: "City", placeholder: "Dallas", caps: "words" },
  { key: "state", label: "State", placeholder: "TX", caps: "characters" },
  { key: "zip", label: "ZIP", placeholder: "75201", keyboardType: "number-pad" },
];

function RegisterCarrierScreen({ onBack }) {
  const [form, setForm] = useState({ note: "", locationId: "" });
  const [errors, setErrors] = useState({});
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const scrollRef = useRef(null);
  const offsets = useRef({});

  useEffect(() => {
    api
      .get("/branches/public")
      .then((res) => setLocations(Array.isArray(res.data) ? res.data : []))
      .catch(() => setLocations([]));
  }, []);

  const set = (key) => (value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
  };

  const submit = async () => {
    // Missing required fields are marked in place and the form scrolls to the
    // first one, rather than listing them in a popup.
    const problems = {};
    REGISTER_FIELDS.forEach((f) => {
      if (f.required && !String(form[f.key] || "").trim()) problems[f.key] = "Please fill this field";
    });
    const email = String(form.email || "").trim();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) problems.email = "Enter a valid email";
    if (locations.length > 1 && !form.locationId) problems.locationId = "Choose your location";

    const first = [...REGISTER_FIELDS.map((f) => f.key), "locationId"].find((k) => problems[k]);
    if (first) {
      setErrors(problems);
      const y = offsets.current[first];
      if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 20), animated: true });
      return;
    }

    try {
      setLoading(true);
      await api.post("/signups", {
        ...form,
        email,
        role: "fleetOwner",
        locationId: form.locationId || undefined,
      });
      setDone(true);
    } catch (error) {
      Alert.alert(
        "Could not submit",
        error.response?.data?.message || error.message,
      );
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <View style={styles.loginScreen}>
        <StatusBar style="light" />
        <GradientHeader from="#000000" to="#000000" style={styles.loginHero}>
          <View style={styles.regDoneIcon}>
            <Icon name="check" size={40} color="#fff" />
          </View>
          <Text style={styles.regDoneTitle}>Registration received</Text>
          <Text style={styles.regDoneBody}>
            Our office will review your details. Once approved, your sign-in details
            are emailed to {String(form.email || "").trim()}. After you sign in you will
            be asked to complete your carrier documentation.
          </Text>
        </GradientHeader>
        <View style={{ padding: spacing.lg }}>
          <PrimaryButton title="Back to sign in" onPress={onBack} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.loginScreen}>
      <StatusBar style="light" />
      <GradientHeader from="#000000" to="#000000" style={styles.regHero}>
        <Pressable onPress={onBack} hitSlop={10} style={styles.regBack}>
          <Icon name="back" size={20} color="#fff" />
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10 }}>
          <View style={styles.loginMark}>
            <Icon name="truck" size={26} color={colors.onBrand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.regTitle}>Register as a carrier</Text>
            <Text style={styles.regSub}>Bid on loads, run your drivers and get paid.</Text>
          </View>
        </View>
      </GradientHeader>

      <KeyboardAvoidingView
        style={styles.loginBody}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.loginScroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.loginCard}>
            {REGISTER_FIELDS.map((f) => {
              const empty = !String(form[f.key] || "").trim();
              const error = errors[f.key];
              return (
                <View
                  key={f.key}
                  style={styles.field}
                  onLayout={(e) => {
                    offsets.current[f.key] = e.nativeEvent.layout.y;
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={styles.label}>{f.label}</Text>
                    {f.required ? (
                      <Text style={[styles.regTag, empty ? styles.regTagTodo : styles.regTagDone]}>
                        {empty ? "REQUIRED" : "✓ DONE"}
                      </Text>
                    ) : null}
                  </View>
                  <TextInput
                    value={form[f.key] || ""}
                    onChangeText={set(f.key)}
                    placeholder={f.placeholder}
                    keyboardType={f.keyboardType}
                    autoCapitalize={f.keyboardType === "email-address" ? "none" : f.caps || "sentences"}
                    style={[
                      styles.input,
                      f.required && empty && !error && styles.regInputTodo,
                      error && styles.regInputError,
                    ]}
                    placeholderTextColor="#A5A5A5"
                  />
                  {error ? <Text style={styles.regError}>👉  {error}</Text> : null}
                </View>
              );
            })}

            {locations.length > 1 ? (
              <View
                style={styles.field}
                onLayout={(e) => {
                  offsets.current.locationId = e.nativeEvent.layout.y;
                }}
              >
                <Text style={styles.label}>Operating location</Text>
                <View style={styles.regChips}>
                  {locations.map((loc) => {
                    const on = form.locationId === loc._id;
                    return (
                      <Pressable
                        key={loc._id}
                        onPress={() => set("locationId")(loc._id)}
                        style={[styles.regChip, on && styles.regChipOn]}
                      >
                        <Text style={[styles.regChipText, on && styles.regChipTextOn]}>{loc.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {errors.locationId ? <Text style={styles.regError}>👉  {errors.locationId}</Text> : null}
              </View>
            ) : null}

            <View style={styles.field}>
              <Text style={styles.label}>Anything we should know?</Text>
              <TextInput
                value={form.note}
                onChangeText={set("note")}
                placeholder="Fleet size, equipment types, lanes you run…"
                multiline
                style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
                placeholderTextColor="#A5A5A5"
              />
            </View>

            <PrimaryButton
              title={loading ? "Submitting..." : "Submit for approval"}
              onPress={submit}
              disabled={loading}
            />
            <Text style={styles.regFoot}>
              You can sign in once our office approves your account and emails your
              sign-in details.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function LoginScreen({ onLogin }) {
  const [registering, setRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || !password) {
      Alert.alert("Missing details", "Enter email and password.");
      return;
    }

    try {
      setLoading(true);
      const res = await api.post("/auth/login", { email, password });
      // Drivers are sub-accounts of a fleet owner and this app is where they
      // actually work — the phone in the cab is what starts live tracking and
      // uploads pickup proof. Everything they see is resolved from their own
      // account to their carrier server-side, so a driver session reaches
      // exactly what their carrier was assigned.
      if (!MOBILE_ROLES.includes(res.data.user?.role)) {
        Alert.alert(
          "Account not supported here",
          "Sign in with a driver, carrier, shipper or broker account.",
        );
        return;
      }
      await saveSession(res.data);
      onLogin(res.data);
    } catch (error) {
      Alert.alert("Login failed", error.response?.data?.message || error.message);
    } finally {
      setLoading(false);
    }
  };

  if (registering) return <RegisterCarrierScreen onBack={() => setRegistering(false)} />;

  return (
    <View style={styles.loginScreen}>
      <StatusBar style="light" />
      {/* Brand block on the deep navy, sign-in on white beneath it — the
          split the marketing screens use, so the app opens on-brand. */}
      <GradientHeader from="#000000" to="#000000" style={styles.loginHero}>
        <View style={styles.loginBrandRow}>
          <View style={styles.loginMark}>
            <Icon name="truck" size={26} color={colors.onBrand} />
          </View>
          <Text style={styles.brand}>
            {brand.name}
            <Text style={{ color: "#AFAFAF" }}>{brand.nameAccent}</Text>
          </Text>
        </View>
        <Text style={styles.loginTagline}>{brand.tagline}</Text>

        <View style={styles.loginRoles}>
          {["Drivers", "Carriers", "Shippers", "Brokers"].map((label) => (
            <View key={label} style={styles.loginRoleChip}>
              <Text style={styles.loginRoleChipText}>{label}</Text>
            </View>
          ))}
        </View>
      </GradientHeader>

      <KeyboardAvoidingView
        style={styles.loginBody}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.loginScroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.loginCard}>
            <Text style={styles.title}>Sign in</Text>
            <Text style={styles.subtitle}>One app for every trucking need.</Text>
            <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Password"
            />
            <PrimaryButton title={loading ? "Signing in..." : "Sign In"} onPress={submit} disabled={loading} />

            {/* New carriers apply from the phone too — see RegisterCarrierScreen. */}
            <Pressable
              onPress={() => setRegistering(true)}
              style={({ pressed }) => [styles.regCta, pressed && { opacity: 0.8 }]}
            >
              <Icon name="truck" size={20} color="#000000" />
              <View style={{ flex: 1 }}>
                <Text style={styles.regCtaTitle}>New carrier? Register</Text>
                <Text style={styles.regCtaSub}>Apply in 2 minutes — our office approves it</Text>
              </View>
              <Icon name="chevron" size={18} color="#000000" />
            </Pressable>

            <Text style={styles.apiHint}>API: {API_BASE_URL}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const stopLabel = (stop) =>
  [stop?.city, stop?.state].filter(Boolean).join(", ") || "-";

function SummaryItem({ label, value }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={2}>
        {value || "-"}
      </Text>
    </View>
  );
}

/** Open for bidding right now: open status, window started and not yet closed. */
const isLiveBid = (load) => {
  if (load?.bidStatus !== "OPEN") return false;
  const now = Date.now();
  const start = load.bidStartTime ? new Date(load.bidStartTime).getTime() : null;
  const end = load.bidEndTime ? new Date(load.bidEndTime).getTime() : null;
  return (!start || start <= now) && (!end || end > now);
};

/** A glowing border that pulses, laid over a live card. */
function LivePulse({ color }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        { borderRadius: 16, borderWidth: 3, borderColor: color, opacity: pulse },
      ]}
    />
  );
}

function LoadCard({ load, children, onPress, live }) {
  // Prefer the single pickup/drop: the list endpoint hydrates those from the
  // Address collection, while the pickups/drops arrays come back raw.
  const origin = load.pickup || load.pickups?.[0];
  const destination = load.drop || load.drops?.[0];

  // A colour-coded edge carrying the same status colour as the chip. In a long
  // list this is what lets a carrier find the one load that has moved without
  // reading every card.
  const statusTone =
    (load.transportStatus
      ? TRANSPORT_STATUS_COLOR[load.transportStatus]
      : BID_STATUS_COLOR[load.bidStatus]) || STATUS_FALLBACK;

  const header = (
    <>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1, paddingRight: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={styles.loadId}>{load.loadId}</Text>
          {live ? <LiveBadge color={colors.danger} label="LIVE BID" /> : null}
        </View>
        {load.transportStatus ? (
          <StatusChip value={load.transportStatus} />
        ) : (
          <StatusChip value={load.bidStatus} map={BID_STATUS_COLOR} />
        )}
      </View>
      {/* Key identifiers up front, so a load can be identified from the list
          without opening it. */}
      <View style={styles.summaryGrid}>
        <SummaryItem label="Origin" value={stopLabel(origin)} />
        <SummaryItem label="Destination" value={stopLabel(destination)} />
        <SummaryItem label="Container #" value={load.containerNo} />
        <SummaryItem label="Chassis #" value={load.chassisNo} />
        <SummaryItem label="Pickup #" value={load.pickupNo} />
        <SummaryItem label="Destination #" value={destination?.poNumber} />
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>{load.truckType || "Load -"}</Text>
        {/* Whatever is in force right now: the settled amount once awarded,
            the offer while it is being negotiated, this carrier's own bid while
            it stands, and only then the rate the load was posted at. Worked out
            server-side so every screen agrees — see carrierPayoutFor. */}
        {/* The money is what a carrier scans a card for, so it is set as
            large as the negotiated amount and on its own highlight. */}
        <View style={styles.amountBadge}>
          <Text style={styles.amountText}>
            {load.carrierPayout != null
              ? money(load.carrierPayout)
              : money(load.winningBid?.amount ?? load.vendorRate)}
          </Text>
          {PAYOUT_LABEL[load.carrierPayoutSource] ? (
            <Text style={styles.amountLabel}>{PAYOUT_LABEL[load.carrierPayoutSource]}</Text>
          ) : null}
        </View>
      </View>
    </>
  );

  return (
    <View
      style={[
        styles.card,
        { borderLeftWidth: 4, borderLeftColor: live ? colors.danger : statusTone.color },
        live && { backgroundColor: "#FFF7F7" },
      ]}
    >
      {live ? <LivePulse color={colors.danger} /> : null}
      {onPress ? (
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }, styles.cardTapArea]}
        >
          {header}
          <Text style={styles.detailHint}>View full details ›</Text>
        </Pressable>
      ) : (
        header
      )}
      {children}
    </View>
  );
}

// ─── The bid board card ───────────────────────────────────────────────────────
// Its own design rather than the shared LoadCard: this is the one screen a
// carrier opens to make money, so the rate, the lane and the clock lead, and the
// action — bid, or answer an offer — sits in its own panel under them.
// ─────────────────────────────────────────────────────────────────────────────

/** "2h 14m left", "Opens in 35m", "Closed" — refreshed every 30 seconds. */
function useBidClock(load) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const start = load.bidStartTime ? new Date(load.bidStartTime).getTime() : null;
  const end = load.bidEndTime ? new Date(load.bidEndTime).getTime() : null;
  const span = (ms) => {
    const mins = Math.max(0, Math.round(ms / 60000));
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${m}m`;
    return `${m}m`;
  };

  if (start && start > now) return { text: `Opens in ${span(start - now)}`, urgent: false };
  if (end && end <= now) return { text: "Bidding closed", urgent: true };
  if (end) return { text: `${span(end - now)} left to bid`, urgent: end - now < 3600000 };
  return { text: "Open for bids", urgent: false };
}

function RouteLine({ origin, destination, pickupDate }) {
  return (
    <View style={styles.routeWrap}>
      <View style={styles.routeRail}>
        <View style={[styles.routeDot, { backgroundColor: colors.success }]} />
        <View style={styles.routeDash} />
        <View style={[styles.routeDot, { backgroundColor: colors.danger }]} />
      </View>
      <View style={{ flex: 1, gap: 14 }}>
        <View>
          <Text style={styles.routeTag}>PICKUP</Text>
          <Text style={styles.routeCity} numberOfLines={1}>{stopLabel(origin)}</Text>
          {pickupDate ? <Text style={styles.routeSub}>{fmtDate(pickupDate)}</Text> : null}
        </View>
        <View>
          <Text style={styles.routeTag}>DROP</Text>
          <Text style={styles.routeCity} numberOfLines={1}>{stopLabel(destination)}</Text>
        </View>
      </View>
    </View>
  );
}

function InfoChip({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.infoChip}>
      <Text style={styles.infoChipLabel}>{label}</Text>
      <Text style={styles.infoChipValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function BidBoardCard({ load, live, onOpen, offer, saving, amount, onAmount, onBid, onRespond }) {
  const origin = load.pickup || load.pickups?.[0];
  const destination = load.drop || load.drops?.[0];
  const clock = useBidClock(load);
  const rate =
    load.carrierPayout != null ? load.carrierPayout : load.winningBid?.amount ?? load.vendorRate;
  const quick = rate ? [rate, Math.round(rate * 0.97), Math.round(rate * 0.95)] : [];

  return (
    <View style={[styles.bbCard, live && styles.bbCardLive]}>
      {live ? <LivePulse color={colors.danger} /> : null}

      {/* Header: id, live state and the rate, on the brand gradient. */}
      <GradientHeader from="#000000" to="#000000" style={styles.bbHeader}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={styles.bbLoadId}>{load.loadId}</Text>
            {live ? <LiveBadge light color={colors.danger} /> : null}
          </View>
          <Text style={styles.bbType}>{load.truckType || "Load"}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.bbRateLabel}>RATE</Text>
          <Text style={styles.bbRate}>{money(rate)}</Text>
        </View>
      </GradientHeader>

      <View style={styles.bbBody}>
        {/* The clock: how long is left to act. */}
        <View style={[styles.bbClock, clock.urgent && styles.bbClockUrgent]}>
          <Icon name="clock" size={16} color={clock.urgent ? colors.danger : "#000000"} />
          <Text style={[styles.bbClockText, clock.urgent && { color: colors.danger }]}>
            {clock.text}
          </Text>
        </View>

        <RouteLine origin={origin} destination={destination} pickupDate={origin?.pickupDate} />

        <View style={styles.chipRow}>
          <InfoChip label="Container" value={load.containerNo} />
          <InfoChip label="Chassis" value={load.chassisNo} />
          <InfoChip label="Pickup #" value={load.pickupNo} />
          <InfoChip label="Dest #" value={destination?.poNumber} />
        </View>

        {offer ? (
          // A counter-offer is a yes-or-no on one number, so it replaces the
          // bid box entirely.
          <GradientHeader from="#F6F6F6" to="#F6F6F6" style={styles.bbOffer}>
            <Text style={styles.bbOfferTag}>🤝  OFFICE COUNTER-OFFER</Text>
            <Text style={styles.bbOfferAmount}>{money(offer.amount)}</Text>
            {offer.previousAmount ? (
              <Text style={styles.bbOfferNote}>
                Your bid was {money(offer.previousAmount)} · accepting awards you this load
              </Text>
            ) : (
              <Text style={styles.bbOfferNote}>Accepting awards you this load</Text>
            )}
            <View style={styles.bbActions}>
              <Pressable
                onPress={() => onRespond(false)}
                disabled={saving}
                style={({ pressed }) => [styles.bbDecline, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.bbDeclineText}>Decline</Text>
              </Pressable>
              <Pressable
                onPress={() => onRespond(true)}
                disabled={saving}
                style={({ pressed }) => [styles.bbAccept, pressed && { opacity: 0.85 }]}
              >
                <Icon name="check" size={18} color="#fff" />
                <Text style={styles.bbAcceptText}>{saving ? "Sending…" : "Accept"}</Text>
              </Pressable>
            </View>
          </GradientHeader>
        ) : (
          <View style={styles.bbBidBox}>
            <Text style={styles.bbBidTag}>YOUR BID</Text>
            <View style={styles.bbBidRow}>
              <View style={styles.bbInputWrap}>
                <Text style={styles.bbDollar}>$</Text>
                <TextInput
                  value={amount}
                  onChangeText={onAmount}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#A5A5A5"
                  style={styles.bbInput}
                />
              </View>
              <Pressable
                onPress={onBid}
                style={({ pressed }) => [styles.bbBidBtn, pressed && { opacity: 0.85 }]}
              >
                <Icon name="bid" size={18} color="#fff" />
                <Text style={styles.bbBidBtnText}>Place bid</Text>
              </Pressable>
            </View>
            {quick.length ? (
              <View style={styles.bbQuickRow}>
                {quick.map((value, i) => (
                  <Pressable
                    key={i}
                    onPress={() => onAmount(String(value))}
                    style={({ pressed }) => [styles.bbQuick, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.bbQuickText}>{money(value)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        )}

        <Pressable onPress={onOpen} style={styles.bbDetails}>
          <Text style={styles.bbDetailsText}>View full details</Text>
          <Icon name="chevron" size={16} color="#000000" />
        </Pressable>
      </View>
    </View>
  );
}

function AvailableBidsTab({ onOpenAssigned, onOpenDetail }) {
  const [loads, setLoads] = useState([]);
  const [amountByLoad, setAmountByLoad] = useState({});
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);
  // Why the list is empty. A carrier with every truck committed is served an
  // empty board by design; without this it reads as "no loads today", which is
  // a different thing and leaves them waiting for work that will not appear.
  const [capacity, setCapacity] = useState(null);

  const fetchLoads = async () => {
    try {
      setLoading(true);
      const [loadsRes, capacityRes] = await Promise.all([
        api.get("/loads", { params: { bidStatus: "OPEN" } }),
        api.get("/loads/my-capacity").catch(() => null),
      ]);
      setLoads(loadsRes.data || []);
      setCapacity(capacityRes?.data || null);
    } catch (error) {
      Alert.alert("Unable to fetch bids", error.response?.data?.message || error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLoads();
  }, []);

  const placeBid = async (loadId) => {
    const amount = Number(amountByLoad[loadId]);
    if (!amount) {
      Alert.alert("Bid amount required", "Enter a valid bid amount.");
      return;
    }

    try {
      await api.post(`/bidRoutes/${loadId}/bids`, { amount });
      Alert.alert("Bid submitted", "Your bid was synced successfully.");
      setAmountByLoad((prev) => ({ ...prev, [loadId]: "" }));
    } catch (error) {
      Alert.alert("Bid failed", error.response?.data?.message || error.message);
    }
  };

  // A counter-offer the office has put to this carrier. It arrives on the same
  // board as the open loads, so it is answered here rather than sending them off
  // to My Bids to find it.
  const respondToOffer = async (item, accept) => {
    const send = async () => {
      try {
        setSavingId(item.loadId);
        const res = await api.post(`/loads/${item.loadId}/negotiation/respond`, {
          bidId: item.negotiation.bidId,
          accept,
        });
        Alert.alert(
          accept ? "Offer accepted" : "Offer declined",
          res.data?.message ||
            (accept ? "The load has been awarded to you." : "The offer was declined."),
        );
        fetchLoads();
      } catch (error) {
        Alert.alert(
          "Could not send response",
          error.response?.data?.message || error.message,
        );
      } finally {
        setSavingId(null);
      }
    };

    if (!accept) return send();

    Alert.alert(
      "Accept this amount?",
      `Accepting ${money(item.negotiation.amount)} awards load ${item.loadId} to you.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Accept", onPress: send },
      ],
    );
  };

  return (
    <FlatList
      data={loads.filter((item) => item && item.loadId)}
      keyExtractor={(item, index) => String(item._id || item.loadId || index)}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchLoads} />}
      ListHeaderComponent={
        capacity?.biddingBlocked ? (
          <View style={styles.capacityNotice}>
            <Text style={styles.capacityTitle}>Bidding is not open to you yet</Text>
            <Text style={styles.capacityBody}>{capacity.biddingBlocked.message}</Text>
          </View>
        ) : capacity?.atCapacity ? (
          <View style={styles.capacityNotice}>
            <Text style={styles.capacityTitle}>
              Bidding paused — {capacity.trucks === 1 ? "your truck is" : "your trucks are"} committed
            </Text>
            <Text style={styles.capacityBody}>{capacity.message}</Text>
          </View>
        ) : null
      }
      ListEmptyComponent={
        <Text style={styles.empty}>
          {loading
            ? "Loading open bids..."
            : capacity?.biddingBlocked
              ? "No loads are shown until your onboarding is approved and your insurance is on file."
              : capacity?.atCapacity
              ? "Nothing to bid on until your current load is delivered."
              : "No open bids right now."}
        </Text>
      }
      renderItem={({ item }) => (
        <BidBoardCard
          load={item}
          live={isLiveBid(item)}
          offer={item.negotiation}
          saving={savingId === item.loadId}
          amount={amountByLoad[item.loadId] || ""}
          onAmount={(text) => setAmountByLoad((prev) => ({ ...prev, [item.loadId]: text }))}
          onBid={() => placeBid(item.loadId)}
          onRespond={(accept) => respondToOffer(item, accept)}
          onOpen={() => onOpenDetail(item)}
        />
      )}
      contentContainerStyle={styles.listContent}
    />
  );
}

// ─── The carrier's own paperwork ──────────────────────────────────────────────
// The agreements they have signed, and the ones they still have to. This is the
// only place in the app they can read back what they put their name to — the
// onboarding gate shows them on the way in and then disappears once everything
// is signed, which is exactly when somebody wants to look one up.
//
// Opening one goes through a short-lived link rather than the authenticated
// download route directly: the system PDF viewer carries no Authorization
// header. See agreementDownloadLink in the onboarding controller.
// ─────────────────────────────────────────────────────────────────────────────
function CarrierDocumentsScreen({ onBack }) {
  const [state, setState] = useState({ loading: true, agreements: [], signed: [] });
  const [opening, setOpening] = useState(null);

  const load = useCallback(async () => {
    try {
      const [catalogRes, fileRes] = await Promise.all([
        api.get("/onboarding/catalog"),
        api.get("/onboarding"),
      ]);
      setState({
        loading: false,
        agreements: (catalogRes.data?.agreements || []).map((a) =>
          agreementFor(a, fileRes.data?.profile),
        ),
        signed: fileRes.data?.agreements || [],
      });
    } catch (error) {
      setState({ loading: false, agreements: [], signed: [], error: true });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const view = async (agreement) => {
    setOpening(agreement.key);
    try {
      const res = await api.get(`/onboarding/agreements/${agreement.key}/link`);
      const url = res.data?.url;
      if (!url) throw new Error("No link came back for that document.");
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert(
        "Could not open it",
        error.response?.data?.message || error.message,
      );
    } finally {
      setOpening(null);
    }
  };

  const signedFor = (key) => state.signed.find((a) => a.key === key && a.signedAt);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={state.loading} onRefresh={load} />
        }
      >
        <BrandMark compact />
        <Text style={styles.title}>Your documents</Text>
        <Text style={styles.subtitle}>
          The agreements you have signed with us. Tap one to open it.
        </Text>

        {state.loading && (
          <View style={styles.card}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {!state.loading && state.error && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Could not load your paperwork</Text>
            <Text style={styles.cardBody}>
              Check your connection and pull down to try again.
            </Text>
          </View>
        )}

        {state.agreements.map((agreement) => {
          const done = signedFor(agreement.key);
          return (
            <View key={agreement.key} style={styles.card}>
              <Text style={styles.cardTitle}>{agreement.title}</Text>
              <Text style={styles.cardBody}>{agreement.summary}</Text>

              {done ? (
                <>
                  <Text style={styles.signedNote}>
                    ✓ Signed {fmtDate(done.signedAt)}
                    {done.signedName ? ` by ${done.signedName}` : ""}
                  </Text>
                  {done.hasDocument ? (
                    <SecondaryButton
                      title={opening === agreement.key ? "Opening…" : "View document"}
                      onPress={() => view(agreement)}
                      disabled={opening === agreement.key}
                    />
                  ) : (
                    <Text style={styles.cardMeta}>
                      Signed, but the copy is still being prepared. Pull down to
                      refresh in a moment.
                    </Text>
                  )}
                </>
              ) : (
                <Text style={styles.cardMeta}>
                  Not signed yet. It is on your onboarding checklist.
                </Text>
              )}
            </View>
          );
        })}

        <SecondaryButton title="Back" onPress={onBack} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Updates that announce themselves ─────────────────────────────────────────
// By default expo-updates checks on launch, downloads in the background, and
// applies on the NEXT launch. On a phone that is rarely closed — a driver's, all
// day — that means a fix can sit downloaded and unused for days, and nobody can
// tell whether it arrived. Backgrounding is not enough either: Android keeps the
// launch alive, so reopening from recents replays the old bundle.
//
// So the app asks on its own, and says so when there is something to apply.
// Tapping restarts straight into the new version.
//
// Silent about everything else on purpose: no update, no network, a development
// build where updates never apply — all of it is nothing the person holding the
// phone can act on.
function UpdateBanner() {
  const [ready, setReady] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Updates are disabled in dev, where checking throws rather than returning.
    if (__DEV__ || !Updates.isEnabled) return undefined;

    (async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (!check.isAvailable || cancelled) return;
        await Updates.fetchUpdateAsync();
        if (!cancelled) setReady(true);
      } catch {
        // Offline, or no update server for this build. Nothing to say.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return null;

  return (
    <Pressable
      onPress={async () => {
        setApplying(true);
        try {
          await Updates.reloadAsync();
        } catch (error) {
          setApplying(false);
          Alert.alert(
            "Could not restart",
            "Close the app fully and open it again to finish updating.",
          );
        }
      }}
      style={styles.updateBanner}
    >
      <Text style={styles.updateBannerText}>
        {applying ? "Restarting…" : "A new version is ready — tap to restart"}
      </Text>
    </Pressable>
  );
}

// ─── The carrier's roster ─────────────────────────────────────────────────────
// Who they can put on a load, and whether each one is actually allowed to drive
// it. A driver with no licence copy on file cannot update a load — see
// middleware/driverCompliance.js — so that gap leads the card rather than being
// discovered at a dock.
// ─────────────────────────────────────────────────────────────────────────────
const DRIVER_BLANK = {
  name: "",
  phone: "",
  email: "",
  licenseNumber: "",
  licenseState: "",
  licenseClass: "A",
  licenseExpiry: "",
};

function DriverForm({ initial, states, onCancel, onSubmit, saving, title }) {
  const [form, setForm] = useState({ ...DRIVER_BLANK, ...(initial || {}) });
  const set = (key) => (text) => setForm((f) => ({ ...f, [key]: text }));

  const field = (key, label, extra = {}) => (
    <SchemaField
      field={{ key, label, ...extra }}
      value={form[key]}
      onChange={set(key)}
    />
  );

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>

      {field("name", "Driver name", { required: true })}
      {field("phone", "Phone", { type: "tel" })}
      {field("email", "Email", {
        type: "email",
        help: "They sign into the driver app with this. Leave it blank if they will not use it.",
      })}
      {field("licenseNumber", "Licence number")}
      {field("licenseState", "Issuing state", { type: "select", options: states || [] })}
      {field("licenseClass", "Class", { type: "select", options: ["A", "B", "C"] })}
      {field("licenseExpiry", "Licence expires", { placeholder: "YYYY-MM-DD" })}

      <PrimaryButton
        title={saving ? "Saving…" : "Save driver"}
        disabled={saving}
        onPress={() => {
          if (!form.name.trim()) {
            Alert.alert("Name needed", "A driver needs a name.");
            return;
          }
          onSubmit(form);
        }}
      />
      <SecondaryButton title="Cancel" onPress={onCancel} disabled={saving} />
    </View>
  );
}

function CarrierDriversScreen({ onBack }) {
  const [drivers, setDrivers] = useState([]);
  const [states, setStates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null); // a driver, or the string "new"

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [file, catalog] = await Promise.all([
        api.get("/onboarding"),
        api.get("/onboarding/catalog").catch(() => null),
      ]);
      setDrivers(file.data?.drivers || []);
      if (catalog) setStates(catalog.data?.states || []);
    } catch (error) {
      Alert.alert(
        "Could not load drivers",
        error.response?.data?.message || error.message,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addDriver = async (form) => {
    setSaving(true);
    try {
      const res = await api.post("/drivers/bulk", { drivers: [form] });
      // The bulk route reports per-row failures in the body rather than
      // throwing, so a rejected row looks like a success unless it is read out.
      const failure = (res.data?.failed || [])[0];
      if (failure) {
        Alert.alert("Could not add", failure.message);
        return;
      }
      setEditing(null);
      await load({ silent: true });
    } catch (error) {
      Alert.alert("Could not add", error.response?.data?.message || error.message);
    } finally {
      setSaving(false);
    }
  };

  const saveDriver = async (form) => {
    setSaving(true);
    try {
      await api.put(`/drivers/${form._id}`, form);
      setEditing(null);
      await load({ silent: true });
    } catch (error) {
      Alert.alert("Could not save", error.response?.data?.message || error.message);
    } finally {
      setSaving(false);
    }
  };

  const uploadLicence = async (driver) => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ["image/*", "application/pdf"],
      copyToCacheDirectory: true,
    });
    if (picked.canceled) return;

    const asset = picked.assets?.[0];
    if (!asset) return;

    const body = new FormData();
    body.append("license", {
      uri: asset.uri,
      name: asset.name || "licence.jpg",
      type: asset.mimeType || "image/jpeg",
    });

    setSaving(true);
    try {
      await api.post(`/onboarding/drivers/${driver._id}/license`, body, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await load({ silent: true });
      Alert.alert("Uploaded", `${driver.name} is cleared to update loads.`);
    } catch (error) {
      Alert.alert("Upload failed", error.response?.data?.message || error.message);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        >
          <BrandMark compact />
          <DriverForm
            title={editing === "new" ? "Add a driver" : `Edit ${editing.name}`}
            initial={editing === "new" ? null : editing}
            states={states}
            saving={saving}
            onCancel={() => setEditing(null)}
            onSubmit={editing === "new" ? addDriver : saveDriver}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        <BrandMark compact />
        <Text style={styles.title}>Your drivers</Text>
        <Text style={styles.subtitle}>
          A driver cannot update a load until a copy of their licence is on file.
        </Text>

        <PrimaryButton title="Add a driver" onPress={() => setEditing("new")} />

        {!loading && !drivers.length ? (
          <Text style={styles.empty}>No drivers yet.</Text>
        ) : null}

        {drivers.map((driver) => {
          const onFile = !!driver.licenseDocument?.fileName;
          const expired =
            driver.licenseExpiry && new Date(driver.licenseExpiry) < new Date();

          return (
            <View key={driver._id} style={styles.card}>
              <Text style={styles.cardTitle}>{driver.name}</Text>
              <Text style={styles.cardMeta}>
                {[driver.phone, driver.email].filter(Boolean).join(" · ") ||
                  "No contact details"}
              </Text>
              <Text style={styles.cardMeta}>
                {[
                  driver.licenseNumber || "No licence number",
                  driver.licenseState,
                  driver.licenseClass ? `Class ${driver.licenseClass}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>

              {expired ? (
                <Text style={styles.fieldError}>
                  Licence expired {fmtDate(driver.licenseExpiry)}.
                </Text>
              ) : onFile ? (
                <Text style={styles.signedNote}>✓ Licence copy on file</Text>
              ) : (
                <Text style={styles.fieldError}>
                  No licence copy — this driver cannot update loads.
                </Text>
              )}

              <SecondaryButton
                title={onFile ? "Replace licence copy" : "Upload licence copy"}
                onPress={() => uploadLicence(driver)}
                disabled={saving}
              />
              <SecondaryButton
                title="Edit details"
                onPress={() => setEditing(driver)}
              />
            </View>
          );
        })}

        <SecondaryButton title="Back" onPress={onBack} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── What the carrier is insured for ──────────────────────────────────────────
// Read-only on purpose: a carrier does not file their own certificates. Their
// agency does, through a one-off link — see controllers/insuranceController.js.
// What the carrier needs from a phone is to know where that stands, what is on
// file, and what is short, so they can chase the right person.
// ─────────────────────────────────────────────────────────────────────────────
function CarrierInsuranceScreen({ onBack }) {
  const [file, setFile] = useState(null);
  const [coverages, setCoverages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [agent, setAgent] = useState(null); // the invite form, once opened
  // The agency's one-off link. Held so it can be passed on by hand when the
  // email does not land — the server hands it back for exactly that reason.
  const [link, setLink] = useState("");

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [onboarding, catalog] = await Promise.all([
        api.get("/onboarding"),
        api.get("/onboarding/catalog").catch(() => null),
      ]);
      setFile(onboarding.data);
      setCoverages(catalog?.data?.insurance?.coverages || []);
    } catch (error) {
      Alert.alert(
        "Could not load insurance",
        error.response?.data?.message || error.message,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const insurance = file?.insurance || {};
  const policies = insurance.policies || [];
  const labelFor = (key) =>
    coverages.find((c) => c.key === key)?.label || key;

  const sendRequest = async () => {
    if (!String(agent?.agentEmail || "").trim()) {
      Alert.alert("Email needed", "Enter your agent's email address.");
      return;
    }

    setBusy(true);
    try {
      const res = await api.post("/insurance/invite", agent);
      setFile(res.data?.onboarding || file);
      setAgent(null);
      // Shown rather than swallowed: when the send fails this link is the only
      // way the agency gets in, and the message says so.
      setLink(res.data?.link || "");
      Alert.alert("Request sent", res.data?.message || "Your agent has been asked.");
      await load({ silent: true });
    } catch (error) {
      Alert.alert(
        "Could not send it",
        error.response?.data?.message || error.message,
      );
    } finally {
      setBusy(false);
    }
  };

  const remind = async () => {
    setBusy(true);
    try {
      const res = await api.post("/insurance/remind", {});
      Alert.alert("Reminder sent", res.data?.message || "Your agent has been reminded.");
      await load({ silent: true });
    } catch (error) {
      Alert.alert(
        "Could not send it",
        error.response?.data?.message || error.message,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        <BrandMark compact />
        <Text style={styles.title}>Your insurance</Text>
        <Text style={styles.subtitle}>
          Filed by your agency on your behalf. Ask them for a change — this is a
          record of what they have sent us.
        </Text>

        {/* Where it stands, first — it is the only part most people open this for. */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Status</Text>
          {insurance.submittedAt ? (
            <Text style={styles.signedNote}>
              ✓ Filed {fmtDate(insurance.submittedAt)}
              {insurance.submittedByName ? ` by ${insurance.submittedByName}` : ""}
            </Text>
          ) : insurance.invitedAt ? (
            <>
              <Text style={styles.cardBody}>
                Waiting on {insurance.agencyName || insurance.agentEmail || "your agency"}.
                Asked {fmtDate(insurance.invitedAt)}
                {insurance.reminderSentAt
                  ? `, reminded ${fmtDate(insurance.reminderSentAt)}`
                  : ""}
                .
              </Text>
              <SecondaryButton
                title={busy ? "Sending…" : "Send them a reminder"}
                onPress={remind}
                disabled={busy}
              />
            </>
          ) : (
            <Text style={styles.cardBody}>
              Nothing filed yet, and no agency has been asked yet.
            </Text>
          )}

          {/* Re-asking is legitimate — a carrier changes agency, or the first
              email went to the wrong address — so this stays available until
              the filing actually lands. */}
          {!insurance.submittedAt && !agent ? (
            <SecondaryButton
              title={insurance.invitedAt ? "Ask a different agent" : "Send request to your agent"}
              onPress={() =>
                setAgent({
                  agencyName: insurance.agencyName || "",
                  agentName: insurance.agentName || "",
                  agentEmail: insurance.agentEmail || "",
                  agentPhone: insurance.agentPhone || "",
                })
              }
            />
          ) : null}

          {insurance.agencyName || insurance.agentEmail ? (
            <Text style={styles.cardMeta}>
              {[insurance.agencyName, insurance.agentName, insurance.agentEmail, insurance.agentPhone]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          ) : null}
        </View>

        {agent ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Ask your agent for certificates</Text>
            <Text style={styles.cardBody}>
              We email them a one-off link. They file the certificates directly —
              you do not have to collect or forward anything.
            </Text>

            {[
              { key: "agencyName", label: "Agency name" },
              { key: "agentName", label: "Agent name" },
              { key: "agentEmail", label: "Agent email", type: "email", required: true },
              { key: "agentPhone", label: "Agent phone", type: "tel" },
            ].map((field) => (
              <SchemaField
                key={field.key}
                field={field}
                value={agent[field.key]}
                onChange={(text) => setAgent((a) => ({ ...a, [field.key]: text }))}
              />
            ))}

            <PrimaryButton
              title={busy ? "Sending…" : "Send the request"}
              onPress={sendRequest}
              disabled={busy}
            />
            <SecondaryButton title="Cancel" onPress={() => setAgent(null)} disabled={busy} />
          </View>
        ) : null}

        {link ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Their link</Text>
            <Text style={styles.cardBody}>
              If the email does not arrive, send them this. It is theirs alone and
              expires.
            </Text>
            <Text selectable style={styles.cardMeta}>
              {link}
            </Text>
          </View>
        ) : null}

        {/* What the office flagged as short, stated as they recorded it. */}
        {(insurance.shortfalls || []).length ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Needs attention</Text>
            {insurance.shortfalls.map((problem, i) => (
              <Text key={i} style={styles.fieldError}>
                • {problem}
              </Text>
            ))}
          </View>
        ) : null}

        {policies.map((policy, i) => (
          <View key={policy.policyNumber || i} style={styles.card}>
            <Text style={styles.cardTitle}>{labelFor(policy.coverage)}</Text>
            <Text style={styles.cardMeta}>
              {[policy.insurerName, policy.policyNumber].filter(Boolean).join(" · ") ||
                "No insurer recorded"}
            </Text>
            <Text style={styles.cardBody}>
              {policy.limit ? `Limit ${money(policy.limit)}` : "No limit recorded"}
              {policy.aggregateLimit ? ` · Aggregate ${money(policy.aggregateLimit)}` : ""}
            </Text>
            {policy.expiryDate ? (
              new Date(policy.expiryDate) < new Date() ? (
                <Text style={styles.fieldError}>
                  Expired {fmtDate(policy.expiryDate)}
                </Text>
              ) : (
                <Text style={styles.cardMeta}>
                  Expires {fmtDate(policy.expiryDate)}
                </Text>
              )
            ) : null}
          </View>
        ))}

        {!loading && !policies.length && insurance.submittedAt ? (
          <Text style={styles.empty}>No policies on the filing.</Text>
        ) : null}

        <SecondaryButton title="Back" onPress={onBack} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Bidding, in one place ────────────────────────────────────────────────────
// Two halves of the same job: what is open to bid on, and what has already been
// bid on. They were two top-level tabs, which meant checking whether a bid had
// landed was a trip to the other end of the tab bar and back.
//
// "Available" leads because it is the one with something to do in it; History is
// where a carrier goes to see how a bid ended.
// ─────────────────────────────────────────────────────────────────────────────
function BidsTab({ onOpenAssigned, onOpenDetail }) {
  const [half, setHalf] = useState("available");

  const halves = [
    { key: "available", label: "Available" },
    { key: "history", label: "History" },
  ];

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.subTabRow}>
        {halves.map((item) => {
          const on = half === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setHalf(item.key)}
              style={[styles.subTab, on && styles.subTabActive]}
            >
              <Text style={[styles.subTabText, on && styles.subTabTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {half === "available" ? (
        <AvailableBidsTab
          onOpenAssigned={onOpenAssigned}
          onOpenDetail={onOpenDetail}
        />
      ) : (
        <MyBidsTab onOpenDetail={onOpenDetail} />
      )}
    </View>
  );
}

function MyBidsTab({ onOpenDetail }) {
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState({});
  const [amountByLoad, setAmountByLoad] = useState({});
  const [savingId, setSavingId] = useState(null);

  const fetchBids = async () => {
    try {
      setLoading(true);
      const res = await api.get("/bidRoutes/myBids");
      setBids(res.data || []);
    } catch (error) {
      Alert.alert("Unable to fetch bids", error.response?.data?.message || error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBids();
  }, []);

  const startEditing = (loadId, currentAmount) => {
    setAmountByLoad((prev) => ({ ...prev, [loadId]: String(currentAmount ?? "") }));
    setEditing((prev) => ({ ...prev, [loadId]: true }));
  };

  const cancelEditing = (loadId) => {
    setEditing((prev) => ({ ...prev, [loadId]: false }));
  };

  const updateBid = async (loadId) => {
    const amount = Number(amountByLoad[loadId]);
    if (!amount) {
      Alert.alert("Bid amount required", "Enter a valid bid amount.");
      return;
    }

    try {
      setSavingId(loadId);
      await api.post(`/bidRoutes/${loadId}/bids`, { amount });
      Alert.alert("Bid updated", "Your new bid amount was synced.");
      setEditing((prev) => ({ ...prev, [loadId]: false }));
      fetchBids();
    } catch (error) {
      Alert.alert("Update failed", error.response?.data?.message || error.message);
    } finally {
      setSavingId(null);
    }
  };

  // Accepting a negotiated amount awards the load on the spot, so it is worth
  // one confirmation before it goes.
  const respondToOffer = async (item, accept) => {
    const send = async () => {
      try {
        setSavingId(item.loadId);
        const res = await api.post(`/loads/${item.loadId}/negotiation/respond`, {
          bidId: item.bidId,
          accept,
        });
        Alert.alert(
          accept ? "Offer accepted" : "Offer declined",
          res.data?.message ||
            (accept ? "The load has been awarded to you." : "The offer was declined."),
        );
        fetchBids();
      } catch (error) {
        Alert.alert("Could not send response", error.response?.data?.message || error.message);
      } finally {
        setSavingId(null);
      }
    };

    if (!accept) return send();

    Alert.alert(
      "Accept this amount?",
      `Accepting ${money(item.negotiation.amount)} awards load ${item.loadId} to you.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Accept", onPress: send },
      ],
    );
  };

  return (
    <FlatList
      data={bids.filter(Boolean)}
      keyExtractor={(item, index) => String(item._id || item.loadId || index)}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchBids} />}
      ListEmptyComponent={
        <Text style={styles.empty}>{loading ? "Loading bids..." : "No bids submitted yet."}</Text>
      }
      renderItem={({ item }) => {
        const result = item.result || item.status || "PENDING";
        const offer = item.negotiation;
        // While an offer is open, editing the bid would talk past it.
        const canEdit = result === "PENDING" && !offer;
        const isEditing = Boolean(editing[item.loadId]);
        const isSaving = savingId === item.loadId;

        return (
          <LoadCard load={item} onPress={() => onOpenDetail(item)}>
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>Bid: {money(item.bidAmount || item.amount)}</Text>
              <Pill tone={result === "WON" ? "success" : result === "LOST" ? "danger" : "warning"}>
                {result}
              </Pill>
            </View>

            {offer && (
              <View style={styles.offerBox}>
                <Text style={styles.offerTitle}>Negotiated amount</Text>
                <Text style={styles.offerAmount}>{money(offer.amount)}</Text>
                <Text style={styles.muted}>
                  Accepting awards this load to you at {money(offer.amount)}.
                </Text>
                <View style={styles.bidRow}>
                  <SecondaryButton
                    title="Decline"
                    onPress={() => respondToOffer(item, false)}
                    disabled={isSaving}
                  />
                  <PrimaryButton
                    title={isSaving ? "Sending..." : "Accept"}
                    onPress={() => respondToOffer(item, true)}
                    disabled={isSaving}
                  />
                </View>
              </View>
            )}

            {canEdit && !isEditing && (
              <SecondaryButton
                title="Update bid"
                onPress={() => startEditing(item.loadId, item.bidAmount || item.amount)}
              />
            )}

            {canEdit && isEditing && (
              <View style={styles.bidRow}>
                <TextInput
                  value={amountByLoad[item.loadId] ?? ""}
                  onChangeText={(text) =>
                    setAmountByLoad((prev) => ({ ...prev, [item.loadId]: text }))
                  }
                  keyboardType="numeric"
                  placeholder="New bid amount"
                  style={[styles.input, styles.bidInput]}
                  placeholderTextColor="#A5A5A5"
                />
                <SecondaryButton title="Cancel" onPress={() => cancelEditing(item.loadId)} disabled={isSaving} />
                <PrimaryButton
                  title={isSaving ? "Saving..." : "Save"}
                  onPress={() => updateBid(item.loadId)}
                  disabled={isSaving}
                />
              </View>
            )}
          </LoadCard>
        );
      }}
      contentContainerStyle={styles.listContent}
    />
  );
}

function AssignedLoadsTab({ onTrack, onOpenDetail }) {
  const [loads, setLoads] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchLoads = async () => {
    try {
      setLoading(true);
      const res = await api.get("/fleet-owners/assignedLoad");
      setLoads(res.data || []);
    } catch (error) {
      Alert.alert("Unable to fetch loads", error.response?.data?.message || error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLoads();
  }, []);

  const confirm = async (loadId) => {
    try {
      await api.put(`/loads/assignedLoad/${loadId}/confirm`);
      Alert.alert("Confirmed", "Load is ready for pickup. Live tracking will be required at pickup.");
      fetchLoads();
    } catch (error) {
      Alert.alert("Confirm failed", error.response?.data?.message || error.message);
    }
  };

  return (
    <FlatList
      data={loads.filter(
        (item) =>
          item && item.loadId && !completedStatuses.includes(item.transportStatus),
      )}
      keyExtractor={(item, index) => String(item._id || item.loadId || index)}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchLoads} />}
      ListEmptyComponent={
        <Text style={styles.empty}>{loading ? "Loading assigned loads..." : "No assigned loads."}</Text>
      }
      renderItem={({ item }) => (
        <LoadCard load={item} onPress={() => onOpenDetail(item)}>
          <View style={styles.actionRow}>
            {item.transportStatus === "ASSIGNED" ? (
              <PrimaryButton title="Confirm" tone="success" onPress={() => confirm(item.loadId)} />
            ) : null}
            <SecondaryButton title="Track and update" onPress={() => onTrack(item)} />
          </View>
        </LoadCard>
      )}
      contentContainerStyle={styles.listContent}
    />
  );
}

function OverLoadsTab({ onTrack, onOpenDetail }) {
  const [loads, setLoads] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchLoads = async () => {
    try {
      setLoading(true);
      const res = await api.get("/fleet-owners/assignedLoad");
      setLoads(res.data || []);
    } catch (error) {
      Alert.alert("Unable to fetch loads", error.response?.data?.message || error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLoads();
  }, []);

  return (
    <FlatList
      data={loads.filter(
        (item) =>
          item && item.loadId && completedStatuses.includes(item.transportStatus),
      )}
      keyExtractor={(item, index) => String(item._id || item.loadId || index)}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchLoads} />}
      ListEmptyComponent={
        <Text style={styles.empty}>{loading ? "Loading loads..." : "No completed loads yet."}</Text>
      }
      renderItem={({ item }) => (
        <LoadCard load={item} onPress={() => onOpenDetail(item)}>
          <View style={styles.actionRow}>
            <SecondaryButton
              title="View documents"
              onPress={() => onTrack(item, { documentsOnly: true })}
            />
          </View>
        </LoadCard>
      )}
      contentContainerStyle={styles.listContent}
    />
  );
}

// `askReceiver` is off for the agreement-signing flow, which is the carrier
// signing for themselves — there is nobody else to name.
function SignatureModal({
  visible,
  onClose,
  onSigned,
  askReceiver = false,
  initialReceiver = null,
}) {
  const signatureRef = useRef(null);
  // Who took the delivery. The signature proves somebody signed; it does not
  // say who, and "who signed for it" is the first question asked when a
  // delivery is disputed weeks later. Printed on the POD beside the mark.
  const [receiverName, setReceiverName] = useState("");
  const [receiverTitle, setReceiverTitle] = useState("");

  // Reopened for the SAME delivery — a failed save, a retry — comes back with
  // what the driver already typed. Opened for a new one comes back empty:
  // `initialReceiver` is cleared once a delivery lands, so the last consignee's
  // name is never sitting in the box at the next drop where it would be signed
  // for without being read.
  useEffect(() => {
    if (visible) {
      setReceiverName(initialReceiver?.name || "");
      setReceiverTitle(initialReceiver?.title || "");
    }
    // `initialReceiver` is deliberately not a dependency: the box is seeded when
    // the sheet opens, and must not be yanked back to the stored value while the
    // driver is halfway through correcting it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleSave = () => {
    if (askReceiver && !receiverName.trim()) {
      Alert.alert(
        "Who took the delivery?",
        "Enter the name of the person receiving this load before saving.",
      );
      return;
    }
    signatureRef.current?.readSignature?.();
  };

  const handleClear = () => {
    signatureRef.current?.resetImage?.();
  };

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={[styles.safe, styles.signatureScreen]}>
        <View style={styles.signatureHeader}>
          <Text style={styles.title}>Delivery Signature</Text>
          <SecondaryButton title="Close" onPress={onClose} />
        </View>
        {askReceiver && (
          <View style={styles.signatureReceiver}>
            <Text style={styles.inputLabel}>Received by *</Text>
            <TextInput
              value={receiverName}
              onChangeText={setReceiverName}
              placeholder="Name of the person taking delivery"
              placeholderTextColor="#A5A5A5"
              style={styles.input}
              autoCapitalize="words"
            />
            <TextInput
              value={receiverTitle}
              onChangeText={setReceiverTitle}
              placeholder="Their role (optional)"
              placeholderTextColor="#A5A5A5"
              style={[styles.input, { marginTop: 8 }]}
              autoCapitalize="words"
            />
          </View>
        )}
        <View style={styles.signaturePadWrap}>
          <Signature
            ref={signatureRef}
            onOK={(signature) => {
              onSigned(signature, {
                name: receiverName.trim(),
                title: receiverTitle.trim(),
              });
              onClose();
            }}
            onEmpty={() => Alert.alert("Signature required", "Please sign before saving.")}
            // Crop to the actual strokes so the exported PNG is a tight,
            // roughly-landscape image instead of a giant portrait canvas
            // (which shrinks to an invisible sliver in the POD).
            trimWhitespace
            imageType="image/png"
            // Dark, bold strokes so the signature stays visible after it is
            // scaled down into the small POD signature box.
            penColor="#000000"
            minWidth={2}
            maxWidth={4}
            dotSize={3}
            descriptionText="Receiver signature"
            webStyle={
              ".m-signature-pad { box-shadow: none; border: 0; } .m-signature-pad--body { border: 1px solid #E2E2E2; border-radius: 14px; }"
            }
            style={styles.signaturePad}
          />
        </View>
        <View style={styles.signatureActions}>
          <SecondaryButton title="Clear" onPress={handleClear} />
          <PrimaryButton title="Save signature" onPress={handleSave} tone="success" />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// Space-efficient status selector: one field that opens a scrollable,
// colour-coded list — replaces the old grid of status buttons.
function StatusPickerModal({ visible, onClose, options, isLocked, onSelect }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.pickerSheet} onPress={() => {}}>
          <Text style={styles.sectionTitle}>Select next status</Text>
          <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
            {options.map((status) => {
              const locked = isLocked(status);
              const palette = TRANSPORT_STATUS_COLOR[status] || STATUS_FALLBACK;
              return (
                <Pressable
                  key={status}
                  disabled={locked}
                  onPress={() => onSelect(status)}
                  style={({ pressed }) => [
                    styles.pickerRow,
                    { opacity: locked ? 0.4 : pressed ? 0.6 : 1 },
                  ]}
                >
                  <View style={[styles.statusDot, { backgroundColor: palette.color }]} />
                  <Text style={styles.pickerRowText}>{labelize(status)}</Text>
                  {locked && <Text style={styles.pickerRowNote}>✓ passed</Text>}
                </Pressable>
              );
            })}
          </ScrollView>
          <SecondaryButton title="Cancel" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// A single-choice list rendered inline inside the street-turn sheet. Nesting
// another Modal inside one is unreliable on Android, so the options expand in
// place instead.
function InlinePicker({ label, required, options, value, onChange, emptyText }) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.stFieldBlock}>
      <Text style={styles.stFieldLabel}>
        {label}
        {required ? " *" : ""}
      </Text>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => [styles.pickerField, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Text style={styles.pickerFieldText}>
          {value || (options.length ? "Select…" : emptyText)}
        </Text>
        <Text style={styles.pickerChevron}>{open ? "▴" : "▾"}</Text>
      </Pressable>

      {open && (
        <View style={styles.stOptionList}>
          {options.length === 0 ? (
            <Text style={styles.muted}>{emptyText}</Text>
          ) : (
            <>
              {!required && (
                <Pressable
                  onPress={() => {
                    onChange("");
                    setOpen(false);
                  }}
                  style={({ pressed }) => [styles.stOptionRow, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Text style={styles.muted}>None</Text>
                </Pressable>
              )}
              {options.map((opt) => (
                <Pressable
                  key={opt.name}
                  onPress={() => {
                    onChange(opt.name);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [styles.stOptionRow, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Text style={styles.pickerRowText}>
                    {opt.code ? `${opt.name} (${opt.code})` : opt.name}
                  </Text>
                  {opt.name === value && <Text style={styles.pickerRowNote}>✓</Text>}
                </Pressable>
              ))}
            </>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Street turn confirmation ───────────────────────────────────────────────
// Handing the container to a street turn partner emails every party involved, so
// the server refuses a STREET_TURN status change unless these details come
// with it. This sheet collects them.
function StreetTurnModal({ visible, load, saving, onClose, onConfirm }) {
  const [partners, setPartners] = useState([]);
  const [lines, setLines] = useState([]);
  const [chassisCompanies, setChassisCompanies] = useState([]);
  const [loadingMasters, setLoadingMasters] = useState(true);

  const [streetTurnPartner, setStreetTurnPartner] = useState("");
  const [shippingLine, setShippingLine] = useState("");
  const [chassisCompany, setChassisCompany] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!visible) return;

    setStreetTurnPartner("");
    setNote("");
    // Pre-fill from the load so the common case is one tap.
    setShippingLine(load?.shippingLine || "");
    setChassisCompany(load?.chassisCompany || "");

    setLoadingMasters(true);
    Promise.all([
      api.get("/street-turn-partners", { params: { active: true } }).catch(() => ({ data: [] })),
      api.get("/shipping-lines", { params: { active: true } }).catch(() => ({ data: [] })),
      api.get("/chassis-companies", { params: { active: true } }).catch(() => ({ data: [] })),
    ])
      .then(([p, l, c]) => {
        setPartners(p.data || []);
        setLines(l.data || []);
        setChassisCompanies(c.data || []);
      })
      .finally(() => setLoadingMasters(false));
  }, [visible, load]);

  const submit = () => {
    if (!streetTurnPartner) {
      Alert.alert(
        "Street turn partner required",
        "Select the street turn partner this load is being handed to.",
      );
      return;
    }
    onConfirm({ streetTurnPartner, shippingLine, chassisCompany, note });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.pickerSheet} onPress={() => {}}>
          <Text style={styles.sectionTitle}>Confirm Street Turn</Text>
          <Text style={styles.muted}>
            {load?.loadId} — the street turn partner, shipping line, chassis company, the
            assigned drivers, your carrier contact and the admins are all emailed once
            you confirm. The partner is asked to sign it back.
          </Text>

          {loadingMasters ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
          ) : (
            <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
              <InlinePicker
                label="Street Turn Partner"
                required
                options={partners}
                value={streetTurnPartner}
                onChange={setStreetTurnPartner}
                emptyText="No street turn partners set up yet."
              />
              <InlinePicker
                label="Shipping Line"
                options={lines}
                value={shippingLine}
                onChange={setShippingLine}
                emptyText="No shipping lines set up yet."
              />
              <InlinePicker
                label="Chassis Company"
                options={chassisCompanies}
                value={chassisCompany}
                onChange={setChassisCompany}
                emptyText="No chassis companies set up yet."
              />
              <View style={styles.stFieldBlock}>
                <Text style={styles.stFieldLabel}>Note</Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Optional note included in the emails"
                  multiline
                  style={[styles.input, styles.noteInput]}
                  placeholderTextColor="#A5A5A5"
                />
              </View>
            </ScrollView>
          )}

          <PrimaryButton
            title={saving ? "Confirming…" : "Confirm & Send Emails"}
            onPress={submit}
            disabled={saving || loadingMasters}
            tone="success"
          />
          <SecondaryButton title="Cancel" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Read-only load detail screen ───────────────────────────────────────────
function DetailRow({ label, value }) {
  const display =
    value === null || value === undefined || value === "" ? "-" : value;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      {typeof display === "string" || typeof display === "number" ? (
        <Text style={styles.detailValue}>{String(display)}</Text>
      ) : (
        <View style={styles.detailValueNode}>{display}</View>
      )}
    </View>
  );
}

function DetailSection({ title, children }) {
  return (
    <View style={styles.detailSection}>
      <Text style={styles.detailSectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function StopBlock({ stop, index, kind }) {
  const dateField = kind === "pickup" ? stop.pickupDate : stop.deliveryDate;
  return (
    <View style={styles.stopBlock}>
      <Text style={styles.stopTitle}>
        {kind === "pickup" ? "Origin" : "Destination"} #{index + 1}
      </Text>
      <Text style={styles.stopCompany}>{stop.company || "-"}</Text>
      {!!stop.address && <Text style={styles.muted}>{stop.address}</Text>}
      <Text style={styles.muted}>
        {[stop.city, stop.state, stop.zip].filter(Boolean).join(", ") || "-"}
      </Text>
      <View style={styles.stopMetaGrid}>
        <DetailRow label="Date" value={fmtDate(dateField)} />
        <DetailRow
          label="Time"
          value={`${stop.fromTime || "-"} – ${stop.toTime || "-"}`}
        />
        <DetailRow label="Appt.#" value={stop.apptNumber} />
        <DetailRow label="Appt. Given By" value={stop.apptGivenBy} />
        <DetailRow label="PO #" value={stop.poNumber} />
        <DetailRow label="Pieces" value={stop.pieces} />
        <DetailRow label="Weight" value={stop.weight} />
      </View>
    </View>
  );
}

function LoadDetailScreen({ load: initialLoad, onBack }) {
  const [load, setLoad] = useState(initialLoad);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api
      .get(`/loads/${initialLoad.loadId}`)
      .then((res) => {
        if (active && res.data) setLoad(res.data);
      })
      .catch(() => null)
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [initialLoad.loadId]);

  const pickups = load.pickups?.length
    ? load.pickups
    : load.pickup
    ? [load.pickup]
    : [];
  const drops = load.drops?.length ? load.drops : load.drop ? [load.drop] : [];

  const history = (load.transportStatusHistory || load.statusHistory || [])
    .slice()
    .reverse();
  const documents = visibleToDriver(load.documents);
  const contactPersons = load.contactPersons || [];
  const lastLocation = load.liveTracking?.lastLocation;

  const openDocument = async (filePath) => {
    const url = getDocumentUrl(filePath);
    if (!url) {
      Alert.alert("View unavailable", "No file is available for this document.");
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("View failed", "Unable to open the document.");
    }
  };

  const origin = load.pickup || load.pickups?.[0];
  const destination = load.drop || load.drops?.[0];
  const statusTone = TRANSPORT_STATUS_COLOR[load.transportStatus] || STATUS_FALLBACK;
  const needsProof = ["PICKED_UP", "DELIVERED"].includes(selectedStatus);
  const needsSignature = selectedStatus === "DELIVERED";
  const docsOnLoad = visibleToDriver(load.documents);
  const docTypes = [POD_DOCUMENT_TYPE, ...uploadableDocumentTypes];
  const docsDone = docTypes.filter((t) => getDocumentByType(t)).length;
  const lastSync = tracking?.lastHeartbeatAt || tracking?.lastLocation?.recordedAt;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* ── Hero: the load, its status and its lane ───────────────────── */}
        <GradientHeader from="#000000" to="#000000" style={styles.trHero}>
          <View style={styles.trTopRow}>
            <Pressable onPress={onBack} style={styles.trBack} hitSlop={10}>
              <Icon name="back" size={20} color="#fff" />
            </Pressable>
            <View style={[styles.trGps, isTrackingActive ? styles.trGpsOn : styles.trGpsOff]}>
              {isTrackingActive ? <LiveBadge light color={colors.success} label="LIVE GPS" /> : (
                <Text style={styles.trGpsOffText}>GPS OFF</Text>
              )}
            </View>
          </View>

          <Text style={styles.trEyebrow}>{documentsOnly ? "PAPERWORK" : "TRIP"}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Text style={styles.trLoadId}>{load.loadId}</Text>
            {load.transportStatus ? (
              <View style={[styles.trStatus, { backgroundColor: statusTone.bg }]}>
                <Text style={[styles.trStatusText, { color: statusTone.color }]}>
                  {labelize(load.transportStatus)}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.trRouteCard}>
            <RouteLine origin={origin} destination={destination} pickupDate={origin?.pickupDate} />
          </View>
        </GradientHeader>

        <View style={styles.trBody}>
          {!documentsOnly && (
            <>
              {/* ── Progress through the trip ───────────────────────────── */}
              <View style={styles.trCard}>
                <Text style={styles.trCardTitle}>Trip progress</Text>
                <View style={styles.trSteps}>
                  {MAIN_ORDER.map((step, i) => {
                    const done = currentStatusIdx >= i;
                    const current = currentStatusIdx === i;
                    return (
                      <View key={step} style={styles.trStep}>
                        <View
                          style={[
                            styles.trStepDot,
                            done && styles.trStepDotDone,
                            current && styles.trStepDotCurrent,
                          ]}
                        >
                          {done ? <Icon name="check" size={12} color="#fff" /> : null}
                        </View>
                        {i < MAIN_ORDER.length - 1 ? (
                          <View style={[styles.trStepLine, currentStatusIdx > i && styles.trStepLineDone]} />
                        ) : null}
                        <Text
                          style={[styles.trStepLabel, current && { color: "#000000", fontWeight: "900" }]}
                          numberOfLines={2}
                        >
                          {labelize(step)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* ── Live location ──────────────────────────────────────── */}
              <View style={styles.trCard}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={[styles.trIconBubble, { backgroundColor: isTrackingActive ? "#DCFCE7" : "#FEF3C7" }]}>
                    <Icon name="pin" size={22} color={isTrackingActive ? colors.success : colors.warning} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.trCardTitle}>Live location</Text>
                    <Text style={styles.trMuted}>
                      {tracking?.lastLocation
                        ? `${Number(tracking.lastLocation.latitude).toFixed(5)}, ${Number(
                            tracking.lastLocation.longitude,
                          ).toFixed(5)}`
                        : "Not shared yet"}
                    </Text>
                    {lastSync ? <Text style={styles.trMuted}>Last sync {fmtDateTime(lastSync)}</Text> : null}
                  </View>
                </View>
                {isTrackingActive ? (
                  <View style={styles.trTrackingOn}>
                    <Icon name="check" size={18} color={colors.success} />
                    <Text style={styles.trTrackingOnText}>Sharing your location with the office</Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={startTracking}
                    disabled={saving}
                    style={({ pressed }) => [styles.trBigBtn, { backgroundColor: colors.success }, pressed && { opacity: 0.85 }]}
                  >
                    <Icon name="track" size={20} color="#fff" />
                    <Text style={styles.trBigBtnText}>Start live tracking</Text>
                  </Pressable>
                )}
              </View>

              {/* ── Update status ──────────────────────────────────────── */}
              <View style={styles.trCard}>
                <Text style={styles.trCardTitle}>Update status</Text>

                <Pressable
                  onPress={() => setStatusPickerOpen(true)}
                  disabled={saving}
                  style={({ pressed }) => [
                    styles.trPicker,
                    selectedStatus && styles.trPickerChosen,
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.trPickerLabel}>NEXT STATUS</Text>
                    <Text style={[styles.trPickerValue, !selectedStatus && { color: "#A6A6A6" }]}>
                      {selectedStatus ? labelize(selectedStatus) : "Tap to choose…"}
                    </Text>
                  </View>
                  <Icon name="chevron" size={18} color="#000000" />
                </Pressable>

                {/* Proof photos — only for pickup and delivery. */}
                {needsProof ? (
                  <View style={styles.trPanel}>
                    <Text style={styles.trPanelTitle}>
                      📸  {selectedStatus === "PICKED_UP" ? "Pickup proof photos" : "Delivery proof photos"}
                    </Text>
                    <Text style={styles.trMuted}>
                      {selectedStatus === "PICKED_UP"
                        ? "At least one photo of the container at pickup."
                        : "Photograph the container at the drop."}
                    </Text>
                    {proofImages.length ? (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                        {proofImages.map((asset, i) => (
                          <View key={`${asset.uri}-${i}`} style={styles.trThumbWrap}>
                            <Image source={{ uri: asset.uri }} style={styles.trThumb} />
                            <Pressable onPress={() => removeProofImage(i)} style={styles.trThumbX} hitSlop={8}>
                              <Text style={{ color: "#fff", fontWeight: "900" }}>×</Text>
                            </Pressable>
                          </View>
                        ))}
                      </ScrollView>
                    ) : null}
                    <View style={styles.trBtnRow}>
                      <Pressable
                        onPress={() => pickProofImages(false)}
                        style={({ pressed }) => [styles.trBtn, styles.trBtnPrimary, pressed && { opacity: 0.85 }]}
                      >
                        <Icon name="camera" size={18} color="#fff" />
                        <Text style={styles.trBtnPrimaryText}>Take photo</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => pickProofImages(true)}
                        style={({ pressed }) => [styles.trBtn, styles.trBtnGhost, pressed && { opacity: 0.7 }]}
                      >
                        <Text style={styles.trBtnGhostText}>Gallery</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}

                {/* Signature — only at delivery. */}
                {needsSignature ? (
                  <View style={[styles.trPanel, signatureData && styles.trPanelDone]}>
                    <Text style={styles.trPanelTitle}>✍️  Delivery signature</Text>
                    <Text style={styles.trMuted}>
                      {signatureData
                        ? `Signed${receivedBy?.name ? ` by ${receivedBy.name}` : ""}`
                        : "The receiver signs on your phone at the drop."}
                    </Text>
                    <Pressable
                      onPress={() => setSignatureOpen(true)}
                      style={({ pressed }) => [
                        styles.trBtn,
                        signatureData ? styles.trBtnGhost : styles.trBtnPrimary,
                        { marginTop: 10 },
                        pressed && { opacity: 0.85 },
                      ]}
                    >
                      <Icon name="signature" size={18} color={signatureData ? "#000000" : "#fff"} />
                      <Text style={signatureData ? styles.trBtnGhostText : styles.trBtnPrimaryText}>
                        {signatureData ? "Sign again" : "Capture signature"}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Add a note for the office (optional)"
                  multiline
                  style={styles.trNote}
                  placeholderTextColor="#A5A5A5"
                />

                <Pressable
                  onPress={() => selectedStatus && updateStatus(selectedStatus)}
                  disabled={!selectedStatus || saving}
                  style={({ pressed }) => [
                    styles.trBigBtn,
                    { backgroundColor: selectedStatus ? "#000000" : "#D6D6D6" },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Icon name="check" size={20} color="#fff" />
                  <Text style={styles.trBigBtnText}>
                    {selectedStatus ? `Confirm: ${labelize(selectedStatus)}` : "Choose a status first"}
                  </Text>
                </Pressable>
              </View>
            </>
          )}

          {/* ── Documents ──────────────────────────────────────────────────── */}
          <View style={styles.trCard}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={styles.trCardTitle}>Documents</Text>
              <View style={styles.trDocCount}>
                <Text style={styles.trDocCountText}>
                  {docsDone}/{docTypes.length}
                </Text>
              </View>
            </View>
            <View style={styles.trProgressTrack}>
              <View style={[styles.trProgressFill, { width: `${Math.round((docsDone / docTypes.length) * 100)}%` }]} />
            </View>

            <PaperworkBanner paperwork={load.paperwork} />

            <DocumentCard
              title={POD_DOCUMENT_TYPE}
              document={getDocumentByType(POD_DOCUMENT_TYPE)}
              isPOD
              isDelivered={load.transportStatus === "DELIVERED"}
              onView={() => handleViewDocument(getDocumentByType(POD_DOCUMENT_TYPE)?.filePath)}
            />

            <View style={styles.uploadList}>
              {uploadableDocumentTypes.map((type) => (
                <DocumentCard
                  key={type}
                  title={type}
                  document={getDocumentByType(type)}
                  locked={load.paperwork?.state === "APPROVED"}
                  onView={() => handleViewDocument(getDocumentByType(type)?.filePath)}
                  onUpload={() => uploadDocument(type)}
                  onCamera={() => uploadDocument(type, true)}
                />
              ))}
            </View>

            <Text style={styles.trMuted}>{docsOnLoad.length} document(s) on this load</Text>
          </View>
        </View>
      </ScrollView>

      {saving && (
        <View style={styles.savingOverlay}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.savingText}>Syncing...</Text>
        </View>
      )}

      <StatusPickerModal
        visible={statusPickerOpen}
        onClose={() => setStatusPickerOpen(false)}
        options={statusOptions}
        isLocked={(s) => saving || isStatusLocked(s)}
        onSelect={(status) => {
          setStatusPickerOpen(false);
          // Chosen, not sent: the panels below then ask for what this status
          // needs, and the Confirm button sends it.
          setSelectedStatus(status);
          if (!["PICKED_UP", "DELIVERED"].includes(status)) setProofImages([]);
        }}
      />

      <SignatureModal
        visible={signatureOpen}
        askReceiver
        initialReceiver={receivedBy}
        onClose={() => {
          pendingDeliveryStatusRef.current = null;
          setSignatureOpen(false);
        }}
        onSigned={(signature, receiver) => {
          setSignatureData(signature);
          setReceivedBy(receiver?.name ? receiver : null);
          const pendingStatus = pendingDeliveryStatusRef.current;
          pendingDeliveryStatusRef.current = null;
          setSignatureOpen(false);
          if (pendingStatus) {
            updateStatus(pendingStatus, signature, null, receiver).catch((error) => {
              Alert.alert("Delivery sync failed", error.response?.data?.message || error.message);
            });
          }
        }}
      />

      <StreetTurnModal
        visible={streetTurnOpen}
        load={load}
        saving={saving}
        onClose={() => setStreetTurnOpen(false)}
        onConfirm={(streetTurn) => {
          updateStatus("STREET_TURN", signatureData, streetTurn);
        }}
      />
    </SafeAreaView>
  );
}

// ─── My licence ───────────────────────────────────────────────────────────────
// A driver cannot report a pickup or a delivery until a copy of their licence is
// on file — the carrier warrants in both signed agreements that every driver is
// properly licensed, and the server enforces it on every status update.
//
// This is where a driver clears that, in the place they actually work: the phone
// in the cab. A driver whose carrier already uploaded a licence during onboarding
// never sees this screen — the check is on the record, not on who filled it.
// ─────────────────────────────────────────────────────────────────────────────
function LicenseScreen({ onBack, onUpdated }) {
  const [loading, setLoading] = useState(true);
  const [driver, setDriver] = useState(null);
  const [compliance, setCompliance] = useState(null);
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseState, setLicenseState] = useState("");
  const [licenseExpiry, setLicenseExpiry] = useState("");
  const [photo, setPhoto] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await api.get("/drivers/me");
      setDriver(res.data.driver);
      setCompliance(res.data.compliance);
      setLicenseNumber(res.data.driver.licenseNumber || "");
      setLicenseState(res.data.driver.licenseState || "");
      setLicenseExpiry(
        res.data.driver.licenseExpiry
          ? String(res.data.driver.licenseExpiry).slice(0, 10)
          : "",
      );
    } catch (error) {
      Alert.alert(
        "Could not load your details",
        error.response?.data?.message || error.message,
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== "granted") {
      Alert.alert(
        "Camera permission required",
        "Camera access is needed to photograph your licence.",
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) setPhoto(result.assets[0]);
  };

  const chooseFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
    if (!result.canceled) setPhoto(result.assets[0]);
  };

  const submit = async () => {
    if (!photo) {
      Alert.alert("Photo needed", "Take or choose a photo of your licence first.");
      return;
    }

    try {
      setSaving(true);
      const formData = new FormData();
      formData.append("license", assetToFile(photo, "licence.jpg"));
      if (licenseNumber) formData.append("licenseNumber", licenseNumber);
      if (licenseState) formData.append("licenseState", licenseState);
      if (licenseExpiry) formData.append("licenseExpiry", licenseExpiry);

      const res = await api.post("/drivers/me/license", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setDriver(res.data.driver);
      setCompliance(res.data.compliance);
      setPhoto(null);
      onUpdated?.(res.data.compliance);
      Alert.alert("Licence saved", res.data.message);
    } catch (error) {
      Alert.alert("Upload failed", error.response?.data?.message || error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>My licence</Text>
          <Text style={styles.subtitle}>{driver?.name || ""}</Text>
        </View>
        <SecondaryButton title="Back" onPress={onBack} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        {loading ? (
          <Text style={styles.subtitle}>Loading…</Text>
        ) : (
          <>
            <View
              style={{
                backgroundColor: compliance?.canUpdateLoads ? "#dcfce7" : "#fef3c7",
                borderRadius: 12,
                padding: 14,
              }}
            >
              <Text
                style={{
                  fontWeight: "700",
                  color: compliance?.canUpdateLoads ? colors.success : colors.warning,
                }}
              >
                {compliance?.canUpdateLoads
                  ? "You are cleared to update your loads"
                  : "You cannot update loads yet"}
              </Text>
              <Text style={{ color: colors.muted, marginTop: 4, fontSize: 15 }}>
                {compliance?.canUpdateLoads
                  ? "Your licence is on file. Nothing further is needed."
                  : compliance?.message}
              </Text>
            </View>

            <Field
              label="Licence number"
              value={licenseNumber}
              onChangeText={setLicenseNumber}
              placeholder="D1234567"
            />
            <Field
              label="Issuing state"
              value={licenseState}
              onChangeText={setLicenseState}
              placeholder="CA"
            />
            <Field
              label="Expiry date (YYYY-MM-DD)"
              value={licenseExpiry}
              onChangeText={setLicenseExpiry}
              placeholder="2030-04-01"
            />

            {photo && (
              <Image
                source={{ uri: photo.uri }}
                style={{ width: "100%", height: 190, borderRadius: 12 }}
                resizeMode="cover"
              />
            )}

            <SecondaryButton
              title={photo ? "Retake photo" : "Take a photo of your licence"}
              onPress={takePhoto}
            />
            <SecondaryButton title="Choose from library" onPress={chooseFromLibrary} />

            <PrimaryButton
              title={saving ? "Uploading…" : "Save licence"}
              onPress={submit}
              disabled={saving || !photo}
            />

            {driver?.hasLicenseOnFile && (
              <Text style={{ color: colors.muted, fontSize: 14, textAlign: "center" }}>
                A copy is already on file. You only need to do this again when you
                renew.
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}


// ─── Carrier documentation gate ───────────────────────────────────────────────
// A carrier account is opened by the office and the credentials are mailed out,
// so the first thing a carrier ever does is sign in — on the web or, just as
// often, here. The web portal has always held the door shut until both
// agreements are signed; the phone app did not, which meant a carrier who
// happened to sign in on their phone first got straight to the load board with
// no contract on file, and the paperwork was never chased again.
//
// Same rule as the web gate (components/onboarding/CarrierOnboardingGate.jsx):
// the two agreements are the contract any load would be dispatched under, so
// nothing else opens until they are signed. Licences and insurance are chased
// afterwards rather than blocking, because insurance waits on a third party.
//
// Drivers are never gated here — they are sub-accounts, they sign nothing, and
// their own licence gate is separate.
function CarrierDocumentationGate({ session, onLogout, children }) {
  const [state, setState] = useState({ loading: true, complete: true });
  // The field schema — shared profile, per-document blanks, Appendix A — comes
  // from the server so the phone and the web ask for exactly the same blanks.
  // `undefined` while it is still in flight, `null` if the fetch failed: the
  // screen has to tell those apart, because "no required fields missing" and
  // "we do not know what the required fields are" look identical otherwise.
  const [catalog, setCatalog] = useState(undefined);
  // { kind: "profile" } | { kind: "equipment" } | { kind: "sign", agreement }
  const [screen, setScreen] = useState(null);

  const isCarrier = session.user?.role === "fleetOwner";

  const check = useCallback(async () => {
    if (!isCarrier) {
      setState({ loading: false, complete: true });
      return;
    }

    try {
      const res = await api.get("/onboarding");
      setState({
        loading: false,
        complete: Boolean(res.data.agreementsComplete),
        data: res.data,
      });
    } catch {
      // The gate is a convenience, not the security boundary — every carrier
      // API re-checks server-side. A failed GET must not lock a carrier out of
      // the app on a bad connection.
      setState({ loading: false, complete: true });
    }
  }, [isCarrier]);

  useEffect(() => {
    check();
  }, [check]);

  const loadCatalog = useCallback(async () => {
    if (!isCarrier) return;
    setCatalog(undefined);
    try {
      const res = await api.get("/onboarding/catalog");
      setCatalog(res.data);
    } catch {
      setCatalog(null);
    }
  }, [isCarrier]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // Both save routes hand back the whole onboarding document, so the screens
  // that write take their answer from the response rather than re-fetching.
  const applySaved = (onboarding) => {
    setState({
      loading: false,
      complete: Boolean(onboarding.agreementsComplete),
      data: onboarding,
    });
  };

  if (state.loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (state.complete) return children;

  const contractorAgreement = (catalog?.agreements || []).find((a) => a.appendixA);

  if (screen?.kind === "profile") {
    return (
      <CarrierProfileScreen
        sections={catalog?.sharedProfile || []}
        profile={state.data?.profile || {}}
        onSaved={(onboarding) => {
          applySaved(onboarding);
          setScreen(null);
        }}
        onBack={() => setScreen(null)}
      />
    );
  }

  if (screen?.kind === "equipment") {
    return (
      <CarrierEquipmentScreen
        appendix={contractorAgreement?.appendixA}
        equipment={state.data?.equipment || []}
        onSaved={(onboarding) => {
          applySaved(onboarding);
          setScreen(null);
        }}
        onBack={() => setScreen(null)}
      />
    );
  }

  if (screen?.kind === "sign") {
    return (
      <AgreementSignScreen
        agreement={agreementFor(screen.agreement, state.data?.profile)}
        profile={state.data?.profile || {}}
        onBack={() => setScreen(null)}
        onSigned={async () => {
          setScreen(null);
          await check();
        }}
      />
    );
  }

  return (
    <CarrierDocumentationScreen
      data={state.data}
      catalog={catalog}
      onSign={(agreement) => setScreen({ kind: "sign", agreement })}
      onEditProfile={() => setScreen({ kind: "profile" })}
      onEditEquipment={() => setScreen({ kind: "equipment" })}
      onRefresh={() => {
        check();
        loadCatalog();
      }}
      onLogout={onLogout}
    />
  );
}

/**
 * The required shared-profile blanks that are still empty, as the labels the
 * carrier sees.
 *
 * The same rule the server applies in config/carrierAgreements.js
 * (`profileGaps`), repeated here so the phone can say what is missing before a
 * signature is drawn rather than rejecting it afterwards. The server stays the
 * authority — this only decides what the screen offers.
 */
/**
 * A field or agreement as it reads for the chosen tax ID type (EIN or SSN) —
 * the same rule as agreementFor in server/config/carrierAgreements.js.
 */
const forTaxIdType = (item, taxIdType) =>
  item?.byTaxIdType?.[taxIdType] ? { ...item, ...item.byTaxIdType[taxIdType] } : item;

const agreementFor = (agreement, profile) => {
  if (!agreement) return agreement;
  const resolved = forTaxIdType(agreement, profile?.taxIdType);
  return {
    ...resolved,
    fields: (resolved.fields || []).map((f) => forTaxIdType(f, profile?.taxIdType)),
  };
};

const initialsOf = (name) =>
  String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0].toUpperCase())
    .join("");

const profileGapsFor = (sections, profile) =>
  (sections || [])
    .flatMap((section) => section.fields || [])
    .filter((field) => field.required && !String(profile?.[field.key] ?? "").trim())
    .map((field) => field.label);

const keyboardFor = (type) => {
  if (type === "email") return "email-address";
  if (type === "tel") return "phone-pad";
  if (type === "number") return "number-pad";
  return "default";
};

// One blank from the field schema. `select` expands its options in place rather
// than opening a modal — these forms are already inside a ScrollView, and a
// modal over a scrolling form is the fiddliest thing to hit on a phone.
function SchemaField({ field, value, onChange, error, onLayout }) {
  const [open, setOpen] = useState(false);
  const current = String(value ?? "");

  // The asterisk is the only thing on the form that says "you cannot submit
  // without this", so it is red rather than the same grey as the label it
  // follows — on a phone the label wraps and a grey asterisk disappears into it.
  const label = (
    <Text style={styles.label}>
      {field.label}
      {field.required ? <Text style={styles.requiredStar}> *</Text> : null}
    </Text>
  );

  const problem = error ? (
    <Text style={styles.fieldError}>{error}</Text>
  ) : null;

  if (field.type === "select") {
    return (
      <View style={styles.stFieldBlock} onLayout={onLayout}>
        {label}
        {field.help ? <Text style={styles.cardMeta}>{field.help}</Text> : null}
        <Pressable
          onPress={() => setOpen((v) => !v)}
          style={({ pressed }) => [
            styles.pickerField,
            error && styles.inputInvalid,
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={styles.pickerFieldText}>{current || "Select…"}</Text>
          <Text style={styles.pickerChevron}>{open ? "▴" : "▾"}</Text>
        </Pressable>

        {open && (
          <ScrollView style={styles.schemaOptionList} nestedScrollEnabled>
            {(field.options || []).map((option) => (
              <Pressable
                key={option}
                onPress={() => {
                  onChange(option);
                  setOpen(false);
                }}
                style={({ pressed }) => [styles.stOptionRow, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={styles.pickerRowText}>{option}</Text>
                {option === current && <Text style={styles.pickerRowNote}>✓</Text>}
              </Pressable>
            ))}
          </ScrollView>
        )}
        {problem}
      </View>
    );
  }

  return (
    <View onLayout={onLayout}>
      {label}
      {field.help ? <Text style={styles.cardMeta}>{field.help}</Text> : null}
      <TextInput
        style={[styles.input, error && styles.inputInvalid]}
        value={current}
        placeholder={field.placeholder || ""}
        placeholderTextColor={colors.muted}
        keyboardType={keyboardFor(field.type)}
        autoCapitalize={
          field.type === "email"
            ? "none"
            : field.type === "initials"
              ? "characters"
              : "sentences"
        }
        onChangeText={onChange}
      />
      {problem}
    </View>
  );
}

// The company details both agreements are filled from — legal name, authority
// numbers, address, signer.
//
// This screen only ever existed on the web, so a carrier who signed in on their
// phone was shown the agreements with no way to give the details that go into
// them, and the server rejected the signature listing a dozen fields the phone
// had never asked for.
function CarrierProfileScreen({ sections, profile, onBack, onSaved }) {
  const [values, setValues] = useState(profile || {});
  const [saving, setSaving] = useState(false);
  // Marked only after a save has actually been refused. Reds on a form nobody
  // has tried to submit yet read as failure before anything has been done.
  const [errors, setErrors] = useState({});

  const scrollRef = useRef(null);
  // Where each field sits down the page, so a complaint about one can put it on
  // screen instead of naming it and leaving the carrier to hunt. Filled by
  // onLayout: the card's offset plus the field's offset within it.
  const cardTops = useRef({});
  const fieldTops = useRef({});

  const gaps = profileGapsFor(sections, values);

  const allFields = (sections || []).flatMap((section) =>
    (section.fields || []).map((field) => ({ ...field, section: section.section })),
  );

  /** Required and still empty, in the order they appear on the page. */
  const missingFields = () =>
    allFields.filter(
      (field) => field.required && !String(values[field.key] ?? "").trim(),
    );

  const revealField = (field) => {
    const y =
      (cardTops.current[field.section] || 0) + (fieldTops.current[field.key] || 0);
    // A little above the field so its label is in view too, not scrolled to the
    // very top edge under the header.
    scrollRef.current?.scrollTo({ y: Math.max(y - 90, 0), animated: true });
  };

  const setField = (key, text) => {
    setValues((current) => ({ ...current, [key]: text }));
    // The complaint goes the moment it is being answered.
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  /** Fill a section from the fields it repeats — see `copyFrom` in the schema. */
  const copySection = (section) => {
    setValues((current) => {
      const next = { ...current };
      (section.fields || []).forEach((field) => {
        if (field.copyFrom && current[field.copyFrom]) {
          next[field.key] = current[field.copyFrom];
        }
      });
      return next;
    });
  };

  const save = async () => {
    const missing = missingFields();

    if (missing.length) {
      // Say it on the fields themselves and go to the first one. The list in an
      // alert was accurate and useless: it named six labels and left somebody
      // scrolling a long form looking for them.
      setErrors(
        Object.fromEntries(missing.map((field) => [field.key, "Fill this in."])),
      );
      revealField(missing[0]);
      Alert.alert(
        "Still needed",
        missing.length === 1
          ? `${missing[0].label} is required.`
          : `${missing.length} required fields are still empty. They are marked in red — the first one is on screen.`,
      );
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      const res = await api.put("/onboarding/profile", { profile: values });
      onSaved(res.data.onboarding);
    } catch (error) {
      Alert.alert("Could not save", error.response?.data?.message || error.message);
    } finally {
      setSaving(false);
    }
  };

  /** Keep what has been typed without demanding the rest of the form. */
  const saveDraft = async () => {
    setSaving(true);
    try {
      await api.put("/onboarding/profile", { profile: values });
      Alert.alert(
        "Saved",
        gaps.length
          ? `Kept what you have typed. Still needed: ${gaps.join(", ")}.`
          : "Everything the agreements need is filled in.",
      );
    } catch (error) {
      Alert.alert("Could not save", error.response?.data?.message || error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
      >
        <BrandMark compact />
        <Text style={styles.title}>Company details</Text>
        <Text style={styles.subtitle}>
          Typed once — these are the blanks on page 1 and the signature page of
          both agreements. Fields marked{" "}
          <Text style={styles.requiredStar}>*</Text> are required.
        </Text>

        {(sections || []).map((section) => {
          // A section every field of which repeats another can be filled in one
          // tap, once there is something to copy.
          const canCopy =
            (section.fields || []).some((f) => f.copyFrom) &&
            (section.fields || []).some(
              (f) => f.copyFrom && String(values[f.copyFrom] ?? "").trim(),
            );

          return (
            <View
              key={section.section}
              style={styles.card}
              onLayout={(e) => {
                cardTops.current[section.section] = e.nativeEvent.layout.y;
              }}
            >
              <Text style={styles.cardTitle}>{section.section}</Text>
              {section.help ? <Text style={styles.cardMeta}>{section.help}</Text> : null}

              {canCopy && (
                <Pressable
                  onPress={() => copySection(section)}
                  style={({ pressed }) => [styles.copyChip, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Text style={styles.copyChipText}>
                    ⧉ {section.copyLabel || "Copy from above"}
                  </Text>
                </Pressable>
              )}

              {(section.fields || []).map((field) => (
                <SchemaField
                  key={field.key}
                  field={forTaxIdType(field, values.taxIdType)}
                  value={values[field.key]}
                  error={errors[field.key]}
                  onLayout={(e) => {
                    fieldTops.current[field.key] = e.nativeEvent.layout.y;
                  }}
                  onChange={(text) => setField(field.key, text)}
                />
              ))}
            </View>
          );
        })}

        {gaps.length ? (
          <Pressable onPress={() => revealField(missingFields()[0] || {})}>
            <Text style={styles.gateFooter}>
              Still needed: {gaps.join(", ")}. Tap to jump to the first one.
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.signedNote}>
            ✓ Everything the agreements need is filled in.
          </Text>
        )}

        <PrimaryButton
          title={saving ? "Saving…" : "Save details"}
          onPress={save}
          disabled={saving}
        />
        <SecondaryButton
          title="Save and finish later"
          onPress={saveDraft}
          disabled={saving}
        />
        <SecondaryButton title="Back" onPress={onBack} />
      </ScrollView>
    </SafeAreaView>
  );
}

// Appendix A of the contractor agreement: the tractors and trailers being put
// into service. The server refuses to produce that document with an empty
// appendix, so the phone has to be able to fill it in too.
function CarrierEquipmentScreen({ appendix, equipment, onBack, onSaved }) {
  const columns = appendix?.columns || [];
  const [rows, setRows] = useState(
    equipment?.length ? equipment.map((row) => ({ ...row })) : [{}],
  );
  const [saving, setSaving] = useState(false);

  const setCell = (index, key, text) =>
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, [key]: text } : row)),
    );

  const save = async () => {
    const filled = rows.filter((row) =>
      columns.some((column) => String(row[column.key] ?? "").trim()),
    );

    if (!filled.length) {
      Alert.alert("Appendix A", "Add at least one piece of equipment.");
      return;
    }

    const vinColumn = columns.find((column) => column.key === "vin");

    for (const row of filled) {
      const missing = columns
        .filter((column) => column.required && !String(row[column.key] ?? "").trim())
        .map((column) => column.label);
      if (missing.length) {
        Alert.alert("Still needed", missing.join(", "));
        return;
      }

      // Same VIN check the web form applies — catching a transcription error
      // while the truck is still in front of the person typing.
      const vin = String(row.vin ?? "").trim().toUpperCase();
      if (vin && vinColumn?.pattern && !new RegExp(vinColumn.pattern).test(vin)) {
        Alert.alert(
          "Check the VIN",
          vinColumn.patternMessage || "That VIN does not look right.",
        );
        return;
      }
    }

    setSaving(true);
    try {
      const res = await api.put("/onboarding/profile", { equipment: filled });
      onSaved(res.data.onboarding);
    } catch (error) {
      Alert.alert("Could not save", error.response?.data?.message || error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{appendix?.title || "Equipment"}</Text>
        {appendix?.help ? <Text style={styles.subtitle}>{appendix.help}</Text> : null}

        {rows.map((row, index) => (
          <View key={index} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Unit {index + 1}</Text>
              {rows.length > 1 && (
                <Pressable
                  onPress={() =>
                    setRows((current) => current.filter((_, i) => i !== index))
                  }
                >
                  <Text style={styles.removeLink}>Remove</Text>
                </Pressable>
              )}
            </View>
            {columns.map((column) => (
              <SchemaField
                key={column.key}
                field={column}
                value={row[column.key]}
                onChange={(text) => setCell(index, column.key, text)}
              />
            ))}
          </View>
        ))}

        <SecondaryButton
          title="Add another unit"
          onPress={() => setRows((current) => [...current, {}])}
        />
        <PrimaryButton
          title={saving ? "Saving…" : "Save equipment"}
          onPress={save}
          disabled={saving}
        />
        <SecondaryButton title="Back" onPress={onBack} />
      </ScrollView>
    </SafeAreaView>
  );
}

function CarrierDocumentationScreen({
  data,
  catalog,
  onSign,
  onEditProfile,
  onEditEquipment,
  onRefresh,
  onLogout,
}) {
  const signedKeys = (data?.agreements || [])
    .filter((a) => a.signedAt)
    .map((a) => a.key);

  const gaps = profileGapsFor(catalog?.sharedProfile, data?.profile);
  const equipmentCount = (data?.equipment || []).length;
  const needsEquipment = (catalog?.agreements || []).some((a) => a.appendixA);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.listContent}>
        <Text style={styles.title}>Before you can haul</Text>
        <Text style={styles.subtitle}>
          {data?.carrier?.carrierName || "Your carrier"} — both agreements have
          to be signed before loads can be dispatched to you. This is the
          contract they are dispatched under, so it comes first.
        </Text>

        {catalog === undefined && (
          <View style={styles.card}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {catalog === null && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Could not load the paperwork</Text>
            <Text style={styles.cardBody}>
              Check your connection and refresh. Signing out will not lose
              anything you have already saved.
            </Text>
          </View>
        )}

        {catalog ? (
          <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Company details</Text>
            <Text style={styles.cardBody}>
              Your legal name, MC and USDOT numbers, address and authorised signer.
              Both agreements are filled in from these.
            </Text>
            {gaps.length ? (
              <>
                <Text style={styles.cardMeta}>Still needed: {gaps.join(", ")}.</Text>
                <PrimaryButton title="Add company details" onPress={onEditProfile} />
              </>
            ) : (
              <>
                <Text style={styles.signedNote}>✓ Complete</Text>
                <SecondaryButton title="Review details" onPress={onEditProfile} />
              </>
            )}
          </View>

          {needsEquipment && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Equipment (Appendix A)</Text>
              <Text style={styles.cardBody}>
                The tractors and trailers you are putting into service. The
                contractor agreement cannot be signed with an empty appendix.
              </Text>
              {equipmentCount ? (
                <>
                  <Text style={styles.signedNote}>
                    ✓ {equipmentCount} unit{equipmentCount === 1 ? "" : "s"} listed
                  </Text>
                  <SecondaryButton title="Review equipment" onPress={onEditEquipment} />
                </>
              ) : (
                <PrimaryButton title="Add equipment" onPress={onEditEquipment} />
              )}
            </View>
          )}

          {(catalog.agreements || []).map((baseAgreement) => {
            const agreement = agreementFor(baseAgreement, data?.profile);
            const done = signedKeys.includes(agreement.key);
            // What is stopping this one being signed right now. Shown up front
            // rather than letting the carrier read fifteen pages, tick every box
            // and draw a signature only to be told a blank they were never shown
            // is missing.
            const blockers = [];
            if (gaps.length) blockers.push("your company details");
            if (agreement.appendixA && !equipmentCount) {
              blockers.push("at least one unit in Appendix A");
            }

            return (
              <View key={agreement.key} style={styles.card}>
                <Text style={styles.cardTitle}>{agreement.title}</Text>
                <Text style={styles.cardMeta}>
                  With {agreement.counterparty} · {agreement.pages} pages
                </Text>
                <Text style={styles.cardBody}>{agreement.summary}</Text>

                {done ? (
                  <Text style={styles.signedNote}>✓ Signed</Text>
                ) : blockers.length ? (
                  <>
                    <Text style={styles.cardMeta}>Finish {blockers.join(" and ")} first.</Text>
                    <PrimaryButton title="Read & sign" onPress={() => {}} disabled />
                  </>
                ) : (
                  <PrimaryButton title="Read & sign" onPress={() => onSign(agreement)} />
                )}
              </View>
            );
          })}
          </>
        ) : null}

        <Text style={styles.gateFooter}>
          Driver licences and insurance are asked for after this — they will not
          hold you up here.
        </Text>

        <SecondaryButton title="Refresh" onPress={onRefresh} />
        <SecondaryButton title="Sign out" onPress={onLogout} />
      </ScrollView>
    </SafeAreaView>
  );
}

// One agreement, signed on the phone: the document-specific blanks, every
// acknowledgement ticked, and a drawn signature — the same three things the web
// form collects, because the server accepts a signature from either and produces
// the same filled PDF from it.
function AgreementSignScreen({ agreement, profile, onBack, onSigned }) {
  // Anything the company details already say — the EIN or SSN, the legal name —
  // is filled in rather than asked again, and initials come from the signer's
  // name. All of it stays editable.
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      (agreement.fields || [])
        .map((field) => [
          field.key,
          (field.prefillFrom && String(profile?.[field.prefillFrom] || "").trim()) ||
            (field.type === "initials" ? initialsOf(profile?.signerName) : ""),
        ])
        .filter(([, value]) => value),
    ),
  );
  const [accepted, setAccepted] = useState([]);
  // Prefilled from the authorised signer on the company details, which is who
  // this is meant to be — still editable, because a second officer sometimes
  // signs one of the two.
  const [signedName, setSignedName] = useState(profile?.signerName || "");
  const [signedTitle, setSignedTitle] = useState(profile?.signerTitle || "");
  const [signature, setSignature] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPad, setShowPad] = useState(false);
  // Read the draft first: the confirmations and the signature only appear once
  // the carrier has opened it, and any edit to what it shows hides them again.
  const [draftSeen, setDraftSeen] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  // Set once the server has the signature — the screen then offers the copy.
  const [signed, setSigned] = useState(false);
  const [opening, setOpening] = useState(false);

  const allAcknowledged =
    accepted.length === (agreement.acknowledgements || []).length;

  /** What stops a draft being built, as an alert — true when something does. */
  const detailsProblem = () => {
    const missing = (agreement.fields || [])
      .filter((f) => f.required && !String(values[f.key] || "").trim())
      .map((f) => f.label);

    if (missing.length) {
      Alert.alert("Still needed", missing.join(", "));
      return true;
    }

    // A field that declares a shape has to match it — the EIN certification's
    // nine digits, and anything added to config/carrierAgreements.js later. The
    // server checks the same rule; catching it here means the carrier is told
    // before they draw a signature rather than after.
    const malformed = (agreement.fields || [])
      .filter((f) => f.pattern && String(values[f.key] || "").trim())
      .find((f) => !new RegExp(f.pattern).test(String(values[f.key]).trim()));

    if (malformed) {
      Alert.alert(
        `Check the ${malformed.label.toLowerCase()}`,
        malformed.patternMessage || "That does not look right.",
      );
      return true;
    }

    if (!signedName.trim() || !signedTitle.trim()) {
      Alert.alert("Signer", "Your full name and title are both required.");
      return true;
    }
    return false;
  };

  // The agreement exactly as it will be signed, opened in the phone's PDF
  // viewer through a short-lived link (the viewer sends no auth header).
  const viewDraft = async () => {
    if (detailsProblem()) return;

    setDraftLoading(true);
    try {
      const res = await api.post(`/onboarding/agreements/${agreement.key}/preview`, {
        values,
        signedName,
        signedTitle,
      });
      const url = res.data?.url;
      if (!url) throw new Error("No link came back for the draft.");
      await Linking.openURL(url);
      setDraftSeen(true);
    } catch (error) {
      Alert.alert(
        "Could not open the draft",
        error.response?.data?.message || error.message,
      );
    } finally {
      setDraftLoading(false);
    }
  };

  const openSignedCopy = async () => {
    setOpening(true);
    try {
      const res = await api.get(`/onboarding/agreements/${agreement.key}/link`);
      const url = res.data?.url;
      if (!url) throw new Error("No link came back for that document.");
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert("Could not open it", error.response?.data?.message || error.message);
    } finally {
      setOpening(false);
    }
  };

  /** An edit to anything the draft shows means it has to be read again. */
  const edited = (setter) => (value) => {
    setter(value);
    setDraftSeen(false);
  };

  const submit = async () => {
    if (detailsProblem()) return;

    if (!allAcknowledged) {
      Alert.alert("Confirm each point", "Every acknowledgement has to be ticked.");
      return;
    }
    if (!signature) {
      Alert.alert("Signature", "Draw your signature before submitting.");
      return;
    }

    setSaving(true);
    try {
      await api.post(`/onboarding/agreements/${agreement.key}/sign`, {
        values,
        acknowledgements: agreement.acknowledgements,
        signedName,
        signedTitle,
        signatureData: signature,
      });
      setSigned(true);
    } catch (error) {
      Alert.alert(
        "Could not sign",
        error.response?.data?.message || error.message,
      );
    } finally {
      setSaving(false);
    }
  };

  if (signed) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.listContent}>
          <Text style={styles.title}>{agreement.title}</Text>
          <View style={styles.card}>
            <Text style={styles.signedNote}>✓ Signed</Text>
            <Text style={styles.cardBody}>
              Your signed copy is ready. Open it to read, save or share it — it is
              also kept under Your documents.
            </Text>
            <PrimaryButton
              title={opening ? "Opening…" : "Open / download signed copy"}
              onPress={openSignedCopy}
              disabled={opening}
            />
          </View>
          <SecondaryButton title="Done" onPress={onSigned} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (showPad) {
    return (
      <SignatureModal
        visible
        onClose={() => setShowPad(false)}
        onSigned={(data) => {
          setSignature(data);
          setShowPad(false);
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{agreement.title}</Text>
        <Text style={styles.subtitle}>With {agreement.counterparty}</Text>

        {(agreement.fields || []).map((field) => (
          <View key={field.key} style={styles.card}>
            <SchemaField
              field={field}
              value={values[field.key]}
              onChange={(text) => {
                setValues((current) => ({ ...current, [field.key]: text }));
                setDraftSeen(false);
              }}
            />
          </View>
        ))}

        <View style={styles.card}>
          <Text style={styles.label}>Signer full name *</Text>
          <TextInput
            style={styles.input}
            value={signedName}
            onChangeText={edited(setSignedName)}
          />
          <Text style={styles.label}>Title *</Text>
          <TextInput
            style={styles.input}
            value={signedTitle}
            onChangeText={edited(setSignedTitle)}
          />
        </View>

        {!draftSeen ? (
          <>
            <Text style={styles.cardMeta}>
              Read the agreement with your details filled in before you sign it.
            </Text>
            <PrimaryButton
              title={draftLoading ? "Preparing draft…" : "View draft"}
              onPress={viewDraft}
              disabled={draftLoading}
            />
          </>
        ) : (
          <>
            <SecondaryButton
              title={draftLoading ? "Preparing draft…" : "View draft again"}
              onPress={viewDraft}
              disabled={draftLoading}
            />

            <View style={styles.card}>
              <Text style={styles.label}>Confirm each of these</Text>
              {(agreement.acknowledgements || []).map((ack) => {
                const on = accepted.includes(ack);
                return (
                  <Pressable
                    key={ack}
                    style={styles.ackRow}
                    onPress={() =>
                      setAccepted((current) =>
                        on ? current.filter((a) => a !== ack) : [...current, ack],
                      )
                    }
                  >
                    <Text style={styles.ackBox}>{on ? "☑" : "☐"}</Text>
                    <Text style={styles.ackText}>{ack}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.card}>
              <Text style={styles.signedNote}>
                {signature ? "✓ Signature captured" : "No signature yet"}
              </Text>
              <SecondaryButton
                title={signature ? "Redraw signature" : "Draw signature"}
                onPress={() => setShowPad(true)}
              />
            </View>

            <PrimaryButton
              title={saving ? "Signing…" : "Sign agreement"}
              onPress={submit}
              disabled={saving}
            />
          </>
        )}
        <SecondaryButton title="Back" onPress={onBack} />
      </ScrollView>
    </SafeAreaView>
  );
}


// ─── Notifications ────────────────────────────────────────────────────────────
// The server has raised these all along — a load posted for bidding, a bid
// window closing, a status change — and the web has shown them in the bell for
// just as long. The phone app never asked for them, so a carrier working from
// their phone found out about a load by opening the app and looking.
//
// Polled rather than pushed. Push would need a notification service and a token
// per device; this needs nothing, and a driver who has the app open is the case
// that matters. The unread count refreshes on the same tick as the badge.
function NotificationsScreen({ onBack, onOpenLoad }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/notifications", { params: { limit: 50 } });
      setItems(res.data?.notifications || []);
    } catch (error) {
      Alert.alert(
        "Could not load notifications",
        error.response?.data?.message || error.message,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const markAllRead = async () => {
    try {
      await api.put("/notifications/read-all");
      fetchAll();
    } catch {
      /* the next refresh will show the true state */
    }
  };

  const open = async (item) => {
    if (!item.isRead) {
      api.put(`/notifications/${item._id}/read`).catch(() => null);
    }
    if (item.load?.loadId && onOpenLoad) onOpenLoad(item.load.loadId);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.notifHeader}>
        <SecondaryButton title="Back" onPress={onBack} />
        <SecondaryButton title="Mark all read" onPress={markAllRead} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => String(item._id)}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchAll} />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {loading ? "Loading..." : "Nothing yet."}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => open(item)}
            style={[styles.notifRow, !item.isRead && styles.notifUnread]}
          >
            <Text style={styles.notifTitle}>{item.title}</Text>
            <Text style={styles.notifBody}>{item.message}</Text>
            <Text style={styles.notifMeta}>
              {item.load?.loadId ? item.load.loadId + " · " : ""}
              {fmtDateTime(item.createdAt)}
            </Text>
          </Pressable>
        )}
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

/**
 * Read-only load list for the shipper and broker portals.
 *
 * Carriers and drivers have `/fleet-owners/assignedLoad`, which is scoped to
 * the loads they were given. Shippers and brokers do not — `GET /loads` is
 * already narrowed to what their role may see, so it is the right source here.
 */
function LoadListTab({ params, emptyText, onOpenDetail }) {
  const [loads, setLoads] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchLoads = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/loads", { params });
      setLoads(res.data?.loads || res.data || []);
    } catch (error) {
      Alert.alert("Unable to fetch loads", error.response?.data?.message || error.message);
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(params)]);

  useEffect(() => {
    fetchLoads();
  }, [fetchLoads]);

  return (
    <FlatList
      data={(Array.isArray(loads) ? loads : []).filter((item) => item && item.loadId)}
      keyExtractor={(item, index) => String(item._id || item.loadId || index)}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchLoads} />}
      ListEmptyComponent={
        <Text style={styles.empty}>{loading ? "Loading loads..." : emptyText}</Text>
      }
      renderItem={({ item }) => <LoadCard load={item} onPress={() => onOpenDetail(item)} />}
      contentContainerStyle={styles.listContent}
    />
  );
}

/** Account screen behind the More tab. */
function MoreScreen({ session, theme, onLogout, onOpen, isDriver }) {
  const user = session?.user || {};
  return (
    <>
      <AppHeader theme={theme} eyebrow="Account" title="More" subtitle={user.email} />
      <ScrollView contentContainerStyle={styles.moreBody} showsVerticalScrollIndicator={false}>
        <View style={styles.moreProfile}>
          <View style={[styles.moreAvatar, { backgroundColor: theme.accent }]}>
            <Text style={styles.moreAvatarText}>
              {String(user.name || user.email || "?").charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.moreName}>{user.name || user.email}</Text>
            <Text style={styles.moreRole}>{theme.label}</Text>
          </View>
        </View>

        <View style={styles.moreCard}>
          {isDriver ? (
            <Pressable style={styles.moreRow} onPress={() => onOpen("licence")}>
              <Icon name="licence" size={18} color={colors.parking} />
              <Text style={styles.moreRowText}>My licence</Text>
              <Icon name="chevron" size={16} color={colors.faint} />
            </Pressable>
          ) : null}
          <Pressable style={styles.moreRow} onPress={() => onOpen("alerts")}>
            <Icon name="bell" size={18} color={colors.roadside} />
            <Text style={styles.moreRowText}>Notifications</Text>
            <Icon name="chevron" size={16} color={colors.faint} />
          </Pressable>
          <Pressable style={[styles.moreRow, styles.moreRowLast]} onPress={onLogout}>
            <Icon name="logout" size={18} color={colors.danger} />
            <Text style={[styles.moreRowText, { color: colors.danger }]}>Sign out</Text>
          </Pressable>
        </View>

        <Text style={styles.apiHint}>
          {brand.name}
          {brand.nameAccent} · API {API_BASE_URL}
        </Text>
      </ScrollView>
    </>
  );
}

/**
 * The signed-in shell.
 *
 * Owns the bottom tab bar, the role's dashboard, and the full-screen routes
 * that tabs and dashboard tiles push to. Every screen that existed before is
 * still reachable — the shell only changes how you get to them.
 */
function FleetHomeScreen({ session, onLogout }) {
  const role = session.user?.role;
  const theme = themeForRole(role);
  const Home = homeForRole(role);

  const isDriver = role === "driver";
  const isCarrier = role === "fleetOwner";
  const isShipper = role === "client";
  // Only these two hold carrier-scoped loads, so only these two may call the
  // carrier endpoints — the rest would take a 403 for their trouble.
  const carrierSide = isDriver || isCarrier;

  const [tab, setTab] = useState("home");
  const [loadTab, setLoadTab] = useState(carrierSide ? "assigned" : "all");
  const [selectedLoad, setSelectedLoad] = useState(null);
  // How that load was opened. The Over tab opens a finished load to read its
  // paperwork, not to update a status that can no longer change.
  const [selectedLoadMode, setSelectedLoadMode] = useState(null);

  const openLoadScreen = (load, mode = null) => {
    setSelectedLoadMode(mode);
    setSelectedLoad(load);
  };
  const [detailLoad, setDetailLoad] = useState(null);
  const [showLicense, setShowLicense] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const [showDrivers, setShowDrivers] = useState(false);
  const [showInsurance, setShowInsurance] = useState(false);
  const [compliance, setCompliance] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // Dashboard data
  const [stats, setStats] = useState(null);
  const [assigned, setAssigned] = useState([]);
  const [available, setAvailable] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [booted, setBooted] = useState(false);

  // Polled on the same cadence the rest of the app refreshes at. Cheap: the
  // endpoint counts rather than lists.
  useEffect(() => {
    let cancelled = false;

    const tick = () =>
      api
        .get("/notifications/unread-count")
        .then((res) => {
          if (!cancelled) setUnreadCount(res.data?.unreadCount ?? 0);
        })
        .catch(() => null);

    tick();
    const id = setInterval(tick, 30000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [showNotifications]);

  // Checked on open rather than discovered on the first failed status update: a
  // driver finding out at the dock that they cannot report a pickup is the exact
  // situation this gate exists to avoid.
  useEffect(() => {
    if (!isDriver) return;

    let cancelled = false;
    api
      .get("/drivers/me")
      .then((res) => {
        if (!cancelled) setCompliance(res.data.compliance);
      })
      .catch(() => {
        /* non-fatal — the server still refuses the update and says why */
      });

    return () => {
      cancelled = true;
    };
  }, [isDriver]);

  /**
   * One pass for everything the dashboard shows. Failures are swallowed per
   * request rather than per batch: a carrier whose bid board is empty should
   * still see their trips.
   */
  const loadDashboard = useCallback(async () => {
    setRefreshing(true);

    const statsReq = api
      .get("/stats")
      .then((res) => setStats(res.data))
      .catch(() => null);

    const carrierReqs = carrierSide
      ? [
          api
            .get("/fleet-owners/assignedLoad")
            .then((res) =>
              setAssigned(
                (res.data || []).filter(
                  (load) =>
                    load &&
                    load.loadId &&
                    !completedStatuses.includes(load.transportStatus),
                ),
              ),
            )
            .catch(() => null),
          isCarrier
            ? api
                .get("/loads", { params: { bidStatus: "OPEN" } })
                .then((res) => setAvailable(res.data || []))
                .catch(() => null)
            : null,
        ].filter(Boolean)
      : [];

    await Promise.all([statsReq, ...carrierReqs]);
    setRefreshing(false);
    setBooted(true);
  }, [carrierSide, isCarrier]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  /** Where a dashboard tile or a More row sends you. */
  const open = useCallback(
    (key) => {
      switch (key) {
        case "licence":
          setShowLicense(true);
          break;
        case "alerts":
          setShowNotifications(true);
          break;
        // Open bids go to the Bids window, which opens on "Available". The Loads
        // screen has no "available" list, so sending it there showed nothing.
        case "available":
          setTab("bids");
          break;
        case "assigned":
        case "over":
        case "myBids":
          setLoadTab(key);
          setTab("loads");
          break;
        case "track":
          // Tracking is per-load; send them to the list to pick one.
          setLoadTab(carrierSide ? "assigned" : "all");
          setTab("loads");
          break;
        case "more":
          setTab("more");
          break;
        // Their own signed agreements, not a load list. This used to fall
        // through to the group below and land on Loads, which is why the tile
        // appeared to do nothing.
        case "documents":
          setShowDocuments(true);
          break;
        // Their roster and their cover. Both used to fall through to the group
        // below and land on Loads, which is why the tiles appeared inert.
        case "drivers":
          setShowDrivers(true);
          break;
        case "insurance":
          setShowInsurance(true);
          break;
        case "postLoad":
        case "quotes":
        case "payments":
        case "history":
        case "pending":
        case "bidding":
        case "loads":
        case "carriers":
          setTab("loads");
          break;
        default:
          setTab("home");
      }
    },
    [carrierSide],
  );

  // Tab sets differ by portal because the work differs. Drivers never bid, so
  // they are not given a Bids tab that would 403.
  const tabs = useMemo(() => {
    const alerts = { key: "alerts", label: "Alerts", icon: "bell", badge: unreadCount };
    const more = { key: "more", label: "More", icon: "more" };

    if (isShipper) {
      return [
        { key: "home", label: "Home", icon: "home" },
        { key: "loads", label: "Shipments", icon: "shipments" },
        alerts,
        more,
      ];
    }
    if (isCarrier) {
      return [
        { key: "home", label: "Home", icon: "home" },
        { key: "loads", label: "Loads", icon: "loads" },
        { key: "bids", label: "Bids", icon: "bid" },
        alerts,
        more,
      ];
    }
    return [
      { key: "home", label: "Home", icon: "home" },
      { key: "loads", label: "Loads", icon: "loads" },
      alerts,
      more,
    ];
  }, [isShipper, isCarrier, unreadCount]);

  // Segmented control inside the Loads tab.
  const loadSegments = useMemo(() => {
    if (!carrierSide) return [{ key: "all", label: "All" }];
    // No separate Available segment: bidding is one job with two halves —
    // what is open to bid on, and what has been bid on — and they are read
    // against each other. They live as sub-tabs inside My Bids.
    return [
      { key: "assigned", label: "Assigned" },
      !isDriver && { key: "myBids", label: "My Bids" },
      { key: "over", label: "Over" },
    ].filter(Boolean);
  }, [carrierSide, isDriver]);

  /* ---- Full-screen routes. These sit above the tab bar. ---- */

  if (showDocuments) {
    return <CarrierDocumentsScreen onBack={() => setShowDocuments(false)} />;
  }

  if (showDrivers) {
    return <CarrierDriversScreen onBack={() => setShowDrivers(false)} />;
  }

  if (showInsurance) {
    return <CarrierInsuranceScreen onBack={() => setShowInsurance(false)} />;
  }

  if (showNotifications) {
    return (
      <NotificationsScreen
        onBack={() => setShowNotifications(false)}
        onOpenLoad={() => setShowNotifications(false)}
      />
    );
  }

  if (showLicense) {
    return (
      <LicenseScreen
        onBack={() => setShowLicense(false)}
        onUpdated={(next) => setCompliance(next)}
      />
    );
  }

  if (selectedLoad) {
    return (
      <TrackingScreen
        load={selectedLoad}
        documentsOnly={selectedLoadMode?.documentsOnly}
        onBack={() => {
          setSelectedLoad(null);
          setSelectedLoadMode(null);
        }}
      />
    );
  }

  if (detailLoad) {
    return <LoadDetailScreen load={detailLoad} onBack={() => setDetailLoad(null)} />;
  }

  /* ---- Tabbed body ---- */

  const bell = () => setShowNotifications(true);

  let body;
  if (tab === "home") {
    body = booted ? (
      <Home
        session={session}
        theme={theme}
        stats={stats}
        loads={assigned}
        available={available}
        unread={unreadCount}
        refreshing={refreshing}
        onRefresh={loadDashboard}
        onBell={bell}
        onOpen={open}
        compliance={compliance}
      />
    ) : (
      <>
        <AppHeader theme={theme} title={theme.label} onBell={bell} unread={unreadCount} />
        <Loader label="Loading your dashboard…" />
      </>
    );
  } else if (tab === "alerts") {
    body = (
      <NotificationsScreen onBack={() => setTab("home")} onOpenLoad={() => setTab("loads")} />
    );
  } else if (tab === "more") {
    body = (
      <MoreScreen
        session={session}
        theme={theme}
        isDriver={isDriver}
        onLogout={onLogout}
        onOpen={open}
      />
    );
  } else if (tab === "bids") {
    body = (
      <>
        <AppHeader theme={theme} eyebrow="Bidding" title="My Bids" onBell={bell} unread={unreadCount} />
        <BidsTab onOpenDetail={setDetailLoad} />
      </>
    );
  } else {
    body = (
      <>
        <AppHeader
          theme={theme}
          eyebrow={isShipper ? "Your freight" : "Load board"}
          title={isShipper ? "Shipments" : "Loads"}
          onBell={bell}
          unread={unreadCount}
        >
          {loadSegments.length > 1 ? (
            <View style={styles.segments}>
              {loadSegments.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={() => setLoadTab(item.key)}
                  style={[styles.segment, loadTab === item.key && styles.segmentActive]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      loadTab === item.key && { color: theme.accentDark },
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </AppHeader>

        {/* Driver blocker, stated where they land rather than at the dock. */}
        {isDriver && compliance && !compliance.canUpdateLoads ? (
          <Pressable onPress={() => setShowLicense(true)} style={styles.complianceBanner}>
            <Icon name="warning" size={18} color={colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.complianceTitle}>
                Action needed before you can update loads
              </Text>
              <Text style={styles.complianceBody}>{compliance.message} Tap here to do it now.</Text>
            </View>
          </Pressable>
        ) : null}

        {loadTab === "assigned" && (
          <AssignedLoadsTab onTrack={openLoadScreen} onOpenDetail={setDetailLoad} />
        )}
        {loadTab === "myBids" && (
          <BidsTab
            onOpenAssigned={() => setLoadTab("assigned")}
            onOpenDetail={setDetailLoad}
          />
        )}
        {loadTab === "over" && (
          <OverLoadsTab onTrack={openLoadScreen} onOpenDetail={setDetailLoad} />
        )}
        {loadTab === "all" && (
          <LoadListTab
            params={undefined}
            emptyText={isShipper ? "No shipments yet." : "No loads to show."}
            onOpenDetail={setDetailLoad}
          />
        )}
      </>
    );
  }

  return (
    <View style={styles.shell}>
      <StatusBar style="light" />
      <UpdateBanner />
      {body}
      <BottomTabs tabs={tabs} active={tab} onChange={setTab} accent={theme.accent} />
    </View>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);
  // Which of the two signed-out screens to show. Reset on logout so the next
  // person to open the app lands on sign-in, not a half-filled signup form.

  useEffect(() => {
    getStoredSession()
      .then((stored) => setSession(stored))
      // A rejection here used to take the whole launch with it, with nothing on
      // screen and nothing recorded. Signed out is the safe way to fail.
      .catch(() => setSession(null))
      .finally(() => setBooting(false));
  }, []);

  // Registered once there is a session, not at launch: a permission prompt in
  // front of somebody who has not said who they are yet is one they decline,
  // and iOS only ever asks once. Re-run on every sign-in because the token has
  // to be attached to whoever is actually signed in on this handset.
  useEffect(() => {
    if (!session) return undefined;

    registerForPush();

    // Tapping an instant-dispatch offer should open the app on the load it is
    // about. There is no router here, so the payload is surfaced as an alert
    // that points at the right screen rather than silently doing nothing.
    return listenForNotificationTaps((data) => {
      if (data?.type === "INSTANT_DISPATCH_OFFERED" && data?.loadId) {
        Alert.alert(
          "Load offered to you",
          `${data.loadId} is available near one of your drivers. Open Loads to accept it before the offer closes.`,
        );
      }
    });
  }, [session]);

  const logout = async () => {
    // Before the session is cleared, while the request can still authenticate.
    // A token identifies a handset, not a person, and two drivers share a phone
    // often enough that leaving it registered would send one of them the
    // other's offers.
    await unregisterFromPush();

    const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(
      () => false,
    );
    if (running) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => null);
    }
    await AsyncStorage.removeItem(ACTIVE_TRACKING_LOAD_KEY);
    await clearSession();
    setSession(null);
  };

  if (booting) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!session) {
    return <LoginScreen onLogin={setSession} />;
  }

  // Carriers do not reach the load board until their agreements are signed.
  // Drivers pass straight through — they sign nothing.
  return (
    <CarrierDocumentationGate session={session} onLogout={logout}>
      <FleetHomeScreen session={session} onLogout={logout} />
    </CarrierDocumentationGate>
  );
}

const ANDROID_TOP_INSET =
  Platform.OS === "android" ? RNStatusBar.currentHeight || 0 : 0;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: ANDROID_TOP_INSET,
  },

  /* ── Shell ──────────────────────────────────────────────────────────── */
  shell: { flex: 1, backgroundColor: colors.background },

  /* ── Sign in ────────────────────────────────────────────────────────── */
  loginScreen: { flex: 1, backgroundColor: colors.background },
  loginHero: { paddingBottom: spacing.xxl, paddingTop: UI_TOP_INSET + spacing.xxl },
  loginBrandRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  loginMark: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  loginTagline: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 14.5,
    fontWeight: "600",
    marginTop: spacing.sm,
    letterSpacing: 0.4,
  },
  loginRoles: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  loginRoleChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  loginRoleChipText: { color: "#E2E2E2", fontSize: 13, fontWeight: "700" },
  loginBody: { flex: 1, marginTop: -spacing.xl },
  loginScroll: { padding: spacing.lg, paddingBottom: spacing.xxl },

  /* ── Segmented control in the Loads tab ─────────────────────────────── */
  segments: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: radius.sm,
    padding: 3,
    marginTop: spacing.md,
  },
  segment: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: radius.xs,
    alignItems: "center",
  },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { fontSize: 14, fontWeight: "700", color: "rgba(255,255,255,0.9)" },

  /* ── Driver compliance banner ───────────────────────────────────────── */
  complianceBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    margin: spacing.lg,
    marginBottom: 0,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningFaint,
    borderWidth: 1,
    borderColor: colors.warningLight,
  },
  complianceTitle: { fontSize: 15, fontWeight: "800", color: colors.warning },
  complianceBody: { fontSize: 14, color: colors.muted, marginTop: 2 },

  /* ── More tab ───────────────────────────────────────────────────────── */
  moreBody: { padding: spacing.lg, gap: spacing.lg },
  moreProfile: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...elevation.sm,
  },
  moreAvatar: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  moreAvatarText: { color: colors.onBrand, fontSize: 19, fontWeight: "800" },
  moreName: { ...typeScale.h3, color: colors.text },
  moreRole: { ...typeScale.caption, color: colors.muted, marginTop: 2 },
  moreCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...elevation.sm,
  },
  moreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  moreRowLast: { borderBottomWidth: 0 },
  moreRowText: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.text },

  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    padding: 20,
  },
  loginCard: {
    width: "100%",
    gap: 16,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    ...shadow,
  },
  // Sits on the navy hero, so it is painted for a dark ground.
  brand: {
    color: colors.onBrand,
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    marginTop: 3,
  },
  apiHint: {
    color: colors.muted,
    fontSize: 13,
    textAlign: "center",
  },
  field: {
    gap: 7,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    color: colors.text,
    fontSize: 16,
  },
  noteInput: {
    minHeight: 84,
    paddingTop: 10,
    textAlignVertical: "top",
  },
  button: {
    minHeight: 50,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    ...glow(colors.primary),
  },
  buttonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
    letterSpacing: 0.3,
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.primaryLight,
    backgroundColor: colors.primaryFaint,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontWeight: "800",
    fontSize: 15,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  tabs: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    borderRadius: radius.md,
    paddingVertical: 11,
    backgroundColor: colors.surfaceSunken,
  },
  tabActive: {
    backgroundColor: colors.primary,
    ...shadow,
  },
  tabText: {
    color: colors.muted,
    fontWeight: "800",
    fontSize: 14,
  },
  tabTextActive: {
    color: "#fff",
  },
  listContent: {
    padding: 16,
    paddingBottom: 28,
    gap: 12,
  },
  cardTitle: { fontSize: 17, fontWeight: "700", color: "#000000" },
  cardMeta: { fontSize: 14, color: "#767676", marginTop: 2 },
  cardBody: { fontSize: 15, color: "#444444", marginTop: 6, marginBottom: 10 },
  signedNote: { fontSize: 15, fontWeight: "600", color: "#16a34a", marginVertical: 8 },
  gateFooter: { fontSize: 14, color: "#767676", marginVertical: 12, textAlign: "center" },
  label: { fontSize: 14, fontWeight: "700", color: "#444444", marginTop: 8, marginBottom: 4 },
  ackRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 8 },
  ackBox: { fontSize: 18, marginRight: 8, color: "#000000" },
  ackText: { flex: 1, fontSize: 15, color: "#444444" },
  notifHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  notifRow: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },
  notifUnread: { borderLeftWidth: 4, borderLeftColor: "#000000", backgroundColor: "#F6F6F6" },
  notifTitle: { fontSize: 16, fontWeight: "700", color: "#000000" },
  notifBody: { fontSize: 15, color: "#444444", marginTop: 2 },
  notifMeta: { fontSize: 13, color: "#767676", marginTop: 6 },
  empty: {
    color: colors.muted,
    fontWeight: "700",
    textAlign: "center",
    paddingVertical: 40,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
    gap: 12,
    overflow: "hidden",
    ...elevation.md,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  loadId: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  muted: {
    color: colors.muted,
    fontSize: 15,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 2,
  },
  summaryItem: {
    width: "50%",
    paddingVertical: 4,
    paddingRight: 8,
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  summaryValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  metaText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  pill: {
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 13,
    fontWeight: "900",
  },
  bidRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  },
  // Staff counter-offer awaiting this carrier's answer.
  offerBox: {
    marginTop: 10,
    marginBottom: 4,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#F6F6F6",
    borderWidth: 1,
    borderColor: "#E2E2E2",
    gap: 6,
  },
  offerTitle: {
    color: "#000000",
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  bbCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    marginBottom: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E2E2",
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  bbCardLive: { borderColor: "#FCA5A5" },
  bbHeader: {
    flexDirection: "row",
    alignItems: "center",
    // GradientHeader is built for the top of a screen: it adds the status-bar
    // inset and rounds only its bottom corners. Neither belongs on a card.
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 18,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  bbLoadId: { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: 0.3 },
  bbType: { color: "rgba(255,255,255,0.8)", fontSize: 14, fontWeight: "600", marginTop: 2 },
  bbRateLabel: { color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  bbRate: { color: "#fff", fontSize: 28, fontWeight: "900" },
  bbBody: { padding: 18, gap: 16 },
  bbClock: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    backgroundColor: "#F6F6F6",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  bbClockUrgent: { backgroundColor: "#FEF2F2" },
  bbClockText: { color: "#000000", fontSize: 14, fontWeight: "800" },
  routeWrap: { flexDirection: "row", gap: 12 },
  routeRail: { alignItems: "center", paddingTop: 4, width: 14 },
  routeDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 3, borderColor: "#fff", elevation: 2 },
  routeDash: {
    flex: 1,
    width: 0,
    borderLeftWidth: 2,
    borderStyle: "dashed",
    borderColor: "#D6D6D6",
    marginVertical: 3,
  },
  routeTag: { color: "#A6A6A6", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  routeCity: { color: "#000000", fontSize: 19, fontWeight: "800" },
  routeSub: { color: "#787878", fontSize: 13, fontWeight: "600", marginTop: 1 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  infoChip: {
    backgroundColor: "#F6F6F6",
    borderWidth: 1,
    borderColor: "#E2E2E2",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: "48%",
  },
  infoChipLabel: { color: "#A6A6A6", fontSize: 10, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase" },
  infoChipValue: { color: "#000000", fontSize: 14, fontWeight: "700" },
  bbOffer: {
    borderRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#E2E2E2",
    overflow: "hidden",
  },
  bbOfferTag: { color: "#000000", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  bbOfferAmount: { color: "#000000", fontSize: 34, fontWeight: "900", marginTop: 4 },
  bbOfferNote: { color: "#585858", fontSize: 14, fontWeight: "600", marginTop: 2 },
  bbActions: { flexDirection: "row", gap: 10, marginTop: 14 },
  bbDecline: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#FCA5A5",
  },
  bbDeclineText: { color: "#DC2626", fontSize: 16, fontWeight: "800" },
  bbAccept: {
    flex: 2,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: "#16A34A",
    shadowColor: "#16A34A",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  bbAcceptText: { color: "#fff", fontSize: 17, fontWeight: "900" },
  bbBidBox: { backgroundColor: "#F8FAFF", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#EEEEEE" },
  bbBidTag: { color: "#000000", fontSize: 12, fontWeight: "900", letterSpacing: 1, marginBottom: 8 },
  bbBidRow: { flexDirection: "row", gap: 10 },
  bbInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#E2E2E2",
    paddingHorizontal: 12,
  },
  bbDollar: { color: "#000000", fontSize: 20, fontWeight: "900", marginRight: 4 },
  bbInput: { flex: 1, fontSize: 20, fontWeight: "800", color: "#000000", paddingVertical: 10 },
  bbBidBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#000000",
    borderRadius: 12,
    paddingHorizontal: 16,
    shadowColor: "#000000",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  bbBidBtnText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  bbQuickRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  bbQuick: {
    flex: 1,
    alignItems: "center",
    borderRadius: 10,
    paddingVertical: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#EEEEEE",
  },
  bbQuickText: { color: "#000000", fontSize: 14, fontWeight: "800" },
  bbDetails: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingTop: 4,
  },
  bbDetailsText: { color: "#000000", fontSize: 15, fontWeight: "800" },
  documentCameraButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#000000",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  documentCameraText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  trHero: {
    paddingTop: UI_TOP_INSET + 10,
    paddingBottom: 22,
    paddingHorizontal: 18,
  },
  trTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  trBack: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  trGps: { borderRadius: 999 },
  trGpsOn: {},
  trGpsOff: { backgroundColor: "#FEF3C7", paddingHorizontal: 12, paddingVertical: 5 },
  trGpsOffText: { color: "#B45309", fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  trEyebrow: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "800", letterSpacing: 1.5 },
  trLoadId: { color: "#fff", fontSize: 28, fontWeight: "900" },
  trStatus: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  trStatusText: { fontSize: 13, fontWeight: "900" },
  trRouteCard: { backgroundColor: "#fff", borderRadius: 18, padding: 16, marginTop: 16 },
  trBody: { padding: 16, gap: 16 },
  trCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: "#E2E2E2",
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  trCardTitle: { color: "#000000", fontSize: 19, fontWeight: "900" },
  trMuted: { color: "#787878", fontSize: 14, fontWeight: "600" },
  trSteps: { flexDirection: "row", marginTop: 4 },
  trStep: { flex: 1, alignItems: "center" },
  trStepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#E2E2E2",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  trStepDotDone: { backgroundColor: "#22C55E" },
  trStepDotCurrent: { backgroundColor: "#000000", borderWidth: 3, borderColor: "#E2E2E2" },
  trStepLine: { position: "absolute", top: 12, left: "50%", right: "-50%", height: 3, backgroundColor: "#E2E2E2" },
  trStepLineDone: { backgroundColor: "#22C55E" },
  trStepLabel: { color: "#787878", fontSize: 11, fontWeight: "700", textAlign: "center", marginTop: 6 },
  trIconBubble: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  trTrackingOn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ECFDF3",
    borderRadius: 12,
    padding: 12,
  },
  trTrackingOnText: { color: "#15803D", fontSize: 15, fontWeight: "800" },
  trBigBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 16,
    shadowColor: "#000000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  trBigBtnText: { color: "#fff", fontSize: 17, fontWeight: "900" },
  trPicker: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#E2E2E2",
    backgroundColor: "#F8FAFF",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  trPickerChosen: { borderColor: "#000000", backgroundColor: "#F6F6F6" },
  trPickerLabel: { color: "#000000", fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  trPickerValue: { color: "#000000", fontSize: 18, fontWeight: "900", marginTop: 2 },
  trPanel: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#F6F6F6",
    borderWidth: 1,
    borderColor: "#E2E2E2",
  },
  trPanelDone: { backgroundColor: "#ECFDF3", borderColor: "#BBF7D0" },
  trPanelTitle: { color: "#000000", fontSize: 16, fontWeight: "900", marginBottom: 2 },
  trThumbWrap: { marginRight: 10 },
  trThumb: { width: 76, height: 76, borderRadius: 12, backgroundColor: "#E2E2E2" },
  trThumbX: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
  },
  trBtnRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  trBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  trBtnPrimary: { backgroundColor: "#000000", flex: 2 },
  trBtnPrimaryText: { color: "#fff", fontSize: 15, fontWeight: "900" },
  trBtnGhost: { backgroundColor: "#fff", borderWidth: 1.5, borderColor: "#E2E2E2", flex: 1 },
  trBtnGhostText: { color: "#000000", fontSize: 15, fontWeight: "900" },
  trNote: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E2E2",
    backgroundColor: "#F6F6F6",
    padding: 14,
    minHeight: 70,
    fontSize: 15,
    color: "#000000",
    textAlignVertical: "top",
  },
  trDocCount: { backgroundColor: "#F6F6F6", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  trDocCountText: { color: "#000000", fontSize: 14, fontWeight: "900" },
  trProgressTrack: { height: 8, borderRadius: 4, backgroundColor: "#E2E2E2", overflow: "hidden" },
  trProgressFill: { height: 8, borderRadius: 4, backgroundColor: "#22C55E" },
  regCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#E2E2E2",
    backgroundColor: "#F6F6F6",
  },
  regCtaTitle: { color: "#000000", fontSize: 16, fontWeight: "900" },
  regCtaSub: { color: "#585858", fontSize: 13, fontWeight: "600", marginTop: 1 },
  regHero: { paddingTop: UI_TOP_INSET + 10, paddingBottom: 24, paddingHorizontal: 18 },
  regBack: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  regTitle: { color: "#fff", fontSize: 24, fontWeight: "900" },
  regSub: { color: "rgba(255,255,255,0.75)", fontSize: 14, fontWeight: "600", marginTop: 2 },
  regTag: { fontSize: 10, fontWeight: "900", letterSpacing: 0.6, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: "hidden" },
  regTagTodo: { backgroundColor: "#FEF3C7", color: "#92400E" },
  regTagDone: { backgroundColor: "#DCFCE7", color: "#15803D" },
  regInputTodo: { borderColor: "#FBBF24", backgroundColor: "#FFFBEB" },
  regInputError: { borderColor: "#EF4444", borderWidth: 2, backgroundColor: "#FEF2F2" },
  regError: { color: "#DC2626", fontSize: 14, fontWeight: "800", marginTop: 6 },
  regChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  regChip: { borderRadius: 999, borderWidth: 1.5, borderColor: "#D6D6D6", paddingHorizontal: 14, paddingVertical: 8, backgroundColor: "#fff" },
  regChipOn: { borderColor: "#000000", backgroundColor: "#F6F6F6" },
  regChipText: { color: "#444444", fontSize: 14, fontWeight: "700" },
  regChipTextOn: { color: "#000000" },
  regFoot: { color: "#787878", fontSize: 13, fontWeight: "600", textAlign: "center", marginTop: 12, lineHeight: 19 },
  regDoneIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginTop: 30,
  },
  regDoneTitle: { color: "#fff", fontSize: 26, fontWeight: "900", textAlign: "center", marginTop: 16 },
  regDoneBody: { color: "rgba(255,255,255,0.85)", fontSize: 15, fontWeight: "600", textAlign: "center", marginTop: 10, lineHeight: 22 },
  amountBadge: {
    alignItems: "flex-end",
    backgroundColor: "#ECFDF3",
    borderColor: "#BBF7D0",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  amountText: {
    color: "#15803d",
    fontSize: 22,
    fontWeight: "900",
  },
  amountLabel: {
    color: "#15803d",
    fontSize: 12,
    fontWeight: "700",
  },
  offerAmount: {
    color: "#000000",
    fontSize: 22,
    fontWeight: "900",
  },
  bidInput: {
    flex: 1,
    minWidth: 120,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  gridButton: {
    flexGrow: 1,
    flexBasis: "47%",
  },
  screenContent: {
    padding: 16,
    paddingBottom: 30,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
  },
  docTypesHeader: {
    marginBottom: 10,
  },
  uploadList: {
    gap: 10,
  },
  docChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 13,
    fontWeight: "900",
    overflow: "hidden",
  },
  paperworkBanner: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    gap: 4,
  },
  paperworkBannerTitle: {
    fontSize: 15,
    fontWeight: "900",
  },
  paperworkBannerBody: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
  },
  paperworkBannerHint: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 2,
  },
  documentCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: "#fff",
    padding: 12,
    gap: 10,
  },
  documentUploadButtonLocked: {
    backgroundColor: "#F4F4F4",
    borderColor: colors.border,
  },
  documentUploadTextLocked: {
    color: colors.muted,
  },
  documentCardUploaded: {
    borderColor: "#bbf7d0",
    backgroundColor: "#f0fdf4",
  },
  documentCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  documentTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  documentSubtitle: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 3,
  },
  documentActions: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  },
  documentActionButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  documentActionButtonDisabled: {
    borderColor: "#E2E2E2",
    backgroundColor: "#F6F6F6",
  },
  documentActionText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "800",
  },
  documentActionTextDisabled: {
    color: "#A6A6A6",
  },
  documentUploadButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  documentUploadText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  signatureHeader: {
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  signatureScreen: {
    flex: 1,
  },
  capacityNotice: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#fcd34d",
    backgroundColor: "#fffbeb",
    padding: 14,
    marginBottom: 12,
  },
  capacityTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#92400e",
    marginBottom: 4,
  },
  capacityBody: {
    fontSize: 14,
    color: "#b45309",
    lineHeight: 19,
  },
  signatureReceiver: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.muted,
    marginBottom: 6,
  },
  signaturePadWrap: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  signaturePad: {
    flex: 1,
    width: "100%",
    minHeight: 320,
  },
  signatureActions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  savingOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0, 0.48)",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  savingText: {
    color: "#fff",
    fontWeight: "800",
  },

  // ── Status chip ──
  statusChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
    maxWidth: 170,
  },
  statusChipText: {
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },

  // ── Tappable card ──
  cardTapArea: {
    gap: 12,
  },
  detailHint: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "800",
  },

  // ── Status picker field + modal ──
  pickerField: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pickerFieldText: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: "700",
  },
  pickerChevron: {
    color: colors.muted,
    fontSize: 18,
    fontWeight: "900",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0, 0.45)",
    justifyContent: "flex-end",
  },
  pickerSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 28,
    gap: 12,
  },
  pickerList: {
    maxHeight: 380,
  },
  stFieldBlock: {
    paddingVertical: 8,
  },
  stFieldLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 6,
  },
  stOptionList: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#E2E2E2",
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  // Capped rather than free-running: the state list is fifty-one rows and would
  // otherwise push the rest of the form off the bottom of the screen.
  schemaOptionList: {
    marginTop: 6,
    maxHeight: 220,
    borderWidth: 1,
    borderColor: "#E2E2E2",
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  removeLink: { fontSize: 14, fontWeight: "700", color: colors.danger },
  requiredStar: { color: colors.danger, fontWeight: "900" },
  updateBanner: {
    backgroundColor: colors.brand,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  updateBannerText: {
    color: colors.onBrand,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  inputInvalid: { borderColor: colors.danger, borderWidth: 1.5 },
  fieldError: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "700",
    color: colors.danger,
  },
  copyChip: {
    alignSelf: "flex-start",
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F6F6F6",
    borderWidth: 1,
    borderColor: "#E2E2E2",
  },
  copyChipText: { fontSize: 14, fontWeight: "700", color: "#000000" },
  subTabRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  subTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "#E2E2E2",
  },
  subTabActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  subTabText: { fontSize: 15, fontWeight: "700", color: colors.muted },
  subTabTextActive: { color: colors.onBrand },
  stOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
  },
  pickerRowText: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  pickerRowNote: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },

  // ── Detail screen ──
  detailSection: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
    gap: 6,
    ...shadow,
  },
  detailSectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 4,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
    flexShrink: 0,
    maxWidth: "50%",
  },
  detailValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "right",
    flex: 1,
  },
  detailValueNode: {
    flex: 1,
    alignItems: "flex-end",
  },
  detailParagraph: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 19,
    backgroundColor: "#F6F6F6",
    borderWidth: 1,
    borderColor: "#EEEEEE",
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
  },
  stopBlock: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    gap: 3,
    backgroundColor: "#fbfdff",
  },
  stopTitle: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "900",
  },
  stopCompany: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  stopMetaGrid: {
    marginTop: 6,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
  },
  historyTime: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
  },
  docViewLink: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "800",
  },
});
