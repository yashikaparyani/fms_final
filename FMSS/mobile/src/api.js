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

  return config;
});

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
  return {
    api_token: token,
    user: JSON.parse(userJson),
  };
};

export const clearSession = async () => {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY, LOCATION_KEY]);
};

export default api;
