import { useState, useCallback } from "react";
import { View, FlatList } from "react-native";
import type { EventCardData } from "@project-flame/ui";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CustomRefreshControl } from "@project-flame/ui";
import { getTabBarPaddingBottom } from "../../components/navigation/CustomTabBar";
import { FilterBottomSheet } from "../../components/events/FilterBottomSheet";
import { EventsStatusContainer } from "../../components/home/EventsStatusContainer";
import { HomeFeedList } from "../../components/home/HomeFeedList";
import { useAppEvents } from "../../hooks/useAppEvents";
import { useOptionalAuth } from "../../hooks/useOptionalAuth";
import { useScrollToTop } from "../../contexts/ScrollToTopContext";
import { useEventFilters } from "../../hooks/useEventFilters";
import { useHomeRefresh } from "../../hooks/useHomeRefresh";
import { useScrollRegistration } from "../../hooks/useScrollRegistration";
import { useAuthRedirect } from "../../contexts/AuthRedirectContext";
import { attendeeV2Enabled } from "../../lib/v2/flags";
import { HomeFeed } from "../../components/v2/attendee/home/HomeFeed";

export default function HomeScreen() {
  const { setAuthRedirecting } = useAuthRedirect();

  useFocusEffect(
    useCallback(() => {
      setAuthRedirecting(false);
    }, [setAuthRedirecting])
  );
  // Flame 2.0 Home (fase 2.2); EXPO_PUBLIC_ATTENDEE_V1=true keeps the v1 feed.
  return attendeeV2Enabled() ? <HomeFeed /> : <HomeV1 />;
}

function HomeV1() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filterVisible, setFilterVisible] = useState(false);

  const { userId } = useOptionalAuth();
  const { data, isLoading, isError, error, refetch } = useAppEvents();
  const { registerScrollRef } = useScrollToTop();

  const allEvents = data?.allEvents;
  const hasData = !!allEvents?.length;

  const { scrollRef } = useScrollRegistration({
    registerScrollRef,
    isLoading,
    isError,
    hasData,
  });

  const {
    searchQuery,
    setSearchQuery,
    selectedCity,
    setSelectedCity,
    selectedOrganizer,
    setSelectedOrganizer,
    cities,
    organizers,
    filteredEvents,
  } = useEventFilters(allEvents);

  const { refreshing, handleRefresh } = useHomeRefresh({
    refetch,
    userId: userId ?? undefined,
  });

  return (
    <EventsStatusContainer
      isLoading={isLoading}
      isError={isError}
      hasData={hasData}
      error={error ?? null}
      onRetry={handleRefresh}
    >
      <View className="flex-1 bg-background">
        <HomeFeedList
          events={filteredEvents}
          onEventPress={(eventId) => router.push(`/event/${eventId}`)}
          onDiscoverPress={() => router.push("/discover")}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onFilterPress={() => setFilterVisible(true)}
          selectedCity={selectedCity}
          scrollRef={scrollRef as React.Ref<FlatList<EventCardData>>}
          refreshControl={
            <CustomRefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
            />
          }
          contentContainerStyle={{
            paddingBottom: getTabBarPaddingBottom(insets.bottom),
          }}
        />

        <FilterBottomSheet
          visible={filterVisible}
          onClose={() => setFilterVisible(false)}
          cities={cities}
          selectedCity={selectedCity}
          onCityChange={setSelectedCity}
          organizers={organizers}
          selectedOrganizer={selectedOrganizer}
          onOrganizerChange={setSelectedOrganizer}
          onReset={() => {
            setSelectedCity(null);
            setSelectedOrganizer(null);
          }}
        />
      </View>
    </EventsStatusContainer>
  );
}
