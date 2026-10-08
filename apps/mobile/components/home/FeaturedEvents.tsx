import { EventsSection } from "./EventsSection";
import type { EventCardData } from "@project-flame/ui";

interface FeaturedEventsProps {
  events?: EventCardData[];
  onEventPress?: (event: EventCardData) => void;
}

export function FeaturedEvents({ events = [], onEventPress }: FeaturedEventsProps) {
  return (
    <EventsSection
      title="Featured Events"
      events={events}
      onEventPress={onEventPress}
      showExploreAll={false}
    />
  );
}
