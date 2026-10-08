/**
 * Push notification registration and handling via expo-notifications.
 *
 * Handles:
 * - Permission request + Expo push token retrieval
 * - Foreground notification display configuration
 * - Token registration with the web API
 *
 * Requires a dev build (not Expo Go) for remote push notifications.
 */

import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { apiPost } from "./api";

const PUSH_TOKEN_STORAGE_KEY = "flame_registered_push_token";

/** In-memory cache; SecureStore is the durable source of truth across cold launches. */
let lastRegisteredToken: string | null = null;

async function getPersistedToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(PUSH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

async function persistToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(PUSH_TOKEN_STORAGE_KEY, token);
  } catch (err) {
    console.warn("[notifications] Failed to persist push token to SecureStore:", err);
  }
}

async function clearPersistedToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PUSH_TOKEN_STORAGE_KEY);
  } catch (err) {
    console.warn("[notifications] Failed to clear push token from SecureStore:", err);
  }
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowInForeground: true,
  }),
});

export async function registerForPushNotificationsAsync(
  getToken: () => Promise<string | null>,
): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn("[notifications] Push notifications require a physical device");
    return null;
  }

  let finalStatus: Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>["status"];
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.warn("[notifications] Permission not granted for push notifications");
      return null;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      });
    }
  } catch (err) {
    console.error("[notifications] Permission/channel setup failed:", err);
    return null;
  }

  let expoPushToken: string;
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.warn(
        "[notifications] No EAS projectId found in app config. " +
        "Push token registration skipped. Run `eas init` and add the " +
        "projectId to app.json under extra.eas.projectId.",
      );
      return null;
    }
    const pushToken = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    expoPushToken = pushToken.data;
  } catch (err) {
    console.error("[notifications] Failed to get Expo push token:", err);
    return null;
  }

  try {
    await apiPost(
      "/api/push-tokens/register",
      {
        expoPushToken,
        platform: Platform.OS,
      },
      getToken,
    );
    lastRegisteredToken = expoPushToken;
    await persistToken(expoPushToken);
    return expoPushToken;
  } catch (err) {
    console.warn("[notifications] Failed to register push token with server:", err);
    throw err;
  }
}

export async function deregisterPushToken(
  getToken: () => Promise<string | null>,
): Promise<void> {
  // On cold launch lastRegisteredToken is null — load from durable storage.
  const token = lastRegisteredToken ?? (await getPersistedToken());
  if (!token) return;

  try {
    await apiPost(
      "/api/push-tokens/deregister",
      { expoPushToken: token },
      getToken,
    );
    lastRegisteredToken = null;
    await clearPersistedToken();
  } catch (err) {
    console.warn("[notifications] Failed to deregister push token:", err);
  }
}
