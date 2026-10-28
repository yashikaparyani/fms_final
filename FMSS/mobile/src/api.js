import axios from "axios";
import Constants from "expo-constants";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const DEFAULT_API_URL = "http://localhost:5001/api";

const getMetroHostApiUrl = () => {
  const hostUri = Constants.expoConfig?.hostUri || Constants.manifest?.hostUri;

  if (!hostUri) return null;

  const host = hostUri.replace(/^exp:\/\//, "").split(":")[0];
  if (!host) return null;

  return `http://${host}:5001/api`;
};

const configuredApiUrl =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.apiUrl ||
  DEFAULT_API_URL;

export const API_BASE_URL =
  Platform.OS !== "web" && /localhost|127\.0\.0\.1/.test(configuredApiUrl)
    ? getMetroHostApiUrl() || configuredApiUrl
    : configuredApiUrl;

export const TOKEN_KEY = "fmss_api_token";
export const USER_KEY = "fmss_user";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
});

export const LOCATION_KEY = "fmss_location_id";

// A load id contains a space — "LD 0014" — and goes straight into request
// paths. React Native's networking layer will not encode it for us the way a
// browser does, so it is done here, once, for every request the app makes.
const encodePathSpaces = (url = "") => {
  const [path, ...rest] = String(url).split("?");
  return [path.replace(/ /g, "%20"), ...rest].join("?");
};

api.interceptors.request.use(async (config) => {
  if (config.url) config.url = encodePathSpaces(config.url);

  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Which operating location this carrier belongs to. Carriers hold exactly
  // one, stored at sign-in; the server falls back to their default if absent.
  const locationId = await AsyncStorage.getItem(LOCATION_KEY);
  if (locationId) {
    config.headers["x-location-id"] = locationId;
  }

  // iOS keeps its own cache of GET responses and may answer from it without
  // asking us — which is how a carrier ends up looking at the empty board from
  // before their load was assigned. The server also sends no-store; this covers
  // anything the phone stored before it did.
  config.headers["Cache-Control"] = "no-cache";

  return config;
});

/**
 * Run a request, asking again after a pause if the connection dropped.
 *
 * Only network failures and 5xx are retried. A 4xx is the server's considered
 * answer — asking again gets the same one, just later.
 */
export const withRetry = async (request, delays = [2000, 5000]) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      const status = error?.response?.status;
      if ((status && status < 500) || attempt >= delays.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
};

// ─── Failure reports ──────────────────────────────────────────────────────────
// A request that never reached the server leaves no trace in its logs, so when
// a carrier says "my loads are missing" there is nothing to look at. The app
// keeps a short list of what failed and sends it to POST /api/client-logs the
// next time it gets through.
const MAX_PENDING_REPORTS = 20;
const pendingReports = [];
let flushingReports = false;

export const flushClientErrors = async () => {
  if (flushingReports || !pendingReports.length) return;

  flushingReports = true;
  const batch = pendingReports.splice(0);
  try {
    await api.post("/client-logs", { entries: batch });
  } catch {
    // Still offline, most likely. Keep them for next time, newest first to go.
    pendingReports.unshift(...batch.slice(-MAX_PENDING_REPORTS));
    pendingReports.splice(MAX_PENDING_REPORTS);
  } finally {
    flushingReports = false;
  }
};

export const reportClientError = ({ where, path, error }) => {
  pendingReports.push({
    where,
    path,
    status: error?.response?.status ?? null,
    message: error?.message || String(error),
    at: new Date().toISOString(),
    appVersion: Constants.expoConfig?.version || "",
  });
  if (pendingReports.length > MAX_PENDING_REPORTS) pendingReports.shift();

  flushClientErrors();
};

export const saveSession = async ({ api_token, user }) => {
  await AsyncStorage.multiSet([
    [TOKEN_KEY, api_token],
    [USER_KEY, JSON.stringify(user)],
  ]);

  // Pin the carrier's location so every later request carries it.
  const locationId = user?.defaultLocation || user?.locations?.[0];
  if (locationId) {
    await AsyncStorage.setItem(LOCATION_KEY, String(locationId));
  }
};

export const getStoredSession = async () => {
  const [[, token], [, userJson]] = await AsyncStorage.multiGet([
    TOKEN_KEY,
    USER_KEY,
  ]);

  if (!token || !userJson) return null;
  try {
    return {
      api_token: token,
      user: JSON.parse(userJson),
    };
  } catch {
    await clearSession();
    return null;
  }
};

export const clearSession = async () => {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY, LOCATION_KEY]);
};

export default api;
