/**
 * Flame 2.0 Home (fase 2.2), app. Prototype `SCREENS.home`: the city button lives in the top bar
 * (AttendeeTopBar); here, events of that city one at a time going down, grouped by day
 * ("Happening now", "Today", "Tomorrow", then dates), each a full-flyer card. Search is in
 * Explore (the top bar's magnifier), as in the prototype. Data: the existing useAppEvents
 * (decision 2026-10-27: reuse working hooks); rules in packages/lib/utils/home-feed.
 */
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cityCounts, feedDayTitle, flameV2Colors as c, groupEventsByDay, type FeedDay } from "@project-flame/lib";
import { useI18n } from "../../../../lib/i18n";
import { useAppEvents } from "../../../../hooks/useAppEvents";
import { useAttendeeCity } from "../../../../contexts/AttendeeCityContext";
import { resolveDefaultCity } from "../../../../lib/v2/default-city";
import { useScrollToTop } from "../../../../contexts/ScrollToTopContext";
import { useScrollRegistration } from "../../../../hooks/useScrollRegistration";
import { getTabBarPaddingBottom } from "../../../navigation/CustomTabBar";
import { Button, ErrorBox, Skeleton } from "../../ui";
import { CitySheet } from "./CitySheet";
import { EventFeedCard, type FeedEvent } from "./EventFeedCard";

type Item = { kind: "day"; key: string; title: string; count: number } | { kind: "event"; key: string; event: FeedEvent };

const capitalize = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

export function HomeFeed() {
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, refetch } = useAppEvents();
  const city = useAttendeeCity();
  const [refreshing, setRefreshing] = useState(false);
  const { registerScrollRef } = useScrollToTop();

  const events = useMemo(() => ((data as { rawEvents?: FeedEvent[] } | undefined)?.rawEvents ?? []) as FeedEvent[], [data]);
  const cities = useMemo(() => cityCounts(events), [events]);

  // Default city from Settings (remembered on this phone) until the person picks on the Home.
  const { touched, defaultPref, applyDefault } = city;
  useEffect(() => {
    if (touched || defaultPref === null || events.length === 0) return;
    applyDefault(resolveDefaultCity(defaultPref, cities.map((x) => x.city)));
  }, [touched, defaultPref, cities, events.length, applyDefault]);

  const shown = useMemo(() => (city.city ? events.filter((e) => e.city === city.city) : events), [events, city.city]);
  const items = useMemo<Item[]>(() => {
    const title = (d: FeedDay<FeedEvent>) =>
      d.when === "now" ? t("home.now") : d.when === "today" ? t("home.today") : d.when === "tomorrow" ? t("home.tomorrow") : capitalize(feedDayTitle(d, locale));
    return groupEventsByDay(shown).flatMap<Item>((d) => [
      { kind: "day", key: `day-${d.key}`, title: title(d), count: d.events.length },
      ...d.events.map((e) => ({ kind: "event" as const, key: e.id, event: e })),
    ]);
  }, [shown, t, locale]);

  const { scrollRef } = useScrollRegistration({ registerScrollRef, isLoading, isError, hasData: items.length > 0 });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const bottom = getTabBarPaddingBottom(insets.bottom);

  let body: ReactElement;
  if (isLoading && !data) {
    body = (
      <View className="gap-6 px-4 pt-4" accessibilityLabel={t("common.loading")}>
        {[0, 1].map((i) => (
          <View key={i} className="gap-2.5">
            <Skeleton width={160} height={20} />
            <View style={{ aspectRatio: 4 / 5 }} className="w-full rounded-[16px] bg-v2-ink3" />
          </View>
        ))}
      </View>
    );
  } else if (isError && !data) {
    body = (
      <View className="px-4 pt-6">
        <ErrorBox message={t("home.loadError")} onRetry={() => void refetch()} />
      </View>
    );
  } else {
    body = (
      <FlatList
        ref={scrollRef as never}
        data={items}
        keyExtractor={(i) => i.key}
        renderItem={({ item }) =>
          item.kind === "day" ? (
            <View accessibilityRole="header" className="flex-row items-baseline justify-between px-4 pb-3 pt-2">
              <Text className="font-v2-display-bold text-[20px] text-v2-cream">{item.title}</Text>
              <Text className="font-v2-ui text-[13.5px] text-v2-c50">{t("home.events", { count: item.count })}</Text>
            </View>
          ) : (
            <EventFeedCard event={item.event} />
          )
        }
        ListEmptyComponent={
          <View className="items-center gap-2 px-8 py-16">
            {events.length === 0 ? (
              <>
                <Text className="text-center font-v2-display-bold text-[20px] text-v2-cream">{t("home.noEvents")}</Text>
                <Text className="text-center font-v2-ui text-[14.5px] text-v2-c70">{t("home.noEventsBody")}</Text>
              </>
            ) : (
              <>
                <Text className="text-center font-v2-display-bold text-[20px] text-v2-cream">{t("home.emptyTitle", { city: city.city ?? "" })}</Text>
                <Text className="mb-2 text-center font-v2-ui text-[14.5px] text-v2-c70">{t("home.emptyBody", { city: city.city ?? "" })}</Text>
                <Button label={t("home.showAllCities")} onPress={() => city.pick(null)} />
              </>
            )}
          </View>
        }
        contentContainerStyle={{ paddingTop: 6, paddingBottom: bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={c.cream} colors={[c.cream]} progressBackgroundColor={c.ink3} />}
        initialNumToRender={4}
        windowSize={7}
      />
    );
  }

  return (
    <View className="flex-1 bg-black">
      {body}
      <CitySheet
        open={city.pickerOpen}
        cities={cities}
        total={events.length}
        current={city.city}
        onPick={city.pick}
        onClose={city.closePicker}
      />
    </View>
  );
}
