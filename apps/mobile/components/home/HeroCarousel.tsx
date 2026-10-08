import { useRef, useCallback } from "react";
import { View, FlatList, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import type { EventCardData } from "@project-flame/ui";
import { useHeroCarousel } from "../../hooks/useHeroCarousel";
import { CarouselCard } from "./CarouselCard";
import { DotsIndicator } from "./DotsIndicator";

const cardHeight = 227;
const cardGap = 8;

const viewabilityConfig = { viewAreaCoveragePercentThreshold: 50 };

interface HeroCarouselProps {
  events?: EventCardData[];
  onEventPress?: (event: EventCardData) => void;
}

export function HeroCarousel({ events = [], onEventPress }: HeroCarouselProps) {
  const router = useRouter();
  const defaultOnEventPress = useCallback(
    (event: EventCardData) => router.push(`/event/${event.id}`),
    [router]
  );
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = screenWidth - 45;
  const flatListRef = useRef<FlatList<EventCardData> | null>(null);

  const { activeIndex, onViewableItemsChanged } = useHeroCarousel(
    flatListRef,
    events
  );

  const handleEventPress = onEventPress ?? defaultOnEventPress;
  const renderItem = useCallback(
    ({ item }: { item: EventCardData }) => (
      <CarouselCard
        item={item}
        cardWidth={cardWidth}
        cardHeight={cardHeight}
        onPress={() => handleEventPress(item)}
      />
    ),
    [cardWidth, handleEventPress]
  );

  if (events.length === 0) return null;

  return (
    <View>
      <FlatList
        ref={flatListRef}
        data={events}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled={false}
        snapToInterval={cardWidth + cardGap}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: (screenWidth - cardWidth) / 2,
          gap: cardGap,
        }}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />
      <DotsIndicator count={events.length} activeIndex={activeIndex} />
    </View>
  );
}
