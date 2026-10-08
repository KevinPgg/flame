import { useRef, useState, useEffect } from "react";
import { FlatList, type ViewToken } from "react-native";
import type { EventCardData } from "@project-flame/ui";

export function useHeroCarousel(
  flatListRef: React.RefObject<FlatList<EventCardData> | null>,
  events: EventCardData[]
) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    if (events.length === 0) {
      setActiveIndex(0);
      activeIndexRef.current = 0;
      return;
    }
    if (activeIndexRef.current >= events.length) {
      const clamped = events.length - 1;
      setActiveIndex(clamped);
      activeIndexRef.current = clamped;
    }
  }, [events.length]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    }
  ).current;

  useEffect(() => {
    if (events.length === 0) return;
    const timer = setInterval(() => {
      try {
        const len = events.length;
        if (len === 0 || !flatListRef.current) return;
        const nextIndex = (activeIndexRef.current + 1) % len;
        flatListRef.current.scrollToIndex({ index: nextIndex, animated: true });
      } catch (err) {
        const nextIdx = (activeIndexRef.current + 1) % events.length;
        const eventId = events[nextIdx]?.id;
        console.error("[HeroCarousel] autoScroll error", {
          action: "HeroCarousel.autoScroll",
          activeIndex: activeIndexRef.current,
          eventsLength: events.length,
          eventId,
          err: err instanceof Error ? err.message : String(err),
        });
        activeIndexRef.current = 0;
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [events, flatListRef]);

  return { activeIndex, onViewableItemsChanged };
}
