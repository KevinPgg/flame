import { View } from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { FlameText } from "./FlameText";
import { FlameImage } from "./FlameImage";
import { colors } from "../theme/colors";
import { PillButton } from "./PillButton";

export interface DJData {
  id: string;
  name: string;
  imageUrl: string;
}

export interface SpotlightData {
  id: string;
  title: string;
  imageUrl: string;
  date: string;
  time: string;
  location: string;
  isToday?: boolean;
  djs: DJData[];
  ctaLabel: string;
  priceDisplay?: string | null;
}

interface SpotlightCardProps {
  data: SpotlightData;
  onPress?: () => void;
  className?: string;
}

export function SpotlightCard({
  data,
  onPress,
  className = "",
}: SpotlightCardProps) {
  return (
    <View
      className={`bg-white-5 rounded-card pt-4 pb-8 px-4 gap-6 items-center ${className}`}
    >
      {/* Hero image */}
      <View className="w-full h-[237px] rounded-card overflow-hidden">
        <FlameImage
          source={{ uri: data.imageUrl }}
          className="w-full h-full"
          contentFit="cover"
        />
      </View>

      {/* Event details */}
      <View className="w-full gap-[17px]">
        <FlameText variant="h4" className="text-white uppercase">
          {data.title}
        </FlameText>

        <View className="gap-2">
          {/* Date/time row */}
          <View className="flex-row items-center gap-2">
            <View className="w-5 h-5 rounded-circle overflow-hidden items-center justify-center">
              <Feather name="calendar" size={16} color={colors["white-100"]} />
            </View>
            <View className="flex-row items-center gap-2">
              <View className="border-r border-white-30 pr-[6px]">
                {data.isToday ? (
                  <FlameText variant="subtitle2" className="text-primary-900">
                    Today
                  </FlameText>
                ) : (
                  <FlameText
                    variant="subtitle2-light"
                    className="text-white-100"
                  >
                    {data.date}
                  </FlameText>
                )}
              </View>
              <FlameText variant="subtitle2-light" className="text-white-100">
                {data.time}
              </FlameText>
            </View>
          </View>

          {/* Location row */}
          <View className="flex-row items-center gap-2">
            <View className="w-5 h-5 rounded-circle overflow-hidden items-center justify-center">
              <Feather name="map-pin" size={16} color={colors["white-100"]} />
            </View>
            <FlameText
              variant="subtitle2-light"
              className="text-white-100 flex-1"
              numberOfLines={1}
            >
              {data.location}
            </FlameText>
          </View>

          {/* Price row */}
          {data.priceDisplay != null && (
            <View className="flex-row items-center gap-2">
              <View className="w-5 h-5 rounded-circle overflow-hidden items-center justify-center">
                <Ionicons name="pricetag-outline" size={16} color={colors["white-100"]} />
              </View>
              <FlameText
                variant="subtitle2"
                className="text-white-100"
                numberOfLines={1}
              >
                {data.priceDisplay}
              </FlameText>
            </View>
          )}
        </View>
      </View>

      {/* DJ avatars */}
      {data.djs.length > 0 && (
        <View className="flex-row items-center gap-2 px-4 w-full">
          {data.djs.map(dj => (
            <View
              key={dj.id}
              className="flex-1 h-[102px] rounded-circle overflow-hidden items-center justify-end p-6"
            >
              <FlameImage
                source={{ uri: dj.imageUrl }}
                className="absolute w-full h-full"
                contentFit="cover"
              />
              <FlameText
                variant="subtitle1"
                className="text-white font-poppins-medium z-10"
              >
                {dj.name}
              </FlameText>
            </View>
          ))}
        </View>
      )}

      {/* CTA */}
      <PillButton label={data.ctaLabel} onPress={onPress} />
    </View>
  );
}
