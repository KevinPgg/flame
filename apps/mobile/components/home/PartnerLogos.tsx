import { View, FlatList } from "react-native";
import { FlameText, FlameImage } from "@project-flame/ui";
import { partnerLogos, type PartnerLogo } from "../../data/mock";

export interface PartnerLogosProps {
  logos?: PartnerLogo[];
}

export function PartnerLogos({ logos = partnerLogos }: PartnerLogosProps) {
  const sizeMultiplier = 1.35;

  const renderItem = ({ item }: { item: PartnerLogo }) => (
    <View
      style={{
        height: item.height * sizeMultiplier,
        width: item.width * sizeMultiplier,
      }}
    >
      <FlameImage
        source={item.source}
        className="w-full h-full"
        contentFit="contain"
        accessibilityLabel={item.name}
        accessibilityRole="image"
      />
    </View>
  );

  return (
    <View className="gap-6">
      <View className="px-4">
        <FlameText variant="h4" className="text-white-50 text-center font-poppins leading-6">
          We've already powered events at
        </FlameText>
      </View>
      <FlatList
        data={logos}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 20,
          gap: 24,
          alignItems: "center",
        }}
      />
    </View>
  );
}
