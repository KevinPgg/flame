import { View, Text } from "react-native";
import { TicketSearchBar } from "../dashboard/TicketSearchBar";
import { ManageEventCard } from "./ManageEventCard";
import { PastItemsAccordion } from "../shared/PastItemsAccordion";
import type { ManageEvent } from "../../data/mock";

interface EventsListViewProps {
  currentEvents: ManageEvent[];
  pastEvents: ManageEvent[];
  onManageEvent?: (eventId: string) => void;
}

export function EventsListView({
  currentEvents,
  pastEvents,
  onManageEvent,
}: EventsListViewProps) {
  const hasAny = currentEvents.length > 0 || pastEvents.length > 0;

  return (
    <View className="gap-6 px-4">
      <TicketSearchBar />

      {!hasAny ? (
        <Text className="text-white-50 text-sm leading-5 font-poppins text-center py-8">
          No events found. Create your first event from the Create Event tab.
        </Text>
      ) : (
        <View className="gap-[30px]">
          {currentEvents.length > 0 && (
            <View className="gap-3">
              <Text className="text-white-100 text-sm leading-5 font-poppins-semibold uppercase">
                Current & upcoming events
              </Text>
              <View className="gap-2">
                {currentEvents.map((event) => (
                  <ManageEventCard
                    key={event.id}
                    event={event}
                    onManage={() => onManageEvent?.(event.id)}
                  />
                ))}
              </View>
            </View>
          )}
          {pastEvents.length > 0 && (
            <PastItemsAccordion label="Past events" count={pastEvents.length}>
              {pastEvents.map((event) => (
                <ManageEventCard
                  key={event.id}
                  event={event}
                  onManage={() => onManageEvent?.(event.id)}
                />
              ))}
            </PastItemsAccordion>
          )}
        </View>
      )}
    </View>
  );
}
