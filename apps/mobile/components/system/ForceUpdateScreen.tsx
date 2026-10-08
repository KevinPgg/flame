/**
 * ForceUpdateScreen — non-dismissible full-screen blocker shown when the
 * user's native binary version is below `minimum_version` in app_config.
 *
 * Renders ABOVE the router/tabs (mounted as a sibling of the navigator in
 * _layout.tsx), so there's no back gesture, no swipe-down, no tab bar.
 *
 * Industry pattern: matches the banking-app / Cash App / Robinhood "your app
 * is too old" surface. Single CTA opens the App Store via itms-apps:// for an
 * instant native handoff (falls back to the https:// equivalent via Linking).
 *
 * Accessibility (Tier 1 hardening from the plan):
 *   - The CTA has accessibilityRole="button" + a clear label.
 *   - Hit target is 56pt tall (well above the 44pt iOS minimum).
 *   - Visible focus state is implicit via the Pressable's pressed-opacity.
 *   - No color-only state (label + icon both carry meaning).
 */

import { useCallback, useState } from "react";
import {
  View,
  Pressable,
  Linking,
  Image,
  Platform,
  ActivityIndicator,
  Alert,
  Text,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FlameText, colors } from "@project-flame/ui";

// NOTE: Flame is iOS-only at the moment, so all user-facing strings reference
// "App Store" directly. When Android ships, swap these literals for a
// platform-aware constant — see docs/todos/VERSION_GATE_TODOS.md
// "Android store-name localization" for the planned fix and call sites.

interface ForceUpdateScreenProps {
  title: string;
  message: string;
  storeUrl: string;
}

export function ForceUpdateScreen({
  title,
  message,
  storeUrl,
}: ForceUpdateScreenProps) {
  const [opening, setOpening] = useState(false);

  const handleOpenStore = useCallback(async () => {
    if (opening) return;
    setOpening(true);
    try {
      const url = storeUrl?.trim();
      if (!url) {
        Alert.alert(
          "App Store unavailable",
          "Please open the App Store manually and update Flame to continue.",
        );
        return;
      }

      // Try the itms-apps:// scheme first (instant native handoff on iOS).
      // If that fails (very old iOS or simulator without App Store), fall
      // back to the https:// equivalent which Safari can handle.
      let canOpen = false;
      try {
        canOpen = await Linking.canOpenURL(url);
      } catch {
        canOpen = false;
      }

      const fallback = url.startsWith("itms-apps://")
        ? url.replace("itms-apps://", "https://")
        : url;

      if (canOpen) {
        await Linking.openURL(url);
      } else {
        await Linking.openURL(fallback);
      }
    } catch (err) {
      console.error("[ForceUpdateScreen] failed to open store URL", err);
      Alert.alert(
        "Couldn't open the App Store",
        "Please open the App Store manually and update Flame to continue.",
      );
    } finally {
      setOpening(false);
    }
  }, [storeUrl, opening]);

  return (
    <View
      className="flex-1 bg-background"
      // accessibilityViewIsModal traps VoiceOver focus inside this screen on
      // iOS — exactly the behavior we want for a non-dismissible blocker.
      accessibilityViewIsModal={Platform.OS === "ios"}
      accessibilityLabel="Update required"
    >
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 32,
          gap: 24,
        }}
      >
        {/* Logo / hero glyph */}
        <View
          style={{
            width: 120,
            height: 120,
            borderRadius: 60,
            backgroundColor: "rgba(255,255,255,0.06)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: 44,
              backgroundColor: "rgba(255,255,255,0.1)",
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.15)",
            }}
          >
            <Image
              source={require("../../assets/new-flame-icon.png")}
              style={{ width: 56, height: 56, borderRadius: 12 }}
              resizeMode="contain"
              accessible={false}
            />
          </View>
        </View>

        <FlameText
          variant="h3"
          className="text-white-100 text-center font-poppins-semibold"
          accessibilityRole="header"
        >
          {title}
        </FlameText>

        <FlameText
          variant="body"
          className="text-white-80 text-center"
          style={{ lineHeight: 22 }}
        >
          {message}
        </FlameText>

        {/* CTA — fixed 56pt height ensures >>44pt hit target across all
            device sizes. White pill matches every other primary CTA in the
            app per flame-design-system.mdc. Uses className (not inline style)
            because the canonical `PillButton` pattern showed that Pressable's
            `style={() => ({...})}` callback can silently drop background +
            text colors on some RN/NativeWind combinations (which is exactly
            what produced the "faded button" bug in the first ship). Raw
            <Text> + `text-dark` for the label per the design-system
            "FlameText gotcha" note. */}
        <Pressable
          onPress={handleOpenStore}
          disabled={opening}
          accessibilityRole="button"
          accessibilityLabel="Update Flame on the App Store"
          accessibilityHint="Opens the App Store so you can download the latest version"
          accessibilityState={{ disabled: opening, busy: opening }}
          className={`mt-2 h-14 min-w-[220px] flex-row items-center justify-center gap-[10px] rounded-pill bg-white-100 px-8 ${
            opening ? "opacity-70" : "active:opacity-85"
          }`}
        >
          {opening ? (
            <ActivityIndicator size="small" color={colors.dark} />
          ) : (
            <>
              <Ionicons name="cloud-download-outline" size={20} color={colors.dark} />
              <Text className="text-base leading-[22px] font-poppins-semibold text-dark">
                Update on App Store
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}
