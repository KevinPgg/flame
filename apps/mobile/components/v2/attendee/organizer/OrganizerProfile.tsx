/**
 * Flame 2.0 organizer profile (fase 2.4), app. Prototype `SCREENS.org`: cover (or the logo
 * blurred), big logo, name, city and Instagram, share; the description; events in a 2-column grid
 * with Upcoming / Past. Data: the same hooks as the v1 screen (organizations, the Home's events,
 * co-hosted ids, past events). Fase 4.2: followers count (public API) and Follow / Following.
 */
import { useCallback, useMemo, useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, Share, Text, useWindowDimensions, View } from "react-native";
import { Image } from "expo-image";
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { flameV2Colors as c } from "@project-flame/lib";
import { useI18n } from "../../../../lib/i18n";
import { useAppEvents } from "../../../../hooks/useAppEvents";
import { useOrganizations } from "../../../../hooks/useOrganizations";
import { usePastOrgEvents } from "../../../../hooks/usePastOrgEvents";
import { useOrgCohostEventIds } from "../../../../hooks/useOrgCohostEventIds";
import { getTabBarPaddingBottom } from "../../../navigation/CustomTabBar";
import type { FeedEvent } from "../home/EventFeedCard";
import { EventTile } from "../EventTile";
import { FollowButton } from "../FollowButton";
import { useFollowerCount } from "../../../../hooks/useFollowing";
import { Button, ErrorBox, Icon, OrgAvatar, Skeleton } from "../../ui";

const circle = { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(28,28,28,0.82)" } as const;

export function OrganizerProfile({ slug }: { slug: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [seg, setSeg] = useState<"up" | "past">("up");
  const [refreshing, setRefreshing] = useState(false);
  const events = useAppEvents();
  const orgs = useOrganizations();
  const org = useMemo(() => orgs.data?.find((o: { slug: string }) => o.slug === slug), [orgs.data, slug]) as
    | { id: string; name: string; slug: string; logo_url?: string | null; cover_image_url?: string | null; description?: string | null; instagram_handle?: string | null; city?: string | null }
    | undefined;
  const past = usePastOrgEvents(org?.id);
  const followers = useFollowerCount(org?.id);
  const cohost = useOrgCohostEventIds(org?.id);

  const upcoming = useMemo(() => {
    const raw = ((events.data as { rawEvents?: FeedEvent[] } | undefined)?.rawEvents ?? []) as FeedEvent[];
    return raw.filter((e) => e.organizations?.slug === slug || cohost.data?.has(e.id));
  }, [events.data, slug, cohost.data]);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/" as Href));
  const share = useCallback(() => {
    void Share.share({ message: `https://flme.co/organizer/${slug}` }).catch(() => {});
  }, [slug]);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([events.refetch(), orgs.refetch(), org?.id ? past.refetch() : null, org?.id ? cohost.refetch() : null, org?.id ? followers.refetch() : null]);
    } finally {
      setRefreshing(false);
    }
  }, [events, orgs, past, cohost, followers, org?.id]);

  const topRow = (
    <View style={{ paddingTop: insets.top + 8 }} className="absolute left-0 right-0 top-0 z-10 flex-row justify-between px-4">
      <Pressable onPress={back} accessibilityRole="button" accessibilityLabel={t("common.back")} style={circle} className="items-center justify-center">
        <Icon name="back" size={20} color={c.cream} />
      </Pressable>
      {org ? (
        <Pressable onPress={share} accessibilityRole="button" accessibilityLabel={t("organizerPage.share", { name: org.name })} style={circle} className="items-center justify-center">
          <Icon name="share" size={19} color={c.cream} />
        </Pressable>
      ) : null}
    </View>
  );

  if (!org) {
    const loading = orgs.isLoading;
    return (
      <View className="flex-1 bg-black">
        {topRow}
        <View style={{ paddingTop: insets.top + 80 }} className="flex-1 items-center px-8">
          {loading ? (
            <View className="w-full gap-3" accessibilityLabel={t("common.loading")}>
              <Skeleton width={96} height={96} radius={22} />
              <Skeleton width={"60%"} height={28} />
            </View>
          ) : orgs.isError ? (
            <ErrorBox onRetry={() => void orgs.refetch()} />
          ) : (
            <>
              <Text className="text-center font-v2-display-bold text-[20px] text-v2-cream">{t("organizerPage.notFound")}</Text>
              <View className="mt-4">
                <Button variant="primary" small label={t("wallet.findEvents")} onPress={() => router.replace("/" as Href)} />
              </View>
            </>
          )}
        </View>
      </View>
    );
  }

  const ig = org.instagram_handle?.trim().replace(/^@+/, "") || "";
  const cover = org.cover_image_url || org.logo_url || null;
  const tileW = (width - 16 * 2 - 12) / 2;
  const pastList = past.data ?? [];

  return (
    <View className="flex-1 bg-black">
      {topRow}
      <ScrollView
        contentContainerStyle={{ paddingBottom: getTabBarPaddingBottom(insets.bottom) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={c.cream} colors={[c.cream]} progressBackgroundColor={c.ink3} />}
      >
        <View style={{ height: 190 + insets.top, backgroundColor: c.ink3, overflow: "hidden" }}>
          {cover ? (
            <Image
              testID="org-cover"
              source={{ uri: cover }}
              style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: org.cover_image_url ? 1 : 0.55 }}
              blurRadius={org.cover_image_url ? 0 : 40}
              contentFit="cover"
            />
          ) : null}
        </View>
        <View className="px-4">
          <View className="flex-row items-end justify-between">
            <View style={{ marginTop: -48, borderRadius: 24, borderWidth: 4, borderColor: "#000" }}>
              <OrgAvatar name={org.name} logoUrl={org.logo_url ?? null} size={92} />
            </View>
            <View className="mb-1">
              <FollowButton org={{ id: org.id, name: org.name, slug: org.slug, logo_url: org.logo_url ?? null, city: org.city ?? null }} />
            </View>
          </View>
          <Text accessibilityRole="header" className="mt-3 font-v2-display-bold text-[30px] leading-[32px] tracking-[-1px] text-v2-cream">
            {org.name}
          </Text>
          <View className="mt-1.5 flex-row flex-wrap items-center gap-x-4 gap-y-1">
            {org.city ? (
              <View className="flex-row items-center gap-1">
                <Icon name="pin" size={14} color={c.c70} />
                <Text className="font-v2-ui text-[14px] text-v2-c70">{org.city}</Text>
              </View>
            ) : null}
            {ig ? (
              <Pressable onPress={() => void Linking.openURL(`https://instagram.com/${ig}`).catch(() => {})} accessibilityRole="link" accessibilityLabel={t("organizerPage.instagram", { handle: ig })}>
                <Text className="font-v2-ui text-[14px] text-v2-c70">@{ig}</Text>
              </Pressable>
            ) : null}
            {followers.data !== undefined ? (
              <Text testID="org-followers" className="font-v2-ui text-[14px] text-v2-c70">
                <Text className="font-v2-ui-semibold text-v2-cream">{followers.data.toLocaleString(locale)}</Text> {t("follow.followersWord", { count: followers.data })}
              </Text>
            ) : null}
            <Text className="font-v2-ui text-[14px] text-v2-c70">{t("organizerPage.eventsCount", { count: upcoming.length })}</Text>
          </View>
          {org.description ? <Text className="mt-4 font-v2-ui text-[15px] leading-[22px] text-v2-c90">{org.description}</Text> : null}

          <View className="mb-5 mt-7 flex-row gap-1 rounded-v2-pill bg-[#1A1A1A] p-1" accessibilityRole="tablist">
            {(["up", "past"] as const).map((k) => {
              const on = seg === k;
              return (
                <Pressable key={k} onPress={() => setSeg(k)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ backgroundColor: on ? c.cream : "transparent" }} className="h-9 flex-1 items-center justify-center rounded-v2-pill">
                  <Text style={{ color: on ? c.ink : c.c70 }} className="font-v2-ui-semibold text-[14px]">
                    {k === "up" ? t("organizerPage.upcoming") : t("organizerPage.past")}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {seg === "up" ? (
            upcoming.length === 0 ? (
              <View className="items-center py-10">
                <Text className="text-center font-v2-display-bold text-[18px] text-v2-cream">{t("organizerPage.noUpcoming")}</Text>
                <Text className="mt-1 text-center font-v2-ui text-[14px] text-v2-c70">{t("organizerPage.noUpcomingBody", { name: org.name })}</Text>
              </View>
            ) : (
              <View className="flex-row flex-wrap" style={{ gap: 12, rowGap: 22 }}>
                {upcoming.map((e) => (
                  <EventTile key={e.id} event={e} width={tileW} />
                ))}
              </View>
            )
          ) : pastList.length === 0 ? (
            <Text className="py-10 text-center font-v2-ui text-[14px] text-v2-c70">{t("wallet.emptyPast")}</Text>
          ) : (
            <View className="flex-row flex-wrap" style={{ gap: 12, rowGap: 22 }}>
              {pastList.map((e) => (
                <Pressable key={e.id} onPress={() => router.push(`/event/${e.id}` as Href)} accessibilityRole="link" style={{ width: tileW }} className="active:opacity-80">
                  <View style={{ width: tileW, height: tileW * 1.25, borderRadius: 14, overflow: "hidden", backgroundColor: c.ink3, opacity: 0.7 }}>
                    {e.imageUrl ? <Image source={{ uri: e.imageUrl }} style={{ width: tileW, height: tileW * 1.25 }} contentFit="cover" /> : null}
                  </View>
                  <Text numberOfLines={2} className="mt-2 font-v2-display-bold text-[15px] leading-[18px] text-v2-cream">{e.title}</Text>
                  <Text numberOfLines={1} className="font-v2-ui text-[12.5px] text-v2-c70">{e.date}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
