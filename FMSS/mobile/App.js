import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { colors, shadow } from "./src/theme";

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
      if (res.data.user?.role !== "fleetOwner") {
        Alert.alert("Fleet owners only", "This app is only for fleet-owner accounts.");
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
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.centered}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.loginCard}>
          <Text style={styles.brand}>FMSS Fleet</Text>
          <Text style={styles.subtitle}>Fleet-owner mobile app</Text>
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="fleet@example.com" />
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
      </KeyboardAvoidingView>
    </SafeAreaView>
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
        {/* Show the fleet-owner payout (vendor rate), not the customer base rate. */}
        <Text style={styles.metaText}>{money(load.vendorRate ?? load.amount)}</Text>
      </View>
    </>
  );

  return (
    <View style={styles.card}>
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
        const canEdit = result === "PENDING";
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
// Handing the container to a delivery partner emails every party involved, so
// the server refuses a STREET_TURN status change unless these details come
// with it. This sheet collects them.
function StreetTurnModal({ visible, load, saving, onClose, onConfirm }) {
  const [partners, setPartners] = useState([]);
  const [lines, setLines] = useState([]);
  const [chassisCompanies, setChassisCompanies] = useState([]);
  const [loadingMasters, setLoadingMasters] = useState(true);

  const [deliveryPartner, setDeliveryPartner] = useState("");
  const [shippingLine, setShippingLine] = useState("");
  const [chassisCompany, setChassisCompany] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!visible) return;

    setDeliveryPartner("");
    setNote("");
    // Pre-fill from the load so the common case is one tap.
    setShippingLine(load?.shippingLine || "");
    setChassisCompany(load?.chassisCompany || "");

    setLoadingMasters(true);
    Promise.all([
      api.get("/delivery-partners", { params: { active: true } }).catch(() => ({ data: [] })),
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
    if (!deliveryPartner) {
      Alert.alert(
        "Delivery partner required",
        "Select the delivery partner this load is being handed to.",
      );
      return;
    }
    onConfirm({ deliveryPartner, shippingLine, chassisCompany, note });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.pickerSheet} onPress={() => {}}>
          <Text style={styles.sectionTitle}>Confirm Street Turn</Text>
          <Text style={styles.muted}>
            {load?.loadId} — the delivery partner, shipping line, chassis company, your
            carrier contact and the admins are all emailed once you confirm.
          </Text>

          {loadingMasters ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
          ) : (
            <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
              <InlinePicker
                label="Delivery Partner"
                required
                options={partners}
                value={deliveryPartner}
                onChange={setDeliveryPartner}
                emptyText="No delivery partners set up yet."
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
  const documents = load.documents || [];
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
      <ScrollView contentContainerStyle={styles.screenContent}>
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
          <DetailRow label="Fleet Owner Payout" value={money(load.vendorRate)} />
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
      if (status === "PICKED_UP") setProofImages([]);
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
    (load.documents || []).find(
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
      <ScrollView contentContainerStyle={styles.screenContent}>
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
          <SecondaryButton title={`Pickup proof images: ${proofImages.length}`} onPress={pickProofImages} />
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

          <Text style={styles.muted}>{load.documents?.length || 0} document(s) on this load</Text>
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

function FleetHomeScreen({ session, onLogout }) {
  const [tab, setTab] = useState("assigned");
  const [selectedLoad, setSelectedLoad] = useState(null);
  const [detailLoad, setDetailLoad] = useState(null);

  const tabs = useMemo(
    () => [
      { key: "assigned", label: "Assigned" },
      { key: "available", label: "Available" },
      { key: "myBids", label: "My Bids" },
      { key: "over", label: "Over" },
    ],
    [],
  );

  if (selectedLoad) {
    return <TrackingScreen load={selectedLoad} onBack={() => setSelectedLoad(null)} />;
  }

  if (detailLoad) {
    return <LoadDetailScreen load={detailLoad} onBack={() => setDetailLoad(null)} />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>FMSS Fleet</Text>
          <Text style={styles.subtitle}>{session.user?.email}</Text>
        </View>
        <SecondaryButton title="Logout" onPress={onLogout} />
      </View>

      <View style={styles.tabs}>
        {tabs.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => setTab(item.key)}
            style={[styles.tab, tab === item.key && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === item.key && styles.tabTextActive]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === "assigned" && (
        <AssignedLoadsTab onTrack={setSelectedLoad} onOpenDetail={setDetailLoad} />
      )}
      {tab === "available" && (
        <AvailableBidsTab
          onOpenAssigned={() => setTab("assigned")}
          onOpenDetail={setDetailLoad}
        />
      )}
      {tab === "myBids" && <MyBidsTab onOpenDetail={setDetailLoad} />}
      {tab === "over" && <OverLoadsTab onTrack={setSelectedLoad} onOpenDetail={setDetailLoad} />}
    </SafeAreaView>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    getStoredSession()
      .then((stored) => setSession(stored))
      .finally(() => setBooting(false));
  }, []);

  const logout = async () => {
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

  return <FleetHomeScreen session={session} onLogout={logout} />;
}

const ANDROID_TOP_INSET =
  Platform.OS === "android" ? RNStatusBar.currentHeight || 0 : 0;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: ANDROID_TOP_INSET,
  },
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
  brand: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "800",
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
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
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
    borderRadius: 12,
    paddingVertical: 11,
    backgroundColor: "#eef2f9",
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
  empty: {
    color: colors.muted,
    fontWeight: "700",
    textAlign: "center",
    paddingVertical: 40,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
    gap: 12,
    ...shadow,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  loadId: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
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
