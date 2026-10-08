import { EventsSection } from "./EventsSection";
import type { EventCardData } from "@project-flame/ui";

interface UpcomingEventsProps {
  events?: EventCardData[];
  onEventPress?: (event: EventCardData) => void;
}

export function UpcomingEvents({ events = [], onEventPress }: UpcomingEventsProps) {
  return (
    <EventsSection
      title="Upcoming events"
      events={events}
      onEventPress={onEventPress}
      showExploreAll={false}
    />
  );
}
