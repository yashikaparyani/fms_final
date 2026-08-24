import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  BottomTabs,
  GradientHeader,
  Icon,
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

const completedStatuses = [
  "DELIVERED",
  "TERMINATED",
  "STREET_TURN",
  "EMPTY_IN_YARD",
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
  LOAD_PLANNER: { bg: "#ede9fe", color: "#7c3aed", border: "#c4b5fd" },
  NEW_LOAD: { bg: "#dbeafe", color: "#1d4ed8", border: "#93c5fd" },
  ASSIGNED: { bg: "#dcfce7", color: "#15803d", border: "#bbf7d0" },
  READY_TO_PICKUP: { bg: "#e0f2fe", color: "#0369a1", border: "#7dd3fc" },
  PICKED_UP: { bg: "#cffafe", color: "#0e7490", border: "#67e8f9" },
  IN_TRANSIT: { bg: "#fef9c3", color: "#a16207", border: "#fde047" },
  REACHED_DESTINATION: { bg: "#dcfce7", color: "#15803d", border: "#bbf7d0" },
  DELIVERED: { bg: "#dcfce7", color: "#15803d", border: "#bbf7d0" },
  TERMINATED: { bg: "#fee2e2", color: "#dc2626", border: "#fca5a5" },
  PAPERWORK_PENDING: { bg: "#fef9c3", color: "#a16207", border: "#fde047" },
  INVOICED: { bg: "#ede9fe", color: "#7c3aed", border: "#c4b5fd" },
  STREET_TURN: { bg: "#f0fdf4", color: "#166534", border: "#bbf7d0" },
  EMPTY_IN_YARD: { bg: "#f3f4f6", color: "#6b7280", border: "#e5e7eb" },
  LOADED_IN_YARD: { bg: "#fdf4ff", color: "#86198f", border: "#f0abfc" },
  DRIVER_ON_WAITING: { bg: "#fff7ed", color: "#c2410c", border: "#fdba74" },
  DROP_IN_WAREHOUSE: { bg: "#faf5ff", color: "#6b21a8", border: "#d8b4fe" },
};

const LOAD_STATUS_COLOR = {
  DRAFT: { bg: "#f3f4f6", color: "#6b7280", border: "#e5e7eb" },
  PENDING_VERIFICATION: { bg: "#fef9c3", color: "#a16207", border: "#fde047" },
  REQUIRES_CHANGES: { bg: "#fee2e2", color: "#dc2626", border: "#fca5a5" },
  VERIFIED: { bg: "#dcfce7", color: "#15803d", border: "#bbf7d0" },
  ASSIGNED: { bg: "#dcfce7", color: "#15803d", border: "#bbf7d0" },
  REJECTED: { bg: "#fee2e2", color: "#dc2626", border: "#fca5a5" },
};

const BID_STATUS_COLOR = {
  UPCOMING: { bg: "#e0f2fe", color: "#0369a1", border: "#7dd3fc" },
  OPEN: { bg: "#dcfce7", color: "#15803d", border: "#bbf7d0" },
  CLOSED: { bg: "#f3f4f6", color: "#6b7280", border: "#e5e7eb" },
};

const STATUS_FALLBACK = { bg: "#f3f4f6", color: "#6b7280", border: "#e5e7eb" };

const uploadableDocumentTypes = [
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
    default: { backgroundColor: "#eef2f7", color: colors.muted, borderColor: "#dbe3ee" },
    success: { backgroundColor: "#dcfce7", color: colors.success, borderColor: "#bbf7d0" },
    warning: { backgroundColor: "#fef3c7", color: colors.warning, borderColor: "#fde68a" },
    muted: { backgroundColor: "#f8fafc", color: "#64748b", borderColor: "#e2e8f0" },
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
  onUpload,
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
          <Pressable onPress={onUpload} style={styles.documentUploadButton} disabled={false}>
            <Text style={styles.documentUploadText}>{uploaded ? "Replace" : "Upload"}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

const labelize = (value) =>
  value ? value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "-";

const money = (value) =>
  value || value === 0 ? `$ ${Number(value).toLocaleString()}` : "-";

const fmtDate = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

const fmtDateTime = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
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
    default: { backgroundColor: "#eef2f7", color: colors.muted },
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
        placeholderTextColor="#98a2b3"
      />
    </View>
  );
}

function LoginScreen({ onLogin }) {
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

  return (
    <View style={styles.loginScreen}>
      <StatusBar style="light" />
      {/* Brand block on the deep navy, sign-in on white beneath it — the
          split the marketing screens use, so the app opens on-brand. */}
      <GradientHeader from="#07152E" to="#16386F" style={styles.loginHero}>
        <View style={styles.loginBrandRow}>
          <View style={styles.loginMark}>
            <Icon name="truck" size={26} color={colors.onBrand} />
          </View>
          <Text style={styles.brand}>
            {brand.name}
            <Text style={{ color: "#5EA8FF" }}>{brand.nameAccent}</Text>
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

function LoadCard({ load, children, onPress }) {
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
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={styles.loadId}>{load.loadId}</Text>
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
        <Text style={styles.metaText}>
          {load.carrierPayout != null
            ? money(load.carrierPayout)
            : money(load.winningBid?.amount ?? load.vendorRate)}
          {PAYOUT_LABEL[load.carrierPayoutSource]
            ? ` (${PAYOUT_LABEL[load.carrierPayoutSource]})`
            : ""}
        </Text>
      </View>
    </>
  );

  return (
    <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: statusTone.color }]}>
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

function AvailableBidsTab({ onOpenAssigned, onOpenDetail }) {
  const [loads, setLoads] = useState([]);
  const [amountByLoad, setAmountByLoad] = useState({});
  const [loading, setLoading] = useState(false);

  const fetchLoads = async () => {
    try {
      setLoading(true);
      const res = await api.get("/loads", { params: { bidStatus: "OPEN" } });
      setLoads(res.data || []);
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

  return (
    <FlatList
      data={loads.filter((item) => item && item.loadId)}
      keyExtractor={(item, index) => String(item._id || item.loadId || index)}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchLoads} />}
      ListEmptyComponent={
        <Text style={styles.empty}>{loading ? "Loading open bids..." : "No open bids right now."}</Text>
      }
      renderItem={({ item }) => (
        <LoadCard load={item} onPress={() => onOpenDetail(item)}>
          <View style={styles.bidRow}>
            <TextInput
              value={amountByLoad[item.loadId] || ""}
              onChangeText={(text) =>
                setAmountByLoad((prev) => ({ ...prev, [item.loadId]: text }))
              }
              keyboardType="numeric"
              placeholder="Your bid"
              style={[styles.input, styles.bidInput]}
              placeholderTextColor="#98a2b3"
            />
            <PrimaryButton title="Bid" onPress={() => placeBid(item.loadId)} />
          </View>
          <SecondaryButton title="View assigned loads" onPress={onOpenAssigned} />
        </LoadCard>
      )}
      contentContainerStyle={styles.listContent}
    />
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
                  placeholderTextColor="#98a2b3"
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
            <SecondaryButton title="View documents" onPress={() => onTrack(item)} />
          </View>
        </LoadCard>
      )}
      contentContainerStyle={styles.listContent}
    />
  );
}

function SignatureModal({ visible, onClose, onSigned }) {
  const signatureRef = useRef(null);

  const handleSave = () => {
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
        <View style={styles.signaturePadWrap}>
          <Signature
            ref={signatureRef}
            onOK={(signature) => {
              onSigned(signature);
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
              ".m-signature-pad { box-shadow: none; border: 0; } .m-signature-pad--body { border: 1px solid #d9e2ec; border-radius: 14px; }"
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
                  placeholderTextColor="#98a2b3"
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

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.safeContent}>
        <View style={styles.topBar}>
          <SecondaryButton title="Back" onPress={onBack} />
          {loading ? <ActivityIndicator color={colors.primary} /> : <View />}
        </View>

        {/* Header */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={styles.loadId}>{load.loadId}</Text>
              <Text style={styles.muted}>
                {load.pickup?.city || "-"} to {load.drop?.city || "-"}
              </Text>
            </View>
          </View>
          <View style={styles.chipRow}>
            <StatusChip value={load.transportStatus} />
            {!!load.status && <StatusChip value={load.status} map={LOAD_STATUS_COLOR} />}
            {!!load.bidStatus && (
              <StatusChip value={load.bidStatus} map={BID_STATUS_COLOR} />
            )}
          </View>
        </View>

        <DetailSection title="Identification">
          <DetailRow label="Load ID" value={load.loadId} />
          <DetailRow
            label="Assigned Fleet Owner"
            value={load.assignedFleetOwner?.fleetOwnerName}
          />
          <DetailRow
            label="Assigned On"
            value={fmtDateTime(load.assignedFleetOwner?.assignedAt)}
          />
        </DetailSection>

        <DetailSection title="Container">
          <DetailRow label="Container #" value={load.containerNo} />
          <DetailRow label="Container Type" value={load.containerType} />
          <DetailRow label="Chassis #" value={load.chassisNo} />
          <DetailRow label="Chassis Company" value={load.chassisCompany} />
        </DetailSection>

        <DetailSection title={`Origin(s) — ${pickups.length}`}>
          {pickups.length === 0 ? (
            <Text style={styles.muted}>No origin added yet.</Text>
          ) : (
            pickups.map((p, i) => (
              <StopBlock key={i} stop={p} index={i} kind="pickup" />
            ))
          )}
        </DetailSection>

        <DetailSection title={`Destination(s) — ${drops.length}`}>
          {drops.length === 0 ? (
            <Text style={styles.muted}>No destination added yet.</Text>
          ) : (
            drops.map((d, i) => (
              <StopBlock key={i} stop={d} index={i} kind="drop" />
            ))
          )}
        </DetailSection>

        <DetailSection title={`Status Update — ${history.length}`}>
          {history.length === 0 ? (
            <Text style={styles.muted}>No status history available.</Text>
          ) : (
            history.map((entry, i) => (
              <View key={i} style={styles.historyRow}>
                <StatusChip value={entry.status || entry.transportStatus} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyTime}>
                    {fmtDateTime(entry.changedAt || entry.timestamp || entry.updatedAt)}
                  </Text>
                  {!!(entry.note || entry.comment) && (
                    <Text style={styles.muted}>{entry.note || entry.comment}</Text>
                  )}
                  {!!entry.location?.address && (
                    <Text style={styles.muted}>{entry.location.address}</Text>
                  )}
                </View>
              </View>
            ))
          )}
        </DetailSection>

        <DetailSection title="Live Tracking">
          <DetailRow
            label="Status"
            value={labelize(load.liveTracking?.status || "NOT_STARTED")}
          />
          <DetailRow
            label="Last Location"
            value={
              lastLocation
                ? `${Number(lastLocation.latitude).toFixed(5)}, ${Number(
                    lastLocation.longitude,
                  ).toFixed(5)}`
                : "-"
            }
          />
          <DetailRow
            label="Last Update"
            value={fmtDateTime(load.liveTracking?.lastHeartbeatAt)}
          />
        </DetailSection>

        <DetailSection title="Financials">
          <DetailRow
            label="Your Payout"
            value={
              load.carrierPayout != null
                ? `${money(load.carrierPayout)}${
                    PAYOUT_LABEL[load.carrierPayoutSource]
                      ? ` (${PAYOUT_LABEL[load.carrierPayoutSource]})`
                      : ""
                  }`
                : money(load.vendorRate)
            }
          />
          <DetailRow
            label="Winning Bid"
            value={load.winningBid?.amount != null ? money(load.winningBid.amount) : "-"}
          />
          <DetailRow label="Winning Fleet Owner" value={load.winningBid?.fleetOwnerName} />
        </DetailSection>

        <DetailSection title="Equipment & Cargo">
          <DetailRow label="Load Type" value={load.truckType} />
          <DetailRow label="Driver Requirement" value={load.driverRequirement} />
          <DetailRow label="Material" value={load.material} />
          <DetailRow label="Commodity" value={load.commodity} />
          <DetailRow label="Seal #" value={load.sealNo} />
          <DetailRow label="Booking #" value={load.bookingNo} />
          <DetailRow label="Pickup #" value={load.pickupNo} />
          <DetailRow label="Shipping Line" value={load.shippingLine} />
          <DetailRow label="Last Free Date" value={fmtDate(load.lastFreeDate)} />
        </DetailSection>

        <DetailSection title="Routing">
          <DetailRow label="Pier Termination" value={load.pierTermination} />
          <DetailRow label="Empty Return" value={load.emptyReturn} />
          {contactPersons.length === 0 ? (
            <DetailRow label="Contact Person(s)" value="-" />
          ) : (
            contactPersons.map((c, i) => (
              <View key={i} style={styles.stopBlock}>
                <Text style={styles.stopCompany}>{c.name || "-"}</Text>
                {!!c.phone && <Text style={styles.muted}>{c.phone}</Text>}
                {!!c.email && <Text style={styles.muted}>{c.email}</Text>}
              </View>
            ))
          )}
        </DetailSection>

        <DetailSection title="Bid & Assignment">
          <DetailRow
            label="Bid Status"
            value={<StatusChip value={load.bidStatus} map={BID_STATUS_COLOR} />}
          />
          <DetailRow label="Bid Start" value={fmtDateTime(load.bidStartTime)} />
          <DetailRow label="Bid End" value={fmtDateTime(load.bidEndTime)} />
        </DetailSection>

        <DetailSection title="Description & Remarks">
          <Text style={styles.detailLabel}>Description</Text>
          <Text style={styles.detailParagraph}>{load.description || "-"}</Text>
          <Text style={[styles.detailLabel, { marginTop: 10 }]}>Remarks</Text>
          <Text style={styles.detailParagraph}>{load.remarks || "-"}</Text>
        </DetailSection>

        <DetailSection title={`Documents — ${documents.length}`}>
          {documents.length === 0 ? (
            <Text style={styles.muted}>No documents on this load.</Text>
          ) : (
            documents.map((doc, i) => (
              <Pressable
                key={i}
                onPress={() => openDocument(doc.filePath)}
                style={({ pressed }) => [styles.docRow, { opacity: pressed ? 0.6 : 1 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailValue}>{doc.documentType}</Text>
                  <Text style={styles.muted} numberOfLines={1}>
                    {doc.fileName || "-"}
                  </Text>
                  <Text style={styles.muted}>{fmtDate(doc.dateReceived)}</Text>
                </View>
                <Text style={styles.docViewLink}>View ›</Text>
              </Pressable>
            ))
          )}
        </DetailSection>
      </ScrollView>
    </SafeAreaView>
  );
}

function TrackingScreen({ load: initialLoad, onBack }) {
  const [load, setLoad] = useState(initialLoad);
  const [tracking, setTracking] = useState(null);
  const [position, setPosition] = useState(null);
  const [note, setNote] = useState("");
  const [proofImages, setProofImages] = useState([]);
  const [signatureData, setSignatureData] = useState("");
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [streetTurnOpen, setStreetTurnOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const watcherRef = useRef(null);
  const pendingDeliveryStatusRef = useRef(null);

  const isTrackingActive = tracking?.status === "ACTIVE";

  // ── One-way status progression + multi-origin pickup ─────────────────────
  const originCount = load?.pickups?.length || 1;
  const pickedUpCount = (load?.transportStatusHistory || []).filter(
    (h) => h.status === "PICKED_UP",
  ).length;
  const canExtraPickup = originCount >= 2 && pickedUpCount < originCount;
  const currentStatusIdx = MAIN_ORDER.indexOf(load?.transportStatus);
  const isStatusLocked = (status) => {
    const idx = MAIN_ORDER.indexOf(status);
    if (idx === -1) return false; // side statuses always available
    if (status === "PICKED_UP" && canExtraPickup) return false;
    return idx <= currentStatusIdx;
  };

  const fetchLoad = async () => {
    const res = await api.get(`/loads/${initialLoad.loadId}`);
    setLoad(res.data);
  };

  const fetchTracking = async () => {
    const res = await api.get(`/tracking/${initialLoad.loadId}`);
    setTracking(res.data);
  };

  useEffect(() => {
    fetchLoad().catch(() => null);
    fetchTracking().catch(() => null);

    return () => {
      watcherRef.current?.remove?.();
    };
  }, [initialLoad.loadId]);

  const requestCurrentPosition = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") {
      throw new Error("Location permission is compulsory to pick up and track this load.");
    }

    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Highest,
    });
    setPosition(current);
    return current;
  };

  const syncPosition = async (current) => {
    const payload = toLocationPayload(current);
    await api.post(`/tracking/${load.loadId}/location`, payload);
    setTracking((prev) => ({
      ...(prev || {}),
      status: "ACTIVE",
      lastLocation: payload,
      lastHeartbeatAt: payload.recordedAt,
      recentLocations: [...(prev?.recentLocations || []), payload].slice(-100),
    }));
  };

  const startBackgroundTracking = async () => {
    const backgroundPermission = await Location.requestBackgroundPermissionsAsync();
    if (backgroundPermission.status !== "granted") {
      Alert.alert(
        "Background tracking not enabled",
        "Live tracking will continue while the app is open. Enable background location in settings for locked-screen tracking.",
      );
      return;
    }

    await AsyncStorage.setItem(ACTIVE_TRACKING_LOAD_KEY, load.loadId);
    const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
    if (!alreadyRunning) {
      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        accuracy: Location.Accuracy.Highest,
        timeInterval: LOCATION_UPDATE_INTERVAL_MS,
        distanceInterval: LOCATION_DISTANCE_INTERVAL_METERS,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "FMSS live tracking",
          notificationBody: `Sharing location for ${load.loadId}`,
        },
      });
    }
  };

  const stopBackgroundTracking = async () => {
    const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
    if (running) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
    await AsyncStorage.removeItem(ACTIVE_TRACKING_LOAD_KEY);
  };

  const startTracking = async () => {
    try {
      setSaving(true);
      const current = await requestCurrentPosition();
      const payload = toLocationPayload(current);
      const res = await api.post(`/tracking/${load.loadId}/start`, payload);
      setTracking(res.data.data);
      await startBackgroundTracking();

      watcherRef.current?.remove?.();
      watcherRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Highest,
          timeInterval: LOCATION_UPDATE_INTERVAL_MS,
          distanceInterval: LOCATION_DISTANCE_INTERVAL_METERS,
        },
        (nextPosition) => {
          setPosition(nextPosition);
          syncPosition(nextPosition).catch(() => null);
        },
      );

      Alert.alert("Live tracking started", "Keep the app open while the load is in transit.");
    } catch (error) {
      Alert.alert("Tracking required", error.response?.data?.message || error.message);
    } finally {
      setSaving(false);
    }
  };

  const pickProofImages = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== "granted") {
      Alert.alert("Camera permission required", "Camera access is required for pickup proof.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: false,
    });

    if (!result.canceled) {
      setProofImages((prev) => [...prev, ...result.assets]);
    }
  };

  const updateStatus = async (
    status,
    signatureOverride = signatureData,
    streetTurnOverride = null,
  ) => {
    try {
      // Forward-only: block moving back to an already-passed stage.
      if (isStatusLocked(status)) {
        Alert.alert(
          "Not allowed",
          `This load has already passed "${labelize(status)}". Status can't move backward.`,
        );
        return;
      }

      // Multi-origin pickup: confirm which origin this pickup is for.
      if (status === "PICKED_UP" && canExtraPickup && pickedUpCount >= 1) {
        const originNo = pickedUpCount + 1;
        const confirmed = await new Promise((resolve) => {
          Alert.alert(
            "Confirm origin",
            `Is this the pickup for origin #${originNo}?`,
            [
              { text: "No", style: "cancel", onPress: () => resolve(false) },
              { text: "Yes", onPress: () => resolve(true) },
            ],
            { cancelable: false },
          );
        });
        if (!confirmed) return;
      }

      if (["PICKED_UP", "IN_TRANSIT"].includes(status) && !isTrackingActive) {
        Alert.alert("Start live tracking", "Live GPS sharing is compulsory from pickup.");
        return;
      }

      if (status === "PICKED_UP" && proofImages.length === 0) {
        Alert.alert("Pickup proof required", "Capture at least one pickup proof image.");
        return;
      }

      // Checked before the signature pad opens, not after: being asked to sign
      // and only then told a photo is missing means signing twice.
      if (
        status === "DELIVERED" &&
        proofImages.length === 0 &&
        !(load?.deliveryProof?.images || []).length
      ) {
        Alert.alert(
          "Delivery proof required",
          "Photograph the container at the drop before completing the delivery.",
        );
        return;
      }

      if (status === "DELIVERED" && !signatureOverride) {
        pendingDeliveryStatusRef.current = status;
        setSignatureOpen(true);
        return;
      }

      // A street turn can't be saved until the handover parties are confirmed.
      if (status === "STREET_TURN" && !streetTurnOverride) {
        setStreetTurnOpen(true);
        return;
      }

      setSaving(true);
      const current = position || (await requestCurrentPosition());
      const locationPayload = toLocationPayload(current);

      const formData = new FormData();
      formData.append("transportStatus", status);
      formData.append("note", note);
      formData.append("latitude", String(locationPayload.latitude));
      formData.append("longitude", String(locationPayload.longitude));
      formData.append("accuracy", String(locationPayload.accuracy || ""));
      if (signatureOverride) formData.append("signatureData", signatureOverride);
      // Multipart flattens nested objects, so the server parses this back.
      if (streetTurnOverride) {
        formData.append("streetTurn", JSON.stringify(streetTurnOverride));
      }
      proofImages.forEach((asset, index) => {
        formData.append("proofImages", assetToFile(asset, `proof-${index + 1}.jpg`));
      });

      const res = await api.put(`/loads/${load.loadId}/transport-status`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setLoad(res.data.data);
      setNote("");
      setStreetTurnOpen(false);
      if (["PICKED_UP", "DELIVERED"].includes(status)) setProofImages([]);
      if (status === "DELIVERED") {
        watcherRef.current?.remove?.();
        watcherRef.current = null;
        await stopBackgroundTracking().catch(() => null);
        await fetchTracking().catch(() => null);
      }
      Alert.alert("Status updated", `${labelize(status)} synced successfully.`);
    } catch (error) {
      Alert.alert("Update failed", error.response?.data?.message || error.message);
    } finally {
      setSaving(false);
    }
  };

  const getDocumentByType = (type) =>
    visibleToDriver(load.documents).find(
      (doc) =>
        (doc.documentType === "Invoice" ? "Carrier Invoice" : doc.documentType) === type,
    );

  const handleViewDocument = async (filePath) => {
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

  const uploadDocument = async (type) => {
    if (type === POD_DOCUMENT_TYPE) {
      Alert.alert("Auto-generated document", "Proof of Delivery is created automatically after delivery.");
      return;
    }

    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;

    const file = result.assets[0];
    const formData = new FormData();
    formData.append("documentType", type);
    formData.append("file", assetToFile(file, file.name || "document.pdf"));

    try {
      setSaving(true);
      await api.post(`/loads/${load.loadId}/documents`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await fetchLoad();
      Alert.alert("Document uploaded", `${type} added to the load.`);
    } catch (error) {
      Alert.alert("Upload failed", error.response?.data?.message || error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.safeContent}>
        <View style={styles.topBar}>
          <SecondaryButton title="Back" onPress={onBack} />
          <Pill tone={isTrackingActive ? "success" : "warning"}>
            {isTrackingActive ? "Live GPS On" : "GPS Required"}
          </Pill>
        </View>

        <LoadCard load={load}>
          <Text style={styles.sectionTitle}>Current location</Text>
          <Text style={styles.muted}>
            {tracking?.lastLocation
              ? `${Number(tracking.lastLocation.latitude).toFixed(5)}, ${Number(
                  tracking.lastLocation.longitude,
                ).toFixed(5)}`
              : "No live location synced yet."}
          </Text>
          <PrimaryButton
            title={isTrackingActive ? "Tracking Active" : "Allow and Start Live Tracking"}
            onPress={startTracking}
            disabled={saving || isTrackingActive}
            tone="success"
          />
        </LoadCard>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Update status</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Optional note"
            multiline
            style={[styles.input, styles.noteInput]}
            placeholderTextColor="#98a2b3"
          />
          <Pressable
            onPress={() => setStatusPickerOpen(true)}
            disabled={saving}
            style={({ pressed }) => [styles.pickerField, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={styles.pickerFieldText}>Select next status…</Text>
            <Text style={styles.pickerChevron}>▾</Text>
          </Pressable>
          <SecondaryButton
            title={`Proof photos: ${proofImages.length}`}
            onPress={pickProofImages}
          />
          <SecondaryButton
            title={signatureData ? "Signature captured" : "Capture delivery signature"}
            onPress={() => setSignatureOpen(true)}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Documents</Text>
          <View style={styles.docTypesHeader}>
            <Text style={styles.muted}>Proof of Delivery is autogenerated after delivered status.</Text>
          </View>

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
                onView={() => handleViewDocument(getDocumentByType(type)?.filePath)}
                onUpload={() => uploadDocument(type)}
              />
            ))}
          </View>

          {/* Counts only what this screen lists, so the number cannot disagree
              with the cards above it. */}
          <Text style={styles.muted}>
            {visibleToDriver(load.documents).length} document(s) on this load
          </Text>
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
          updateStatus(status);
        }}
      />

      <SignatureModal
        visible={signatureOpen}
        onClose={() => {
          pendingDeliveryStatusRef.current = null;
          setSignatureOpen(false);
        }}
        onSigned={(signature) => {
          setSignatureData(signature);
          const pendingStatus = pendingDeliveryStatusRef.current;
          pendingDeliveryStatusRef.current = null;
          setSignatureOpen(false);
          if (pendingStatus) {
            updateStatus(pendingStatus, signature).catch((error) => {
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
              <Text style={{ color: colors.muted, marginTop: 4, fontSize: 13 }}>
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
              <Text style={{ color: colors.muted, fontSize: 12, textAlign: "center" }}>
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
  const [signing, setSigning] = useState(null);

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

  if (state.loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (state.complete) return children;

  if (signing) {
    return (
      <AgreementSignScreen
        agreement={signing}
        onBack={() => setSigning(null)}
        onSigned={async () => {
          setSigning(null);
          await check();
        }}
      />
    );
  }

  return (
    <CarrierDocumentationScreen
      data={state.data}
      onSign={setSigning}
      onRefresh={check}
      onLogout={onLogout}
    />
  );
}

function CarrierDocumentationScreen({ data, onSign, onRefresh, onLogout }) {
  const [catalog, setCatalog] = useState(null);

  useEffect(() => {
    api
      .get("/onboarding/catalog")
      .then((res) => setCatalog(res.data))
      .catch(() => null);
  }, []);

  const signedKeys = (data?.agreements || [])
    .filter((a) => a.signedAt)
    .map((a) => a.key);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.listContent}>
        <Text style={styles.title}>Before you can haul</Text>
        <Text style={styles.subtitle}>
          {data?.carrier?.carrierName || "Your carrier"} — both agreements have
          to be signed before loads can be dispatched to you. This is the
          contract they are dispatched under, so it comes first.
        </Text>

        {(catalog?.agreements || []).map((agreement) => {
          const done = signedKeys.includes(agreement.key);

          return (
            <View key={agreement.key} style={styles.card}>
              <Text style={styles.cardTitle}>{agreement.title}</Text>
              <Text style={styles.cardMeta}>
                With {agreement.counterparty} · {agreement.pages} pages
              </Text>
              <Text style={styles.cardBody}>{agreement.summary}</Text>

              {done ? (
                <Text style={styles.signedNote}>✓ Signed</Text>
              ) : (
                <PrimaryButton title="Read & sign" onPress={() => onSign(agreement)} />
              )}
            </View>
          );
        })}

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
function AgreementSignScreen({ agreement, onBack, onSigned }) {
  const [values, setValues] = useState({});
  const [accepted, setAccepted] = useState([]);
  const [signedName, setSignedName] = useState("");
  const [signedTitle, setSignedTitle] = useState("");
  const [signature, setSignature] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPad, setShowPad] = useState(false);

  const allAcknowledged =
    accepted.length === (agreement.acknowledgements || []).length;

  const submit = async () => {
    const missing = (agreement.fields || [])
      .filter((f) => f.required && !String(values[f.key] || "").trim())
      .map((f) => f.label);

    if (missing.length) {
      Alert.alert("Still needed", missing.join(", "));
      return;
    }
    if (!allAcknowledged) {
      Alert.alert("Confirm each point", "Every acknowledgement has to be ticked.");
      return;
    }
    if (!signedName.trim() || !signedTitle.trim()) {
      Alert.alert("Signer", "Your full name and title are both required.");
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
      onSigned();
    } catch (error) {
      Alert.alert(
        "Could not sign",
        error.response?.data?.message || error.message,
      );
    } finally {
      setSaving(false);
    }
  };

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
      <ScrollView contentContainerStyle={styles.listContent}>
        <Text style={styles.title}>{agreement.title}</Text>
        <Text style={styles.subtitle}>With {agreement.counterparty}</Text>

        {(agreement.fields || []).map((field) => (
          <View key={field.key} style={styles.card}>
            <Text style={styles.label}>
              {field.label}
              {field.required ? " *" : ""}
            </Text>
            {field.help ? <Text style={styles.cardMeta}>{field.help}</Text> : null}
            <TextInput
              style={styles.input}
              value={values[field.key] || ""}
              placeholder={field.placeholder || ""}
              onChangeText={(text) =>
                setValues((current) => ({ ...current, [field.key]: text }))
              }
            />
          </View>
        ))}

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
          <Text style={styles.label}>Signer full name *</Text>
          <TextInput
            style={styles.input}
            value={signedName}
            onChangeText={setSignedName}
          />
          <Text style={styles.label}>Title *</Text>
          <TextInput
            style={styles.input}
            value={signedTitle}
            onChangeText={setSignedTitle}
          />
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
              {new Date(item.createdAt).toLocaleString()}
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
  const [detailLoad, setDetailLoad] = useState(null);
  const [showLicense, setShowLicense] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
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
        case "assigned":
        case "over":
        case "available":
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
        case "postLoad":
        case "quotes":
        case "documents":
        case "payments":
        case "history":
        case "pending":
        case "bidding":
        case "loads":
        case "carriers":
        case "drivers":
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
    return [
      { key: "assigned", label: "Assigned" },
      !isDriver && { key: "available", label: "Available" },
      !isDriver && { key: "myBids", label: "My Bids" },
      { key: "over", label: "Over" },
    ].filter(Boolean);
  }, [carrierSide, isDriver]);

  /* ---- Full-screen routes. These sit above the tab bar. ---- */

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
    return <TrackingScreen load={selectedLoad} onBack={() => setSelectedLoad(null)} />;
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
        <MyBidsTab onOpenDetail={setDetailLoad} />
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
          <AssignedLoadsTab onTrack={setSelectedLoad} onOpenDetail={setDetailLoad} />
        )}
        {loadTab === "available" && (
          <AvailableBidsTab
            onOpenAssigned={() => setLoadTab("assigned")}
            onOpenDetail={setDetailLoad}
          />
        )}
        {loadTab === "myBids" && <MyBidsTab onOpenDetail={setDetailLoad} />}
        {loadTab === "over" && (
          <OverLoadsTab onTrack={setSelectedLoad} onOpenDetail={setDetailLoad} />
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
    fontSize: 12.5,
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
  loginRoleChipText: { color: "#CFE2FF", fontSize: 11, fontWeight: "700" },
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
  segmentText: { fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.9)" },

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
  complianceTitle: { fontSize: 13, fontWeight: "800", color: colors.warning },
  complianceBody: { fontSize: 12, color: colors.muted, marginTop: 2 },

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
  moreRowText: { flex: 1, fontSize: 14, fontWeight: "700", color: colors.text },

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
    fontSize: 13,
    marginTop: 3,
  },
  apiHint: {
    color: colors.muted,
    fontSize: 11,
    textAlign: "center",
  },
  field: {
    gap: 7,
  },
  label: {
    color: colors.text,
    fontSize: 12,
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
    fontSize: 14,
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
    fontSize: 14,
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
    fontSize: 13,
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
    fontSize: 12,
  },
  tabTextActive: {
    color: "#fff",
  },
  listContent: {
    padding: 16,
    paddingBottom: 28,
    gap: 12,
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#111827" },
  cardMeta: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  cardBody: { fontSize: 13, color: "#374151", marginTop: 6, marginBottom: 10 },
  signedNote: { fontSize: 13, fontWeight: "600", color: "#16a34a", marginVertical: 8 },
  gateFooter: { fontSize: 12, color: "#6b7280", marginVertical: 12, textAlign: "center" },
  label: { fontSize: 12, fontWeight: "700", color: "#374151", marginTop: 8, marginBottom: 4 },
  ackRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 8 },
  ackBox: { fontSize: 16, marginRight: 8, color: "#4f46e5" },
  ackText: { flex: 1, fontSize: 13, color: "#374151" },
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
    borderColor: "#e5e7eb",
  },
  notifUnread: { borderLeftWidth: 4, borderLeftColor: "#4f46e5", backgroundColor: "#eef2ff" },
  notifTitle: { fontSize: 14, fontWeight: "700", color: "#111827" },
  notifBody: { fontSize: 13, color: "#374151", marginTop: 2 },
  notifMeta: { fontSize: 11, color: "#6b7280", marginTop: 6 },
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
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  muted: {
    color: colors.muted,
    fontSize: 13,
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
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  summaryValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  metaText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  pill: {
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 11,
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
    backgroundColor: "#eef2ff",
    borderWidth: 1,
    borderColor: "#c7d2fe",
    gap: 6,
  },
  offerTitle: {
    color: "#4338ca",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  offerAmount: {
    color: "#312e81",
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
    fontSize: 15,
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
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
  },
  documentCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: "#fff",
    padding: 12,
    gap: 10,
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
    fontSize: 14,
    fontWeight: "900",
  },
  documentSubtitle: {
    color: colors.muted,
    fontSize: 12,
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
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  documentActionText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  documentActionTextDisabled: {
    color: "#94a3b8",
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
    fontSize: 12,
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
    backgroundColor: "rgba(15, 23, 42, 0.48)",
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
    fontSize: 11,
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
    fontSize: 12,
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
    fontSize: 14,
    fontWeight: "700",
  },
  pickerChevron: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: "900",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
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
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
  },
  stOptionList: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  stOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f7",
  },
  pickerRowText: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  pickerRowNote: {
    color: colors.muted,
    fontSize: 12,
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
    fontSize: 14,
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
    borderBottomColor: "#f1f5f9",
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    flexShrink: 0,
    maxWidth: "50%",
  },
  detailValue: {
    color: colors.text,
    fontSize: 13,
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
    fontSize: 13,
    lineHeight: 19,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#eef2f7",
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
    fontSize: 12,
    fontWeight: "900",
  },
  stopCompany: {
    color: colors.text,
    fontSize: 14,
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
    borderBottomColor: "#f1f5f9",
  },
  historyTime: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  docViewLink: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800",
  },
});
