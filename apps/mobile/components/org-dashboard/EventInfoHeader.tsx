import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FlameImage } from "@project-flame/ui";

export interface EventInfoHeaderData {
  eventName: string;
  eventImageUrl: string;
  date: string;
  timeRange: string;
  location: string;
}

interface EventInfoHeaderProps {
  event: EventInfoHeaderData;
}

export function EventInfoHeader({ event }: EventInfoHeaderProps) {
  return (
    <View className="border-b border-white-20 pb-2 gap-2">
      <View className="flex-row items-center gap-2 pr-[80px]">
        <FlameImage
          source={{ uri: event.eventImageUrl }}
          className="w-[44px] h-[43px] rounded-[8px]"
          contentFit="cover"
        />
        <Text
          className="text-white-100 text-base font-poppins-semibold uppercase flex-shrink"
          numberOfLines={1}
        >
          {event.eventName}
        </Text>
      </View>

      <View className="flex-row items-center gap-2">
        <Ionicons name="calendar-outline" size={24} color="#F9FBFE" />
        <View className="flex-1 flex-row items-center gap-2">
          <View className="border-r border-[#BFC0C2] pr-1">
            <Text className="text-white-100 text-xs leading-4 font-poppins-light">
              {event.date}
            </Text>
          </View>
          <Text className="text-white-100 text-xs leading-4 font-poppins-light">
            {event.timeRange}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center gap-2">
        <Ionicons name="location-outline" size={24} color="#F9FBFE" />
        <Text className="flex-1 text-white-100 text-xs leading-4 font-poppins-light">
          {event.location}
        </Text>
      </View>
    </View>
  );
}
