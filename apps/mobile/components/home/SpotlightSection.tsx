import { View } from "react-native";
import { SpotlightCard, type SpotlightData } from "@project-flame/ui";

export interface SpotlightSectionProps {
  event?: SpotlightData;
  onPress?: () => void;
}

export function SpotlightSection({ event, onPress }: SpotlightSectionProps) {
  if (!event) return null;

  return (
    <View className="px-4">
      <SpotlightCard data={event} onPress={onPress} />
    </View>
  );
}
