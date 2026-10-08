import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlowBlob, CustomRefreshControl } from "@project-flame/ui";
import { getTabBarPaddingBottom } from "../navigation/CustomTabBar";
import { PastItemsAccordion } from "../shared/PastItemsAccordion";
import type { EventCardData } from "@project-flame/ui";

import { EventsHero } from "./EventsHero";
import { EventsList } from "./EventsList";
import { FilterBottomSheet } from "./FilterBottomSheet";

interface OrgOption {
  name: string;
  slug: string;
}

interface EventsScreenBodyProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filteredEvents: EventCardData[];
  onEventPress: (eventId: string) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  filterVisible: boolean;
  onFilterOpen: () => void;
  onFilterClose: () => void;
  cities: string[];
  selectedCity: string | null;
  onCityChange: (city: string | null) => void;
  organizers?: OrgOption[];
  selectedOrganizer?: string | null;
  onOrganizerChange?: (slug: string | null) => void;
  onFilterReset: () => void;
  heroTitle?: string;
  heroSubtitle?: string;
  profileImageUrl?: string | null;
  onShare?: () => void;
  description?: string | null;
  instagramHandle?: string | null;
  city?: string | null;
  pastEvents?: EventCardData[];
}

export function EventsScreenBody({
  searchQuery,
  onSearchChange,
  filteredEvents,
  onEventPress,
  refreshing,
  onRefresh,
  filterVisible,
  onFilterOpen,
  onFilterClose,
  cities,
  selectedCity,
  onCityChange,
  organizers,
  selectedOrganizer,
  onOrganizerChange,
  onFilterReset,
  heroTitle,
  heroSubtitle,
  profileImageUrl,
  onShare,
  description,
  instagramHandle,
  city,
  pastEvents,
}: EventsScreenBodyProps) {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        bounces={true}
        contentContainerStyle={{
          paddingBottom: getTabBarPaddingBottom(insets.bottom),
        }}
        refreshControl={
          onRefresh ? (
            <CustomRefreshControl
              refreshing={!!refreshing}
              onRefresh={onRefresh}
            />
          ) : undefined
        }
      >
        <GlowBlob
          top={30}
          left={126}
          width={500}
          height={500}
          color="rgba(255, 20, 0, 0.06)"
        />
        <View>
          <EventsHero
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
            onFilterPress={onFilterOpen}
            selectedCity={selectedCity}
            title={heroTitle}
            subtitle={heroSubtitle}
            profileImageUrl={profileImageUrl}
            onShare={onShare}
            description={description}
            instagramHandle={instagramHandle}
            city={city}
          />
        </View>
        <View className="gap-8 mt-[50px]">
          <EventsList events={filteredEvents} onEventPress={onEventPress} />
        </View>

        {/* Past Events — only rendered on organizer pages that pass the prop */}
        {pastEvents && pastEvents.length > 0 && (
          <View className="mt-8 px-4">
            <PastItemsAccordion label="Past events" count={pastEvents.length}>
              <EventsList events={pastEvents} onEventPress={onEventPress} />
            </PastItemsAccordion>
          </View>
        )}
      </ScrollView>

      <FilterBottomSheet
        visible={filterVisible}
        onClose={onFilterClose}
        cities={cities}
        selectedCity={selectedCity}
        onCityChange={onCityChange}
        organizers={organizers}
        selectedOrganizer={selectedOrganizer}
        onOrganizerChange={onOrganizerChange}
        onReset={onFilterReset}
      />
    </View>
  );
}
