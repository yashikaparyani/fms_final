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

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const saveSession = async ({ api_token, user }) => {
  await AsyncStorage.multiSet([
    [TOKEN_KEY, api_token],
    [USER_KEY, JSON.stringify(user)],
  ]);
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
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
};

export default api;
