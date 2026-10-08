import { View } from "react-native";
import { EventListCard, FlameText } from "@project-flame/ui";
import type { EventCardData } from "@project-flame/ui";

interface EventsListProps {
  events: EventCardData[];
  onEventPress?: (eventId: string) => void;
}

/**
 * Vertical list of EventListCard items.
 * Matches Figma node 172:690 — vertical stack with 8px gap between cards.
 * Cards are centered with 16px horizontal padding (width ~358px on 390px screen).
 */
export function EventsList({
  events,
  onEventPress,
}: EventsListProps) {
  if (events.length === 0) {
    return (
      <View className="items-center justify-center py-12 px-4">
        <FlameText variant="body" className="text-white-50 text-center">
          No events found
        </FlameText>
      </View>
    );
  }

  return (
    <View className="gap-2 items-center">
      {events.map((event) => (
        <EventListCard
          key={event.id}
          event={event}
          onPress={() => onEventPress?.(event.id)}
          className="w-[358px]"
        />
      ))}
    </View>
  );
}
