import { View, FlatList } from "react-native";
import { useRouter } from "expo-router";
import {
  SectionHeader,
  EventCard,
  type EventCardData,
} from "@project-flame/ui";

export interface EventsSectionProps {
  title: string;
  events?: EventCardData[];
  onExploreAll?: () => void;
  /** When false, hides the "Explore all" button. Used on discover page. */
  showExploreAll?: boolean;
  onEventPress?: (event: EventCardData) => void;
}

export function EventsSection({
  title,
  events = [],
  onExploreAll,
  showExploreAll = true,
  onEventPress,
}: EventsSectionProps) {
  const router = useRouter();

  const handleExploreAll = onExploreAll ?? (() => router.push("/discover"));

  const renderItem = ({ item }: { item: EventCardData }) => (
    <EventCard
      event={item}
      onPress={onEventPress ? () => onEventPress(item) : undefined}
    />
  );

  if (events.length === 0) return null;

  return (
    <View className="gap-6">
      <SectionHeader
        title={title}
        onExploreAll={showExploreAll ? handleExploreAll : undefined}
        showExploreAll={showExploreAll}
      />
      <FlatList
        data={events}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      />
    </View>
  );
}
