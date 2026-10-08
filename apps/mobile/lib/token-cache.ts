import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { TokenCache } from "@clerk/expo";

/**
 * Clerk token cache backed by expo-secure-store.
 * SecureStore is only available on native (iOS/Android), so we
 * fall back to a no-op cache on web.
 */
const createTokenCache = (): TokenCache => {
  return {
    getToken: async (key: string) => {
      try {
        const item = await SecureStore.getItemAsync(key);
        if (item && __DEV__) {
          console.log(`[token-cache] Loaded token for key: ${key.substring(0, 20)}...`);
        }
        return item;
      } catch (error) {
        console.error("[token-cache] getToken error:", error);
        return null;
      }
    },
    saveToken: async (key: string, token: string) => {
      try {
        await SecureStore.setItemAsync(key, token);
      } catch (error) {
        console.error("[token-cache] saveToken error:", error);
      }
    },
    clearToken: async (key: string) => {
      try {
        await SecureStore.deleteItemAsync(key);
      } catch (error) {
        console.error("[token-cache] clearToken error:", error);
      }
    },
  };
};

export const tokenCache = Platform.OS !== "web" ? createTokenCache() : undefined;
