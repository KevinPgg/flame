import { View, Pressable, FlatList } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  FlameImage,
  FlameText,
  colors,
  type EventCardData,
} from "@project-flame/ui";
import { Ionicons } from "@expo/vector-icons";
import { EventsHero } from "../events/EventsHero";

function FeaturedEventsCta({ onPress }: { onPress: () => void }) {
  return (
    <View className="px-4">
      <View className="items-end">
        <Pressable
          onPress={onPress}
          className="flex-row items-center gap-[7px]"
          accessibilityRole="button"
          accessibilityLabel="Featured events, organizer and more"
        >
          <FlameText variant="subtitle1" className="text-white-100">
            Featured events, organizer and more
          </FlameText>
          <Feather name="arrow-right" size={20} color={colors["white-100"]} />
        </Pressable>
      </View>
    </View>
  );
}

function HomeFeedEventCard({
  event,
  onPress,
}: {
  event: EventCardData;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="rounded-card overflow-hidden">
      <View className="w-full aspect-square relative">
        <FlameImage
          source={{ uri: event.imageUrl }}
          className="w-full h-full"
          contentFit="cover"
        />

        <View className="absolute top-[8px] left-[8px] bg-[rgba(0,0,0,0.55)] rounded-badge px-[10px] py-[6px] flex-row items-center gap-2">
          <FlameText
            variant="subtitle1"
            className="text-white font-poppins-bold uppercase"
          >
            {event.day}
          </FlameText>
          <FlameText
            variant="subtitle1"
            className="text-white font-poppins-light"
          >
            {event.month}
          </FlameText>
        </View>
        {event.isRsvp && (
          <View className="absolute top-[8px] right-[8px] bg-primary rounded-badge px-[10px] py-[6px]">
            <FlameText
              variant="subtitle1"
              className="text-white font-poppins-bold uppercase"
            >
              RSVP
            </FlameText>
          </View>
        )}

        <LinearGradient
          colors={["transparent", colors.surface]}
          locations={[0, 0.7]}
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "60%",
          }}
        />

        <View className="absolute bottom-0 left-0 right-0 p-4 gap-2">
          <FlameText
            variant="h4"
            className="text-white-100 font-poppins-semibold uppercase"
            numberOfLines={2}
          >
            {event.title}
          </FlameText>
          <View className="flex-row gap-2 items-center">
            <View className="w-4 h-4 items-center justify-center">
              <Feather name="calendar" size={14} color={colors["white-100"]} />
            </View>
            <View className="flex-1 flex-row items-center gap-2">
              <View className="border-r border-white-10 pr-1">
                <FlameText variant="subtitle2-light" className="text-white-100">
                  {event.date}
                </FlameText>
              </View>
              <FlameText variant="subtitle2-light" className="text-white-100">
                {event.timeRange || event.time}
              </FlameText>
            </View>
          </View>
          <View className="flex-row gap-2 items-center">
            <View className="w-4 h-4 items-center justify-center">
              <Feather name="map-pin" size={14} color={colors["white-100"]} />
            </View>
            <FlameText
              variant="subtitle2-light"
              className="text-white-100 flex-1"
              numberOfLines={1}
            >
              {event.location}
            </FlameText>
          </View>
          {event.priceDisplay != null && (
            <View className="flex-row gap-2 items-center">
              <View className="w-4 h-4 items-center justify-center">
                <Ionicons name="pricetag-outline" size={14} color={colors["white-100"]} />
              </View>
              <FlameText
                variant="subtitle2"
                className="text-white-100"
                numberOfLines={1}
              >
                {event.priceDisplay}
              </FlameText>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export interface HomeFeedListProps {
  events: EventCardData[];
  onEventPress: (eventId: string) => void;
  onDiscoverPress: () => void;
  searchQuery: string;
  onSearchChange: (text: string) => void;
  onFilterPress: () => void;
  selectedCity?: string | null;
  scrollRef: React.Ref<FlatList<EventCardData>>;
  refreshControl: React.ReactElement;
  contentContainerStyle?: { paddingBottom: number };
}

export function HomeFeedList({
  events,
  onEventPress,
  onDiscoverPress,
  searchQuery,
  onSearchChange,
  onFilterPress,
  selectedCity,
  scrollRef,
  refreshControl,
  contentContainerStyle,
}: HomeFeedListProps) {
  const ListHeaderComponent = (
    <View className="gap-4">
      <EventsHero
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        onFilterPress={onFilterPress}
        selectedCity={selectedCity}
        title=""
        subtitle=""
      />
      <FeaturedEventsCta onPress={onDiscoverPress} />
    </View>
  );

  const ListEmptyComponent = (
    <View className="items-center justify-center py-12 px-4">
      <FlameText variant="body" className="text-white-50 text-center">
        No events found
      </FlameText>
    </View>
  );

  return (
    <FlatList
      ref={scrollRef}
      data={events}
      keyExtractor={e => e.id}
      renderItem={({ item, index }) => (
        <View className="gap-4">
          <View className="px-4">
            <HomeFeedEventCard
              event={item}
              onPress={() => onEventPress(item.id)}
            />
          </View>
          {(index + 1) % 5 === 0 && (
            <FeaturedEventsCta onPress={onDiscoverPress} />
          )}
        </View>
      )}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={ListEmptyComponent}
      refreshControl={refreshControl}
      contentContainerStyle={{
        gap: 16,
        ...contentContainerStyle,
      }}
      showsVerticalScrollIndicator={false}
      bounces={true}
      initialNumToRender={10}
      windowSize={5}
    />
  );
}
