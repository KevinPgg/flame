/**
 * Floating "Purchase in progress" in the app (Kevin 2026-10-28): the buyer's running reservation
 * (GET /api/holds/active, from the server — it's still there after leaving the screen or closing
 * the app) with the event, "2 × Tier · 12:34 left" and Continue → the payment screen. Above the
 * tab bar (or above the event screen's bottom bar); hidden on the payment screen. It goes away
 * when the reservation is paid, released or expires; ✕ hides that reservation until the app
 * restarts.
 */
import { useEffect, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { usePathname, useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { flameV2Colors as c, holdCountdown } from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { apiGet } from "../../../lib/api";
import { useOptionalAuth } from "../../../hooks/useOptionalAuth";
import { Icon } from "../ui";

export type ActiveHold = {
  id: string;
  expires_at: string;
  quantity: number;
  tier: string;
  event: { name: string; slug: string; image_url: string | null } | null;
};

export const ACTIVE_HOLD_KEY = ["active-hold"] as const;

/** Where the pill sits: the payment screen hides it; the event screen has its own bottom bar. */
export function inProgressPlacement(pathname: string): "hidden" | "aboveBuyBar" | "aboveTabBar" {
  if (pathname.startsWith("/checkout/")) return "hidden";
  if (pathname.startsWith("/event/")) return "aboveBuyBar";
  return "aboveTabBar";
}

export function PurchaseInProgress({ fetcher = apiGet }: { fetcher?: typeof apiGet }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const insets = useSafeAreaInsets();
  const { isSignedIn, getToken } = useOptionalAuth();
  const [hidden, setHidden] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const place = inProgressPlacement(pathname);

  const q = useQuery({
    queryKey: ACTIVE_HOLD_KEY,
    queryFn: async () => (await fetcher<{ hold: ActiveHold | null }>("/api/holds/active", getToken)).hold,
    enabled: isSignedIn === true,
    refetchInterval: 60_000,
    staleTime: 10_000,
  });
  const { refetch } = q;

  // Look again when the screen changes and when the app comes back to the front.
  useEffect(() => {
    if (isSignedIn) void refetch();
  }, [pathname, isSignedIn, refetch]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s === "active" && isSignedIn && void refetch());
    return () => sub.remove();
  }, [isSignedIn, refetch]);

  const hold = q.data ?? null;
  useEffect(() => {
    if (!hold) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hold]);

  const cd = hold ? holdCountdown(hold.expires_at, now) : null;
  if (!isSignedIn || place === "hidden" || !hold || !cd || cd.expired || hidden === hold.id) return null;

  const bottom = place === "aboveBuyBar" ? Math.max(insets.bottom, 12) + 76 : Math.max(insets.bottom, 12) + 64 + 10;

  return (
    <View
      testID="purchase-in-progress"
      accessibilityRole="summary"
      accessibilityLabel={t("checkout.inProgress")}
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom,
        zIndex: 40,
        borderWidth: 1,
        borderColor: cd.warn ? "rgba(255,180,67,0.4)" : c.c10,
        backgroundColor: "rgba(20,20,20,0.97)",
      }}
      className="flex-row items-center gap-3 rounded-[18px] p-2.5 pr-3"
    >
      <View style={{ width: 44, height: 44, borderRadius: 10, overflow: "hidden", backgroundColor: c.ink3 }}>
        {hold.event?.image_url ? <Image source={{ uri: hold.event.image_url }} style={{ width: 44, height: 44 }} contentFit="cover" /> : null}
      </View>
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-1">
          <Icon name="clock" size={12} color={cd.warn ? c.warn : c.c50} />
          <Text style={{ color: cd.warn ? c.warn : c.c50 }} className="font-v2-ui-semibold text-[11px] uppercase tracking-[0.5px]">
            {t("checkout.inProgress")}
          </Text>
        </View>
        <Text numberOfLines={1} className="font-v2-ui-semibold text-[14px] text-v2-cream">{hold.event?.name ?? ""}</Text>
        <Text numberOfLines={1} className="font-v2-ui text-[12.5px] text-v2-c70">
          {t("checkout.inProgressLine", { quantity: hold.quantity, tier: hold.tier, time: cd.label })}
        </Text>
      </View>
      <Pressable
        onPress={() => router.push(`/checkout/${hold.id}` as Href)}
        accessibilityRole="button"
        accessibilityLabel={t("checkout.continue2")}
        className="h-10 justify-center rounded-v2-pill bg-v2-cream px-4 active:bg-v2-paper"
      >
        <Text className="font-v2-ui-semibold text-[14px] text-v2-ink">{t("checkout.continue2")}</Text>
      </Pressable>
      <Pressable onPress={() => setHidden(hold.id)} accessibilityRole="button" accessibilityLabel={t("checkout.hide")} hitSlop={8}>
        <Icon name="close" size={16} color={c.c50} />
      </Pressable>
    </View>
  );
}
