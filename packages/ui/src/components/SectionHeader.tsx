import { View, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { FlameText } from "./FlameText";
import { colors } from "../theme/colors";

interface SectionHeaderProps {
  title: string;
  onExploreAll?: () => void;
  showExploreAll?: boolean;
  className?: string;
}

export function SectionHeader({
  title,
  onExploreAll,
  showExploreAll = true,
  className = "",
}: SectionHeaderProps) {
  return (
    <View className={`flex-row items-end justify-between px-4 ${className}`}>
      <FlameText variant="h3" className="text-white-100">
        {title}
      </FlameText>
      {showExploreAll && onExploreAll && (
        <Pressable
          onPress={onExploreAll}
          accessible
          accessibilityRole="button"
          accessibilityLabel={`Explore all ${title}`}
          className="flex-row items-center gap-[7px]"
        >
          <FlameText variant="subtitle1" className="text-white-100">
            Explore all
          </FlameText>
          <Feather name="arrow-right" size={20} color={colors["white-100"]} />
        </Pressable>
      )}
    </View>
  );
}
