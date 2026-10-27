/**
 * Flame 2.0 "My tickets" (fase 2.3), app. Prototype `SCREENS.wallet`: counters (Total ·
 * Purchased · Pending, same numbers as v1), Upcoming / Past, one card per event with its flyer,
 * when it is ("In 3 days") and a QR button; RSVP requests with their state right in the list.
 * Tapping an event opens its tickets (all of them, swipeable — TicketPager). Data: the existing
 * useUserTickets (decision 2026-10-27); rules in packages/lib/utils/wallet.
 */
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  buildWallet,
  flameV2Colors as c,
  walletDayTime,
  walletWhen,
  type WalletEvent,
  type WalletEventInfo,
  type WalletRequest,
} from "@project-flame/lib";
import { useI18n } from "../../../../lib/i18n";
import { useUserTickets } from "../../../../hooks/useUserTickets";
import { useScrollToTop } from "../../../../contexts/ScrollToTopContext";
import { useScrollRegistration } from "../../../../hooks/useScrollRegistration";
import { getTabBarPaddingBottom } from "../../../navigation/CustomTabBar";
import { Button, ErrorBox, Icon, Skeleton } from "../../ui";

type Seg = "up" | "past";

function useWhenLabel() {
  const { t, locale } = useI18n();
  return (e: WalletEventInfo) => {
    const w = walletWhen(e);
    const { day } = walletDayTime(e.starts_at, e.timezone, locale);
    if (w.kind === "now") return t("wallet.now");
    if (w.kind === "today") return t("wallet.today");
    if (w.kind === "tomorrow") return t("wallet.tomorrow");
    if (w.kind === "days") return t("wallet.inDays", { count: w.days });
    return day;
  };
}

function Poster({ src, w, h, r }: { src?: string | null; w: number; h: number; r: number }) {
  return (
    <View style={{ width: w, height: h, borderRadius: r, overflow: "hidden", backgroundColor: c.ink3 }}>
      {src ? <Image source={{ uri: src }} style={{ width: w, height: h }} contentFit="cover" /> : null}
    </View>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <View className="mt-1 self-start rounded-v2-pill bg-v2-ink3 px-2.5 py-1">
      <Text className="font-v2-ui-semibold text-[12px] text-v2-c90">{children}</Text>
    </View>
  );
}

function EventCard({ w }: { w: WalletEvent }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const when = useWhenLabel();
  const e = w.event;
  const { time } = walletDayTime(e.starts_at, e.timezone, locale);
  const first = w.tickets[0]!;
  const summary = [t("tickets.count", { count: w.tickets.length }), w.tiers.join(", ")].filter(Boolean).join(" · ");
  return (
    <Pressable
      onPress={() => router.push(`/ticket/${first.id}` as Href)}
      accessibilityRole="button"
      accessibilityLabel={t("wallet.showQr", { name: e.name })}
      className="mb-2.5 flex-row items-center gap-3.5 rounded-[18px] bg-[#121212] p-2.5 active:opacity-80"
    >
      <Poster src={e.image_url} w={78} h={98} r={11} />
      <View className="min-w-0 flex-1 gap-[3px]">
        <Text className="font-v2-ui-semibold text-[12px] uppercase tracking-[0.6px] text-v2-c70">{when(e)}</Text>
        <Text numberOfLines={2} className="font-v2-display-bold text-[17px] leading-[20px] text-v2-cream">
          {e.name}
        </Text>
        <Text numberOfLines={1} className="mb-1 font-v2-ui text-[13px] text-v2-c50">
          {[time, e.venue].filter(Boolean).join(" · ")}
        </Text>
        <Tag>{summary}</Tag>
        {w.checkedIn > 0 ? <Text className="font-v2-ui text-[12px] text-v2-c50">{t("wallet.checkedIn", { count: w.checkedIn })}</Text> : null}
      </View>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.cream }} className="items-center justify-center">
        <Icon name="qr" size={18} color={c.ink} />
      </View>
    </Pressable>
  );
}

function RequestCard({ r }: { r: WalletRequest }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const e = r.event;
  const { day } = walletDayTime(e.starts_at, e.timezone, locale);
  const warn = r.state === "pending" || r.state === "approved";
  return (
    <View className="mb-2.5 flex-row items-center gap-3.5 rounded-[18px] bg-[#121212] p-2.5">
      <Poster src={e.image_url} w={78} h={98} r={11} />
      <View className="min-w-0 flex-1 items-start gap-[3px]">
        <Text style={{ color: warn ? c.warn : c.c50 }} className="font-v2-ui-semibold text-[12px] uppercase tracking-[0.6px]">
          {t(`wallet.request.${r.state}`)}
        </Text>
        <Text numberOfLines={2} className="font-v2-display-bold text-[17px] leading-[20px] text-v2-cream">
          {e.name}
        </Text>
        <Text numberOfLines={1} className="font-v2-ui text-[13px] text-v2-c50">
          {[day, e.venue, t("tickets.count", { count: r.quantity })].filter(Boolean).join(" · ")}
        </Text>
        <Text className="font-v2-ui text-[12.5px] leading-[17px] text-v2-c70">{t(`wallet.requestHint.${r.state}`)}</Text>
        <Pressable onPress={() => router.push(`/event/${e.id}` as Href)} accessibilityRole="link" hitSlop={6} className="mt-1 active:opacity-70">
          <Text className="font-v2-ui-semibold text-[13px] text-v2-cream underline">{t("wallet.seeEvent")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PastRow({ w }: { w: WalletEvent }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const e = w.event;
  const { day } = walletDayTime(e.starts_at, e.timezone, locale);
  return (
    <Pressable
      onPress={() => router.push(`/ticket/${w.tickets[0]!.id}` as Href)}
      accessibilityRole="button"
      accessibilityLabel={t("wallet.showQr", { name: e.name })}
      className="flex-row items-center gap-3 px-4 py-2.5 active:bg-v2-ink3"
    >
      <Poster src={e.image_url} w={48} h={60} r={8} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="font-v2-ui-semibold text-[15px] text-v2-cream">{e.name}</Text>
        <Text numberOfLines={1} className="font-v2-ui text-[13px] text-v2-c50">{day}</Text>
        <Text numberOfLines={1} className="font-v2-ui text-[13px] text-v2-c50">{e.venue}</Text>
      </View>
      <View className="rounded-v2-pill bg-v2-ink3 px-2.5 py-1">
        <Text className="font-v2-ui-semibold text-[12px] text-v2-c90">
          {w.checkedIn > 0 ? t("wallet.attended") : t("tickets.count", { count: w.tickets.length })}
        </Text>
      </View>
    </Pressable>
  );
}

export function Wallet() {
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, refetch } = useUserTickets();
  const [seg, setSeg] = useState<Seg>("up");
  const [refreshing, setRefreshing] = useState(false);
  const { registerScrollRef } = useScrollToTop();
  const wallet = useMemo(() => buildWallet(data?.tickets ?? []), [data?.tickets]);
  const { scrollRef } = useScrollRegistration({ registerScrollRef, isLoading, isError, hasData: !!data });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  let body: ReactNode;
  if (isLoading && !data) {
    body = (
      <View className="gap-2.5 px-4 pt-2" accessibilityLabel={t("common.loading")}>
        {[0, 1, 2].map((i) => (
          <View key={i} className="flex-row gap-3.5 rounded-[18px] bg-[#121212] p-2.5">
            <Skeleton width={78} height={98} radius={11} />
            <View className="flex-1 gap-2 pt-2">
              <Skeleton width={80} height={12} />
              <Skeleton width={"90%"} height={18} />
              <Skeleton width={120} height={12} />
            </View>
          </View>
        ))}
      </View>
    );
  } else if (isError && !data) {
    body = (
      <View className="px-4 pt-4">
        <ErrorBox message={t("wallet.loadError")} onRetry={() => void refetch()} />
      </View>
    );
  } else if (seg === "up") {
    const empty = wallet.upcoming.length === 0 && wallet.requests.length === 0;
    body = empty ? (
      <View className="items-center gap-2 px-8 py-14">
        <Text className="text-center font-v2-display-bold text-[20px] text-v2-cream">{t("wallet.emptyTitle")}</Text>
        <Text className="mb-2 text-center font-v2-ui text-[14.5px] text-v2-c70">{t("wallet.emptyBody")}</Text>
        <Button variant="primary" small label={t("wallet.findEvents")} onPress={() => router.push("/" as Href)} />
      </View>
    ) : (
      <View className="px-4">
        {wallet.upcoming.map((w) => (
          <EventCard key={w.event.id} w={w} />
        ))}
        {wallet.requests.map((r) => (
          <RequestCard key={r.rsvp.id} r={r} />
        ))}
      </View>
    );
  } else {
    body =
      wallet.past.length === 0 ? (
        <Text className="px-8 py-14 text-center font-v2-ui text-[14.5px] text-v2-c70">{t("wallet.emptyPast")}</Text>
      ) : (
        <View>
          {wallet.past.map((w) => (
            <PastRow key={w.event.id} w={w} />
          ))}
        </View>
      );
  }

  const stats: Array<[string, number]> = [
    [t("wallet.total"), wallet.stats.total],
    [t("wallet.purchased"), wallet.stats.purchased],
    [t("wallet.pending"), wallet.stats.pending],
  ];

  return (
    <ScrollView
      ref={scrollRef as never}
      className="flex-1 bg-black"
      contentContainerStyle={{ paddingTop: 6, paddingBottom: getTabBarPaddingBottom(insets.bottom) }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={c.cream} colors={[c.cream]} progressBackgroundColor={c.ink3} />}
    >
      <Text accessibilityRole="header" className="px-4 pb-3 font-v2-display-bold text-[28px] tracking-[-0.8px] text-v2-cream">
        {t("tickets.myTickets")}
      </Text>
      <View className="flex-row gap-2 px-4">
        {stats.map(([label, n]) => (
          <View key={label} accessibilityLabel={`${label}: ${n}`} className="flex-1 rounded-[14px] bg-[#121212] px-3.5 py-3">
            <Text className="font-v2-display-bold text-[22px] text-v2-cream">{isLoading && !data ? "–" : n}</Text>
            <Text className="font-v2-ui-medium text-[12px] text-v2-c50">{label}</Text>
          </View>
        ))}
      </View>
      <View className="mx-4 mb-4 mt-[18px] flex-row gap-1 rounded-v2-pill bg-[#1A1A1A] p-1" accessibilityRole="tablist">
        {(["up", "past"] as const).map((k) => {
          const on = seg === k;
          return (
            <Pressable
              key={k}
              onPress={() => setSeg(k)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={{ backgroundColor: on ? c.cream : "transparent" }}
              className="h-9 flex-1 items-center justify-center rounded-v2-pill"
            >
              <Text style={{ color: on ? c.ink : c.c70 }} className="font-v2-ui-semibold text-[14px]">
                {k === "up" ? t("tickets.upcoming") : t("tickets.past")}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {body}
    </ScrollView>
  );
}
