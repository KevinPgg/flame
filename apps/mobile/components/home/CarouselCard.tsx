import { View } from "react-native";
import { PillButton, FlameImage } from "@project-flame/ui";
import type { EventCardData } from "@project-flame/ui";

interface CarouselCardProps {
  item: EventCardData;
  cardWidth: number;
  cardHeight: number;
  onPress: () => void;
}

export function CarouselCard({
  item,
  cardWidth,
  cardHeight,
  onPress,
}: CarouselCardProps) {
  return (
    <View
      className="rounded-card overflow-hidden relative"
      style={{ width: cardWidth, height: cardHeight }}
    >
      <FlameImage
        source={{ uri: item.imageUrl }}
        className="w-full h-full rounded-card"
        contentFit="cover"
      />
      <View className="absolute inset-0 bg-[rgba(0,0,0,0.2)] rounded-card" />
      <View className="absolute bottom-4 self-center">
        <PillButton label="Explore Events" variant="solid" onPress={onPress} />
      </View>
    </View>
  );
}
