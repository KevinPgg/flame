/**
 * Flame 2.0 Explore (fase 2.5), app. Prototype `SCREENS.explore`: search on top (events by
 * name, venue, city or organizer; organizers by name — "como hoy", rules in lib/explore);
 * idle: featured events, featured organizers, "Host your own events" (the v1 apply sheet) and
 * FAQs. Categories, followers and artist/venue search are fase 4 (not shown).
 * Data: the existing useAppEvents and useOrganizations (decision 2026-10-27).
 */
import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { Image } from "expo-image";
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { faqs, featuredFirst, flameV2Colors as c, searchExplore } from "@project-flame/lib";
import { useI18n } from "../../../../lib/i18n";
import { useAppEvents } from "../../../../hooks/useAppEvents";
import { useOrganizations } from "../../../../hooks/useOrganizations";
import { useUserOrgs, type UserOrg } from "../../../../hooks/useUserOrgs";
import { useOptionalAuth } from "../../../../hooks/useOptionalAuth";
import { useScrollToTop } from "../../../../contexts/ScrollToTopContext";
import { useScrollRegistration } from "../../../../hooks/useScrollRegistration";
import { getTabBarPaddingBottom } from "../../../navigation/CustomTabBar";
import { BecomeOrganizerSheet } from "../../../navigation/BecomeOrganizerSheet";
import type { FeedEvent } from "../home/EventFeedCard";
import { EventTile } from "../EventTile";
import { Button, ErrorBox, Icon, OrgAvatar } from "../../ui";

type Org = { id: string; name: string; slug: string; logo_url?: string | null; cover_image_url?: string | null; city?: string | null };

function OrgCard({ org, width }: { org: Org; width: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const cover = org.cover_image_url || org.logo_url || null;
  return (
    <Pressable
      onPress={() => router.push(`/organizer/${org.slug}` as Href)}
      accessibilityRole="link"
      accessibilityLabel={t("explore.seeOrganizer", { name: org.name })}
      style={{ width, borderRadius: 18, overflow: "hidden", backgroundColor: "#121212" }}
      className="active:opacity-80"
    >
      <View style={{ height: 90, backgroundColor: c.ink3 }}>
        {cover ? <Image source={{ uri: cover }} style={{ height: 90, opacity: org.cover_image_url ? 1 : 0.6 }} blurRadius={org.cover_image_url ? 0 : 30} contentFit="cover" /> : null}
      </View>
      <View className="px-3.5 pb-3.5">
        <View style={{ marginTop: -26, alignSelf: "flex-start", borderRadius: 16, borderWidth: 3, borderColor: "#121212" }}>
          <OrgAvatar name={org.name} logoUrl={org.logo_url ?? null} size={50} />
        </View>
        <Text numberOfLines={1} className="mt-2 font-v2-ui-semibold text-[15px] text-v2-cream">{org.name}</Text>
        {org.city ? <Text numberOfLines={1} className="font-v2-ui text-[12.5px] text-v2-c50">{org.city}</Text> : null}
      </View>
    </Pressable>
  );
}

function HostCard() {
  const { t } = useI18n();
  const router = useRouter();
  const { isSignedIn } = useOptionalAuth();
  const orgs = useUserOrgs();
  const [sheet, setSheet] = useState(false);
  const list = (orgs.data as UserOrg[] | undefined) ?? [];
  // v1 rule: people who already run an approved organization reach it from "You"/Manage.
  if (isSignedIn && (orgs.isLoading || list.some((o) => o.approved))) return null;
  const pending = list.length > 0;
  return (
    <View className="mx-4 rounded-[20px] bg-[#1d0a0d] p-5">
      <Text className="font-v2-ui-semibold text-[12px] uppercase tracking-[0.7px] text-v2-c70">{t("explore.hostKicker")}</Text>
      <Text className="mt-1 font-v2-display-bold text-[22px] tracking-[-0.6px] text-v2-cream">{t("explore.hostTitle")}</Text>
      <Text className="mb-4 mt-1 font-v2-ui text-[14px] leading-[20px] text-v2-c70">{pending ? t("explore.hostPending") : t("explore.hostBody")}</Text>
      {!pending ? (
        <View className="self-start">
          <Button variant="primary" small label={t("explore.hostCta")} onPress={() => (isSignedIn ? setSheet(true) : router.push("/sign-in" as Href))} />
        </View>
      ) : null}
      <BecomeOrganizerSheet visible={sheet} onClose={() => setSheet(false)} />
    </View>
  );
}

function Faq({ q, a, initiallyOpen }: { q: string; a: string; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} className="rounded-[14px] bg-[#121212] px-4 py-3">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="flex-1 font-v2-ui-semibold text-[15px] text-v2-cream">{q}</Text>
        <Icon name={open ? "up" : "down"} size={16} color={c.c50} />
      </View>
      {open ? <Text className="mt-2 font-v2-ui text-[14px] leading-[20px] text-v2-c70">{a}</Text> : null}
    </Pressable>
  );
}

export function Explore() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const events = useAppEvents();
  const orgs = useOrganizations();
  const [q, setQ] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const { registerScrollRef } = useScrollToTop();
  const { scrollRef } = useScrollRegistration({ registerScrollRef, isLoading: events.isLoading, isError: events.isError, hasData: !!events.data });

  const raw = useMemo(() => ((events.data as { rawEvents?: Array<FeedEvent & { is_featured?: boolean | null }> } | undefined)?.rawEvents ?? []), [events.data]);
  const orgList = useMemo(() => ((orgs.data ?? []) as Org[]), [orgs.data]);
  const featured = useMemo(() => featuredFirst(raw, 10), [raw]);
  const result = useMemo(() => searchExplore(raw, orgList, q), [raw, orgList, q]);
  const searching = q.trim().length > 0;
  const count = result.events.length + result.organizers.length;
  const tileW = (width - 16 * 2 - 12) / 2;

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([events.refetch(), orgs.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [events, orgs]);

  const sectionTitle = (s: string) => (
    <Text accessibilityRole="header" className="mb-3 px-4 font-v2-display-bold text-[22px] tracking-[-0.6px] text-v2-cream">
      {s}
    </Text>
  );

  return (
    <ScrollView
      ref={scrollRef as never}
      className="flex-1 bg-black"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingTop: 6, paddingBottom: getTabBarPaddingBottom(insets.bottom) }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={c.cream} colors={[c.cream]} progressBackgroundColor={c.ink3} />}
    >
      <Text accessibilityRole="header" className="px-4 pb-3 font-v2-display-bold text-[28px] tracking-[-0.8px] text-v2-cream">
        {t("explore.title")}
      </Text>
      <View className="mx-4 h-12 flex-row items-center gap-2.5 rounded-v2-pill bg-[#1A1A1A] px-4">
        <Icon name="search" size={19} color={c.c70} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={t("explore.searchPlaceholder")}
          placeholderTextColor={c.c50}
          accessibilityLabel={t("common.search")}
          returnKeyType="search"
          autoCorrect={false}
          className="h-full flex-1 font-v2-ui text-[15px] text-v2-cream"
        />
        {q ? (
          <Pressable onPress={() => setQ("")} accessibilityRole="button" accessibilityLabel={t("explore.clear")} hitSlop={8}>
            <Icon name="close" size={17} color={c.c70} />
          </Pressable>
        ) : null}
      </View>

      {events.isError && !events.data ? (
        <View className="px-4 pt-6">
          <ErrorBox message={t("home.loadError")} onRetry={() => void events.refetch()} />
        </View>
      ) : searching ? (
        count === 0 ? (
          <View className="items-center gap-2 px-8 py-14">
            <Text className="text-center font-v2-display-bold text-[20px] text-v2-cream">{t("explore.noResults")}</Text>
            <Text className="mb-2 text-center font-v2-ui text-[14.5px] text-v2-c70">{t("explore.noResultsBody", { q: q.trim() })}</Text>
            <Button small label={t("explore.clear")} onPress={() => setQ("")} />
          </View>
        ) : (
          <View className="pt-5">
            <Text className="mb-4 px-4 font-v2-ui text-[13px] text-v2-c50">{t("explore.results", { count })}</Text>
            {result.organizers.length > 0 ? (
              <View className="mb-8">
                {sectionTitle(t("explore.organizers"))}
                <View className="flex-row flex-wrap px-4" style={{ gap: 12 }}>
                  {result.organizers.map((o) => (
                    <OrgCard key={o.id} org={o} width={tileW} />
                  ))}
                </View>
              </View>
            ) : null}
            {result.events.length > 0 ? (
              <View>
                {sectionTitle(t("explore.events"))}
                <View className="flex-row flex-wrap px-4" style={{ gap: 12, rowGap: 22 }}>
                  {result.events.map((e) => (
                    <EventTile key={e.id} event={e} width={tileW} />
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        )
      ) : (
        <View className="gap-10 pt-7">
          {featured.length > 0 ? (
            <View>
              {sectionTitle(t("explore.featured"))}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
                {featured.map((e) => (
                  <EventTile key={e.id} event={e} width={190} />
                ))}
              </ScrollView>
            </View>
          ) : null}
          {orgList.length > 0 ? (
            <View>
              {sectionTitle(t("explore.organizers"))}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
                {orgList.map((o) => (
                  <OrgCard key={o.id} org={o} width={200} />
                ))}
              </ScrollView>
            </View>
          ) : null}
          <HostCard />
          <View>
            {sectionTitle(t("explore.faqs"))}
            <View className="gap-2 px-4">
              {faqs.map((f, i) => (
                <Faq key={f.id} q={f.question} a={f.answer} initiallyOpen={i === 0} />
              ))}
            </View>
            <Pressable onPress={() => void WebBrowser.openBrowserAsync("https://flme.co/faqs").catch(() => {})} accessibilityRole="link" className="mt-4 self-start px-4">
              <Text className="font-v2-ui-semibold text-[14px] text-v2-cream underline">{t("explore.allFaqs")}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  );
}
