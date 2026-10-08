import { useCallback, useState, useEffect, useRef } from "react";
import { ScrollView, View, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  FlameText,
  PillButton,
  CustomRefreshControl,
  type EventCardData,
} from "@project-flame/ui";
import { HeroCarousel } from "./HeroCarousel";
import { FeaturedEvents } from "./FeaturedEvents";
import { ExploreOrganizers } from "./ExploreOrganizers";
import { SpotlightSection } from "./SpotlightSection";
import { UpcomingEvents } from "./UpcomingEvents";
import { FAQSection } from "./FAQSection";
import { HostBanner } from "./HostBanner";

import { getTabBarPaddingBottom } from "../navigation/CustomTabBar";
import { useAppEvents } from "../../hooks/useAppEvents";
import { useOptionalAuth } from "../../hooks/useOptionalAuth";
import { useScrollToTop } from "../../contexts/ScrollToTopContext";
import { faqs } from "@project-flame/lib";

export function LegacyHomeContent() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useOptionalAuth();
  const { data, isLoading, isError, refetch } = useAppEvents();
  const hasCachedData = !!data;

  const { registerScrollRef } = useScrollToTop();

  useEffect(() => {
    if ((isLoading && !data) || (isError && !data)) {
      registerScrollRef(null);
    }
  }, [isLoading, isError, data, registerScrollRef]);

  const [refreshing, setRefreshing] = useState(false);
  const isRefreshingRef = useRef(false);
  const handleRefresh = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    setRefreshing(true);
    try {
      const result = await refetch();
      if (result.error) {
        console.error("[Home] handleRefresh failed", {
          action: "refresh",
          userId: userId ?? undefined,
          err:
            result.error instanceof Error
              ? result.error.message
              : String(result.error),
        });
        Alert.alert(
          "Refresh failed",
          hasCachedData
            ? "Showing cached data. Pull to refresh again."
            : "No data available. Please try again.",
        );
      }
    } catch (err) {
      console.error("[Home] handleRefresh failed", {
        action: "refresh",
        userId: userId ?? undefined,
        err: err instanceof Error ? err.message : String(err),
      });
      Alert.alert(
        "Refresh failed",
        hasCachedData
          ? "Showing cached data. Pull to refresh again."
          : "No data available. Please try again.",
      );
    } finally {
      setRefreshing(false);
      isRefreshingRef.current = false;
    }
  }, [refetch, userId, hasCachedData]);

  const navigateToEvent = useCallback(
    (id: string) => router.push(`/event/${id}`),
    [router],
  );
  const handleEventPress = useCallback(
    (event: EventCardData) => navigateToEvent(event.id),
    [navigateToEvent],
  );

  if (isLoading && !data) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  if (isError && !data) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6 gap-4">
        <FlameText variant="h4" className="text-white-100 text-center">
          Something went wrong
        </FlameText>
        <FlameText variant="subtitle1" className="text-white-50 text-center">
          Could not load events. Please check your connection.
        </FlameText>
        <PillButton
          label="Retry"
          variant="solid"
          onPress={() => handleRefresh()}
        />
      </View>
    );
  }

  const {
    upcomingEvents = [],
    featuredEvents = [],
    spotlightEvent = null,
  } = data ?? {};

  const hasEvents =
    upcomingEvents.length > 0 || featuredEvents.length > 0 || !!spotlightEvent;

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        ref={registerScrollRef}
        className="flex-1"
        showsVerticalScrollIndicator={false}
        bounces={true}
        contentContainerStyle={{
          paddingBottom: getTabBarPaddingBottom(insets.bottom),
        }}
        refreshControl={
          <CustomRefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />
        }
      >
        {/* TODO: Re-enable GlowBlobs once gradient opacity/size is tweaked */}

        <HeroCarousel events={upcomingEvents} onEventPress={handleEventPress} />

        <View className="gap-[30px] mt-[30px]">
          {/* TODO: restore when we have more clients */}
          {/* <PartnerLogos /> */}
          {!hasEvents && (
            <View className="py-8 px-6 items-center">
              <FlameText variant="h4" className="text-white-100 text-center">
                No events available
              </FlameText>
              <FlameText
                variant="subtitle1"
                className="text-white-50 text-center mt-2"
              >
                Check back soon for upcoming events.
              </FlameText>
            </View>
          )}
          <FeaturedEvents
            events={featuredEvents}
            onEventPress={handleEventPress}
          />
          <ExploreOrganizers />
          <SpotlightSection
            event={spotlightEvent ?? undefined}
            onPress={
              spotlightEvent
                ? () => navigateToEvent(spotlightEvent.id)
                : undefined
            }
          />
          <HostBanner />
          <UpcomingEvents
            events={upcomingEvents}
            onEventPress={handleEventPress}
          />
          <FAQSection items={faqs} />
        </View>
      </ScrollView>
    </View>
  );
}
