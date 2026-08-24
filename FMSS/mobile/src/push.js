import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";

import api from "./api";

// ─── Push notifications ───────────────────────────────────────────────────────
// Instant dispatch is what this is for. A load is offered to the carriers whose
// drivers are near the pickup and the offer expires in half an hour, so a
// dispatcher who finds out when they next open a laptop is a dispatcher who
// does not get the load. The in-app banner and the email cover the office; this
// covers the person in a yard with a phone.
//
// Everything here is best effort. A refused permission, a simulator with no
// push support, an Expo service that will not answer — none of them may stop
// somebody signing in and doing their job. Failures are swallowed deliberately.
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_KEY = "fmss_push_token";

/**
 * Show the banner even while the app is open.
 *
 * The default is to stay silent when the app is foregrounded, which is wrong
 * for an offer that expires: a driver staring at the load list is exactly who
 * should see a new one arrive.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Android needs a channel before anything can be delivered to it, and one
 * declared with high importance so an offer actually surfaces rather than
 * sitting silently in the shade.
 */
const ensureAndroidChannel = async () => {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync("default", {
    name: "Load offers and updates",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#4f46e5",
  });
};

/**
 * Ask for permission and hand the server this device's Expo token.
 *
 * Called after sign-in rather than at launch: a permission prompt in front of
 * somebody who has not yet said who they are is a prompt they decline, and iOS
 * only ever asks once.
 *
 * @returns {Promise<string|null>} the token, or null if push is unavailable
 */
export const registerForPush = async () => {
  try {
    // A simulator has no push service to register with, and asking produces an
    // error rather than a token.
    if (!Device.isDevice) return null;

    await ensureAndroidChannel();

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;

    if (status !== "granted") {
      // Only ask when we have not already been answered. Asking again after a
      // refusal does nothing on iOS and irritates on Android.
      if (!existing.canAskAgain) return null;
      ({ status } = await Notifications.requestPermissionsAsync());
    }

    if (status !== "granted") return null;

    // The project the token is minted against. Read from config rather than
    // hardcoded so a different EAS project does not silently issue tokens the
    // server cannot push to.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.easConfig?.projectId;

    if (!projectId) return null;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return null;

    await api.post("/notifications/push-token", {
      token,
      platform: Platform.OS,
    });

    // Kept so sign-out can tell the server which device to forget — by then the
    // auth header is about to go away, so it cannot be looked up again.
    await AsyncStorage.setItem(TOKEN_KEY, token);

    return token;
  } catch {
    // Push is an extra. Nothing about signing in depends on it.
    return null;
  }
};

/**
 * Tell the server to stop pushing to this device, on sign-out.
 *
 * A token identifies a handset, not a person. Two drivers share a phone often
 * enough that leaving it registered would send one of them the other's load
 * offers — so this runs before the session is cleared, while the request can
 * still authenticate.
 */
export const unregisterFromPush = async () => {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return;

    await api.delete("/notifications/push-token", { data: { token } });
  } catch {
    /* signing out must never fail because of this */
  } finally {
    await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
  }
};

/**
 * Route a tapped notification to whatever it is about.
 *
 * `onOpen` receives the notification's `data` payload — the server sends
 * `{ type, loadId }`, so the app can open the offers screen with the load in
 * question rather than dumping somebody on a home screen to go and find it.
 *
 * Handles both cases: a notification tapped while the app was running, and one
 * that launched the app from cold. The second is easy to miss and is the more
 * common way an offer is opened.
 *
 * @returns {() => void} unsubscribe
 */
export const listenForNotificationTaps = (onOpen) => {
  Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      const data = response?.notification?.request?.content?.data;
      if (data) onOpen(data);
    })
    .catch(() => {});

  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response?.notification?.request?.content?.data;
      if (data) onOpen(data);
    },
  );

  return () => subscription.remove();
};
