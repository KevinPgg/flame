import { useQuery } from "@tanstack/react-query";
import { Event } from "../types/event";

export function useEvents() {
  return useQuery<Event[]>({
    queryKey: ["events"],
    queryFn: async () => {
      const response = await fetch("/api/events");
      if (!response.ok) {
        throw new Error("Failed to fetch events");
      }
      return response.json();
    },
  });
}

export function useHomepageEvents() {
  const { data: events = [], isLoading, error } = useEvents();

  return {
    events: events.slice(0, 6), // Limit to 6 events for homepage
    isLoading,
    error,
  };
}

// Hook for fetching a single event by slug
export function useEventBySlug(slug: string) {
  return useQuery<Event>({
    queryKey: ["event", slug],
    queryFn: async () => {
      const response = await fetch(`/api/events?slug=${slug}`);
      if (!response.ok) {
        throw new Error("Failed to fetch event");
      }
      const data = await response.json();
      // The API returns an array, but we want the first (and only) result
      return Array.isArray(data) ? data[0] : data;
    },
    enabled: !!slug,
    staleTime: 2 * 60 * 1000, // 2 minutes for individual events
  });
}

// Hook for fetching events with cities for catalog
export function useEventsWithCities() {
  const { data: events = [], isLoading, error } = useEvents();

  const cities = Array.from(
    new Set(events.map((event: Event) => event.city))
  ).sort();

  return {
    events,
    cities,
    isLoading,
    error,
  };
}
