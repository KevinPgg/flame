/**
 * UpdateAvailableBanner — slim, dismissible banner shown when the user is on
 * a version >= minimum_version but < latest_version.
 *
 * Dismissal persists per `latest_version` (SecureStore) so a single dismissal
 * doesn't suppress future banners; once the operator bumps `latest_version`,
 * the banner re-appears automatically.
 *
 * Anchored ABOVE the floating tab bar (not at the top of the screen) — the
 * top edge is owned by the global Header whose logo + icons sit at the
 * screen edges and would leak past a rounded pill there. Pinning to the
 * bottom keeps the banner in a quiet region of the layout, visually attached
 * to the persistent nav surface, matching the "in-app toast" pattern.
 */

import { useCallback } from "react";
import { View, Pressable, Linking, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { FlameText, colors } from "@project-flame/ui";
import {
  TAB_BAR_PILL_HEIGHT,
  TAB_BAR_PILL_MARGIN,
} from "../navigation/CustomTabBar";

// NOTE: iOS-only today. When Android ships, swap "App Store" for a
// platform-aware label — see docs/historico/todos/VERSION_GATE_TODOS.md
// "Android store-name localization".

interface UpdateAvailableBannerProps {
  storeUrl: string;
  onDismiss: () => void;
}

export function UpdateAvailableBanner({
  storeUrl,
  onDismiss,
}: UpdateAvailableBannerProps) {
  const insets = useSafeAreaInsets();

  const handleUpdate = useCallback(async () => {
    const url = storeUrl?.trim();
    if (!url) return;
    try {
      const canOpen = await Linking.canOpenURL(url);
      const fallback = url.startsWith("itms-apps://")
        ? url.replace("itms-apps://", "https://")
        : url;
      await Linking.openURL(canOpen ? url : fallback);
    } catch (err) {
      console.warn("[UpdateAvailableBanner] failed to open store URL", err);
    }
  }, [storeUrl]);

  return (
    // Absolute-positioned toast-style overlay — `pointerEvents="box-none"` on
    // the outer wrapper means taps pass through to the app where the banner
    // isn't, so screen content below the banner can still be tapped. The
    // inner pill catches its own taps (Update / dismiss).
    <View
      pointerEvents="box-none"
      className="absolute left-0 right-0 px-3"
      // Anchored ABOVE the floating tab bar (sourced from CustomTabBar
      // constants so the offset stays in sync if the tab-bar geometry
      // changes). Bottom = safe-area + tab-bar margin + tab-bar height +
      // 12pt gap. Anchoring at the bottom avoids the header edge-bleed
      // issue we hit at the top (the Header's logo + icons sit at the
      // screen edges, outside a rounded pill's bounds).
      //
      // Explicit numeric zIndex — NativeWind's `z-*` classes can lose to
      // other absolutely-positioned ancestors. 9999 sits above every
      // in-app surface but below the OTA Modal (Modal is its own native
      // window). `elevation` set for Android parity.
      style={{
        bottom: insets.bottom + TAB_BAR_PILL_MARGIN + TAB_BAR_PILL_HEIGHT + 12,
        zIndex: 9999,
        elevation: 9999,
      }}
    >
      {/* Solid `bg-surface` (not translucent) per design feedback — the
          banner must fully obscure whatever app content scrolls beneath it.
          Matches the elevated-surface treatment of cards / sheets. */}
      <View
        className="flex-row items-center gap-[10px] rounded-pill border border-white-20 bg-surface px-[14px] py-[10px]"
        accessibilityLiveRegion={Platform.OS === "android" ? "polite" : undefined}
      >
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: "rgba(255,255,255,0.1)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons
            name="arrow-up-circle-outline"
            size={18}
            color={colors["white-100"]}
          />
        </View>

        <View style={{ flex: 1 }}>
          <FlameText
            variant="subtitle1"
            className="text-white-100 font-poppins-medium"
          >
            New version of Flame available
          </FlameText>
        </View>

        <Pressable
          onPress={handleUpdate}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Update Flame on the App Store"
        >
          <FlameText
            variant="subtitle1"
            className="text-white-100 font-poppins-semibold"
          >
            Update
          </FlameText>
        </Pressable>

        <Pressable
          onPress={onDismiss}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Dismiss update banner"
        >
          <Ionicons name="close" size={18} color={colors["white-50"]} />
        </Pressable>
      </View>
    </View>
  );
}
