/**
 * Flame 2.0 attendee bottom bar (fase 2.1): Home · Explore · Tickets · You — the prototype's
 * floating pill (`renderTabbar`, attendee mode), same look as the organizer bar. Replaces the v1
 * CustomTabBar while EXPO_PUBLIC_ATTENDEE_V1 isn't set. Routes are the existing ones (the screens
 * themselves move to v2 in 2.2–2.6). Tickets and You need an account: signed out → sign in.
 */
import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter, usePathname, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { flameV2Colors as c } from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { useOptionalAuth } from "../../../hooks/useOptionalAuth";
import { useScrollToTop } from "../../../contexts/ScrollToTopContext";
import { useKeyboardVisible } from "../../../hooks/v2/useKeyboardVisible";
import { Icon, type IconName } from "../ui";

export type AttendeeTab = "home" | "explore" | "tickets" | "you";

type TabDef = { key: AttendeeTab; icon: IconName; route: string; requiresAuth?: boolean };

export const ATTENDEE_TABS: readonly TabDef[] = [
  { key: "home", icon: "home", route: "/" },
  { key: "explore", icon: "search", route: "/discover" },
  { key: "tickets", icon: "ticket", route: "/dashboard", requiresAuth: true },
  { key: "you", icon: "user", route: "/profile", requiresAuth: true },
];

/** Which tab a path belongs to (none for pushed screens like an event page). */
export function activeAttendeeTab(pathname: string): AttendeeTab | null {
  if (pathname === "/" || pathname === "/index") return "home";
  if (pathname.startsWith("/discover")) return "explore";
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/history") || pathname.startsWith("/ticket/")) return "tickets";
  if (pathname.startsWith("/profile")) return "you";
  return null;
}

export function AttendeeTabBar() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { isSignedIn } = useOptionalAuth();
  const { triggerScrollToTop } = useScrollToTop();
  const typing = useKeyboardVisible();
  const active = activeAttendeeTab(pathname);

  const press = useCallback(
    (tab: TabDef) => {
      if (tab.key === active) {
        if (tab.key === "home") triggerScrollToTop();
        return;
      }
      // Only an explicit signed-out state goes to sign in; while auth resolves, the protected
      // screen's own gate waits (same rule as v1, W8-M1).
      if (tab.requiresAuth && isSignedIn === false) {
        router.push("/sign-in" as Href);
        return;
      }
      router.push(tab.route as Href);
    },
    [active, isSignedIn, router, triggerScrollToTop],
  );

  if (typing) return null;
  return (
    <View
      style={{ bottom: Math.max(insets.bottom, 12) }}
      className="absolute left-4 right-4 h-16 flex-row items-center justify-evenly rounded-v2-pill border border-white/10 bg-[rgba(18,18,18,0.94)]"
      accessibilityRole="tablist"
    >
      {ATTENDEE_TABS.map((tab) => {
        const on = tab.key === active;
        const label = t(`tabs.${tab.key}`);
        return (
          <Pressable
            key={tab.key}
            onPress={() => press(tab)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label}
            hitSlop={6}
            className="min-w-[64px] items-center gap-[3px]"
          >
            <Icon name={tab.icon} size={23} color={on ? c.cream : c.c50} />
            <Text className={`font-v2-ui-medium text-[10.5px] ${on ? "text-v2-cream" : "text-v2-c50"}`}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
