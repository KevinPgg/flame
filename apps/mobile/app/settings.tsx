import { useState } from "react";
import { View, ScrollView, Pressable, Alert, Text, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import * as Application from "expo-application";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlameText, colors } from "@project-flame/ui";
import { getTabBarPaddingBottom } from "../components/navigation/CustomTabBar";
import { DashboardBar } from "../components/dashboard/DashboardBar";
import { useOptionalAuth } from "../hooks/useOptionalAuth";
import { deregisterPushToken } from "../lib/notifications";
import { SCANNING_SUPPORTED } from "../lib/scanner-platform";

const BASE_URL = "https://flme.co";

interface SettingsMenuItem {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  action: "navigate" | "browser";
  target: string;
  /** Tagline shown under the label. Optional. */
  description?: string;
}

const MENU_ITEMS: SettingsMenuItem[] = [
  {
    id: "account",
    label: "Account",
    icon: "person-outline",
    action: "navigate",
    target: "/account",
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: "notifications-outline",
    action: "navigate",
    target: "/notifications-settings",
  },
  {
    id: "support",
    label: "Support",
    icon: "help-circle-outline",
    action: "navigate",
    target: "/support",
  },
];

/**
 * Standalone "Scan Tickets" entry available to every visitor of the Settings
 * tab — signed in or not. Targets `/scanner?public=1` which bypasses
 * RequireAuthGate and uses the access-code-as-credential path on the QR
 * scanner API endpoints (validate-code, verify, checkin). Intended for event
 * staff who have an access code from the organizer but don't have (or want)
 * a Flame account.
 *
 * Web parity: `/qr-scanner` is publicly reachable on the web for the same
 * reason. See CHANGELOG_IOS_VERSIONS.md (v1.0.13).
 */
const SCANNER_ITEM: SettingsMenuItem = {
  id: "scanner",
  label: "Scan Tickets",
  icon: "qr-code-outline",
  action: "navigate",
  target: "/scanner?public=1",
  description: "For event staff with an access code — no sign in required.",
};

/**
 * Signed in (Flame 2.0, fase 1b.6): the v2 scanner lists the events this account can scan —
 * its organizations', co-hosted ones and the ones it was added to — with no code; it links to
 * the access-code scanner for the rest (Kevin, 2026-10-23).
 */
const SCANNER_ITEM_ACCOUNT: SettingsMenuItem = {
  ...SCANNER_ITEM,
  target: "/v2/scanner",
  description: "With your account, or with an event access code.",
};

const LEGAL_ITEMS: SettingsMenuItem[] = [
  {
    id: "privacy",
    label: "Privacy Policy",
    icon: "shield-checkmark-outline",
    action: "browser",
    target: `${BASE_URL}/privacy-policy`,
  },
  {
    id: "terms",
    label: "Terms of Use",
    icon: "document-text-outline",
    action: "browser",
    target: `${BASE_URL}/terms-of-use`,
  },
  {
    id: "purchase-terms",
    label: "Purchase Terms",
    icon: "cart-outline",
    action: "browser",
    target: `${BASE_URL}/purchase-terms`,
  },
  {
    id: "cookies",
    label: "Cookie Settings",
    icon: "settings-outline",
    action: "browser",
    target: `${BASE_URL}/cookie-settings`,
  },
];

function MenuRow({
  item,
  onPress,
  isLast,
}: {
  item: SettingsMenuItem;
  onPress: () => void;
  isLast?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center py-[14px] px-4 ${!isLast ? "border-b border-white-10" : ""}`}
    >
      <Ionicons
        name={item.icon}
        size={22}
        color={colors["white-80"]}
        style={{ marginRight: 14 }}
      />
      <View className="flex-1">
        <FlameText variant="body" className="text-white-100">
          {item.label}
        </FlameText>
        {item.description ? (
          <Text className="text-white-50 text-xs font-poppins mt-[2px]">
            {item.description}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors["white-50"]} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isSignedIn, signOut, userId, getToken } = useOptionalAuth();
  const queryClient = useQueryClient();
  const [isSigningOut, setIsSigningOut] = useState(false);
  // Clerk not loaded yet (e.g. cold relaunch): auth is neither signed-in nor
  // signed-out. Don't flash a misleading "Sign In" button (W8-M1).
  const authResolving = isSignedIn === undefined;

  const handlePress = async (item: SettingsMenuItem) => {
    if (item.action === "navigate") {
      router.push(item.target as never);
      return;
    }
    try {
      await WebBrowser.openBrowserAsync(item.target);
    } catch (err) {
      console.error("[Settings] openBrowserAsync failed", {
        userId,
        action: "openBrowser",
        url: item.target,
        error: err,
      });
      Alert.alert("Link Failed", "Unable to open the link. Please try again.");
    }
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      try {
        await deregisterPushToken(getToken);
      } catch (deregErr) {
        console.warn("[Settings] deregisterPushToken failed (non-blocking)", deregErr);
      }
      await signOut();
      queryClient.clear();
      router.replace("/");
    } catch (err) {
      console.error("[Settings] signOut failed", { userId, action: "signOut", error: err });
      Alert.alert("Sign Out Failed", "Unable to sign out. Please try again.");
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleSignInOut = async () => {
    if (isSignedIn) {
      await handleSignOut();
    } else {
      router.push("/sign-in");
    }
  };

  return (
    <View className="flex-1 bg-background">
      <DashboardBar title="Settings" onBack={() => router.back()} />
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: getTabBarPaddingBottom(insets.bottom),
        }}
      >
        {/* Public scanner — visible to everyone (signed in or not), phones only. */}
        {SCANNING_SUPPORTED && (
          <View className="mt-4 mx-4 rounded-card bg-white-5 overflow-hidden">
            <MenuRow
              item={isSignedIn ? SCANNER_ITEM_ACCOUNT : SCANNER_ITEM}
              onPress={() => handlePress(isSignedIn ? SCANNER_ITEM_ACCOUNT : SCANNER_ITEM)}
              isLast
            />
          </View>
        )}

        {/* Main menu items — Account and Notifications gated on auth */}
        <View className="mt-6 mx-4 rounded-card bg-white-5 overflow-hidden">
          {MENU_ITEMS.filter(
            (item) =>
              (item.id !== "account" && item.id !== "notifications") ||
              isSignedIn,
          ).map((item, i, arr) => (
            <MenuRow
              key={item.id}
              item={item}
              onPress={() => handlePress(item)}
              isLast={i === arr.length - 1}
            />
          ))}
        </View>

        {/* Legal links — public */}
        <View className="mt-6 mx-4 rounded-card bg-white-5 overflow-hidden">
          {LEGAL_ITEMS.map((item, i) => (
            <MenuRow
              key={item.id}
              item={item}
              onPress={() => handlePress(item)}
              isLast={i === LEGAL_ITEMS.length - 1}
            />
          ))}
        </View>

        {/* App version — read from native Info.plist / AndroidManifest. */}
        <Text className="mt-2 mb-1 text-white-50 text-md leading-7 font-poppins text-center">
          v{Application.nativeApplicationVersion ?? "—"}
        </Text>

        {/* Sign In / Sign Out — neutral spinner while auth resolves so a
            resuming signed-in user never sees a transient "Sign In". */}
        <View className="mt-3 mx-4">
          <Pressable
            onPress={handleSignInOut}
            disabled={isSigningOut || authResolving}
            className={`w-full bg-white-100 rounded-pill py-[12px] items-center justify-center ${isSigningOut || authResolving ? "opacity-70" : ""}`}
          >
            {authResolving ? (
              <ActivityIndicator color={colors.dark} />
            ) : (
              <Text className="text-dark text-base leading-[22px] font-poppins-medium">
                {isSignedIn ? "Sign Out" : "Sign In"}
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
