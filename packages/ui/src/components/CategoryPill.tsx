import { View, Pressable } from "react-native";
import { FlameText } from "./FlameText";
import { FlameImage } from "./FlameImage";

export interface CategoryData {
  id: string;
  name: string;
  imageUrl: string;
}

interface CategoryPillProps {
  category: CategoryData;
  onPress?: () => void;
  className?: string;
}

export function CategoryPill({
  category,
  onPress,
  className = "",
}: CategoryPillProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`items-center gap-[7px] ${className}`}
    >
      <View className="w-[67px] h-[67px] rounded-circle overflow-hidden">
        <FlameImage
          source={{ uri: category.imageUrl }}
          className="w-full h-full"
          contentFit="cover"
        />
      </View>
      <FlameText variant="subtitle1" className="text-white-100 text-center">
        {category.name}
      </FlameText>
    </Pressable>
  );
}
