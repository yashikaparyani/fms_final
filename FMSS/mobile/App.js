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
];

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

function LoadCard({ load, children }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.loadId}>{load.loadId}</Text>
          <Text style={styles.muted}>
            {load.pickup?.city || "-"} to {load.drop?.city || "-"}
          </Text>
        </View>
        <Pill tone={load.transportStatus === "DELIVERED" ? "success" : "default"}>
          {labelize(load.transportStatus || load.bidStatus)}
        </Pill>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>{load.truckType || "Truck -"}</Text>
        <Text style={styles.metaText}>{money(load.amount || load.vendorRate)}</Text>
      </View>
      {children}
    </View>
  );
}

function AvailableBidsTab({ onOpenAssigned }) {
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
        <LoadCard load={item}>
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

function MyBidsTab() {
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
          <LoadCard load={item}>
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

function AssignedLoadsTab({ onTrack }) {
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
      data={loads.filter((item) => item && item.loadId)}
      keyExtractor={(item, index) => String(item._id || item.loadId || index)}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchLoads} />}
      ListEmptyComponent={
        <Text style={styles.empty}>{loading ? "Loading assigned loads..." : "No assigned loads."}</Text>
      }
      renderItem={({ item }) => (
        <LoadCard load={item}>
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

function TrackingScreen({ load: initialLoad, onBack }) {
  const [load, setLoad] = useState(initialLoad);
  const [tracking, setTracking] = useState(null);
  const [position, setPosition] = useState(null);
  const [note, setNote] = useState("");
  const [proofImages, setProofImages] = useState([]);
  const [signatureData, setSignatureData] = useState("");
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const watcherRef = useRef(null);
  const pendingDeliveryStatusRef = useRef(null);

  const isTrackingActive = tracking?.status === "ACTIVE";

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

  const updateStatus = async (status, signatureOverride = signatureData) => {
    try {
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
      proofImages.forEach((asset, index) => {
        formData.append("proofImages", assetToFile(asset, `proof-${index + 1}.jpg`));
      });

      const res = await api.put(`/loads/${load.loadId}/transport-status`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setLoad(res.data.data);
      setNote("");
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
          <View style={styles.actionGrid}>
            {statusOptions.map((status) => (
              <SecondaryButton
                key={status}
                title={labelize(status)}
                onPress={() => updateStatus(status)}
                disabled={saving}
                style={styles.gridButton}
              />
            ))}
          </View>
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
    </SafeAreaView>
  );
}

function FleetHomeScreen({ session, onLogout }) {
  const [tab, setTab] = useState("assigned");
  const [selectedLoad, setSelectedLoad] = useState(null);

  const tabs = useMemo(
    () => [
      { key: "assigned", label: "Assigned" },
      { key: "available", label: "Available" },
      { key: "myBids", label: "My Bids" },
    ],
    [],
  );

  if (selectedLoad) {
    return <TrackingScreen load={selectedLoad} onBack={() => setSelectedLoad(null)} />;
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

      {tab === "assigned" && <AssignedLoadsTab onTrack={setSelectedLoad} />}
      {tab === "available" && <AvailableBidsTab onOpenAssigned={() => setTab("assigned")} />}
      {tab === "myBids" && <MyBidsTab />}
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
});
