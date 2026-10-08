/**
 * Persistent floating pill tab bar rendered in the root layout.
 *
 * Always visible — sign-in and scanner are presented as fullScreenModals
 * (configured in RoleResolutionGate) which natively cover the entire screen
 * including this tab bar. No custom show/hide animation needed.
 *
 * Single unified 4-tab set for all users (no attendee/organizer split).
 * Event creation moved out of the tab bar into Screen 3 (Organizer Admin) so
 * the action is always scoped to the explicitly selected org — the old
 * global Create tab flickered between orgs and could create events under
 * the wrong org.
 *
 * Uses BlurView for a frosted-glass effect. On iOS 26+ this can be upgraded
 * to expo-glass-effect GlassView for true Liquid Glass.
 */

import { useCallback } from "react";
import { View, Pressable, Platform, StyleSheet } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// BlurView requires native module — unavailable in Expo Go on some SDK versions.
// Gracefully degrade to an opaque fallback so the app stays usable.
let BlurViewComponent: typeof import("expo-blur").BlurView | null = null;
try {
  BlurViewComponent = require("expo-blur").BlurView;
} catch {
  // expo-blur native module not linked (Expo Go)
}
import { colors } from "@project-flame/ui";
import { useScrollToTop } from "../../contexts/ScrollToTopContext";
import { useOptionalAuth } from "../../hooks/useOptionalAuth";

const TAB_ICON_SIZE = 26;
const PILL_HEIGHT = 56;
const PILL_MARGIN_HORIZONTAL = 24;
const PILL_MARGIN_BOTTOM = 8;

/**
 * Total space the floating pill consumes from the bottom of the screen
 * (above safe area insets). Screens should include this + insets.bottom
 * in their scroll contentContainerStyle paddingBottom.
 */
export const TAB_BAR_PILL_HEIGHT = PILL_HEIGHT;
export const TAB_BAR_PILL_MARGIN = PILL_MARGIN_BOTTOM;

/**
 * Returns the paddingBottom that scrollable tab screens should use so
 * content clears the floating pill tab bar.
 */
export function getTabBarPaddingBottom(bottomInset: number): number {
  return bottomInset + PILL_HEIGHT + PILL_MARGIN_BOTTOM + 16;
}

type IoniconsName = keyof typeof Ionicons.glyphMap;

interface TabDef {
  key: string;
  route: string;
  icon: IoniconsName;
  iconFocused: IoniconsName;
  /** If true, tab requires auth — when not signed in, push sign-in instead of route */
  requiresAuth?: boolean;
}

const TABS: TabDef[] = [
  { key: "home", route: "/", icon: "home-outline", iconFocused: "home" },
  {
    key: "search",
    route: "/discover",
    icon: "search-outline",
    iconFocused: "search",
  },
  {
    key: "tickets",
    route: "/dashboard",
    icon: "ticket-outline",
    iconFocused: "ticket",
    requiresAuth: true,
  },
  {
    key: "profile",
    route: "/profile",
    icon: "person-outline",
    iconFocused: "person",
    requiresAuth: true,
  },
];

function isTabActive(pathname: string, tabRoute: string): boolean {
  if (tabRoute === "/") return pathname === "/" || pathname === "/index";
  return pathname.startsWith(tabRoute);
}

export function CustomTabBar() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { isSignedIn } = useOptionalAuth();
  const { triggerScrollToTop } = useScrollToTop();

  const handleTabPress = useCallback(
    (tab: TabDef) => {
      const alreadyActive = isTabActive(pathname, tab.route);
      if (alreadyActive) {
        if (tab.key === "home") {
          triggerScrollToTop();
        }
        return;
      }

      // Only pre-empt to sign-in on an *explicit* signed-out state. While auth
      // is still resolving (isSignedIn === undefined, e.g. on cold relaunch)
      // let the tap through to the protected route — RequireAuthGate there
      // shows a spinner and its grace-period probe handles the transient
      // window, so a resuming signed-in user isn't bounced to /sign-in (W8-M1).
      if (tab.requiresAuth && isSignedIn === false) {
        router.push("/sign-in" as never);
        return;
      }

      router.push(tab.route as never);
    },
    [pathname, isSignedIn, triggerScrollToTop, router],
  );

  return (
    <View
      style={[
        styles.pillContainer,
        {
          bottom: insets.bottom + PILL_MARGIN_BOTTOM,
        },
      ]}
    >
      {BlurViewComponent ? (
        <>
          <BlurViewComponent
            intensity={40}
            tint="dark"
            style={styles.blurFill}
          />
          <View style={styles.pillOverlay} />
        </>
      ) : (
        <View style={styles.opaqueFallback} />
      )}
      <View style={styles.pillBorder} />
      <View style={styles.iconsRow}>
        {TABS.map((tab) => {
          const active = isTabActive(pathname, tab.route);
          const iconColor = active ? colors["white-100"] : colors["white-50"];
          const iconName = active ? tab.iconFocused : tab.icon;

          return (
            <Pressable
              key={tab.key}
              onPress={() => handleTabPress(tab)}
              style={styles.tabButton}
              hitSlop={8}
            >
              {active && <View style={styles.activeIndicator} />}
              <Ionicons
                name={iconName}
                size={TAB_ICON_SIZE}
                color={iconColor}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pillContainer: {
    position: "absolute",
    left: PILL_MARGIN_HORIZONTAL,
    right: PILL_MARGIN_HORIZONTAL,
    height: PILL_HEIGHT,
    borderRadius: PILL_HEIGHT / 2,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
    }),
  },
  blurFill: {
    ...StyleSheet.absoluteFillObject,
  },
  pillOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(8, 19, 26, 0.55)",
  },
  opaqueFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surface,
  },
  pillBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: PILL_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  iconsRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  },
  activeIndicator: {
    position: "absolute",
    top: 6,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors["white-100"],
  },
});
