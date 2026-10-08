import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FlameImage } from "@project-flame/ui";
import { LinkableText } from "../LinkableText";

export interface OrgEventInfoDisplay {
  id: string;
  eventName: string;
  description: string;
  eventImageUrl: string;
  date: string;
  timeRange: string;
  location: string;
}

interface OrgEventInfoCardProps {
  event: OrgEventInfoDisplay;
}

export function OrgEventInfoCard({ event }: OrgEventInfoCardProps) {
  return (
    <View className="gap-6">
      <View className="px-4">
        <FlameImage
          source={{ uri: event.eventImageUrl }}
          className="w-full aspect-[4/5] rounded-card"
          contentFit="cover"
        />
      </View>

      <View
        className="bg-card rounded-card p-3 mx-4"
        style={{
          shadowColor: "rgba(80,85,136,0.06)",
          shadowOffset: { width: 0, height: 8 },
          shadowRadius: 30,
          shadowOpacity: 1,
        }}
      >
        <View className="gap-6 items-center">
          <View className="gap-2 w-full">
            <Text className="text-white-100 text-lg font-poppins-semibold uppercase">
              {event.eventName}
            </Text>
            <LinkableText className="text-white-80 text-sm leading-5 font-poppins-light">
              {event.description}
            </LinkableText>
          </View>

          <View className="gap-4 w-full">
            <View className="flex-row items-center gap-4">
              <View className="size-[36px] bg-white-10 rounded-full items-center justify-center">
                <Ionicons name="calendar-outline" size={24} color="#F9FBFE" />
              </View>
              <View className="flex-1 gap-2">
                <Text className="text-white-100 text-xs leading-4 font-poppins-light">
                  {event.date}
                </Text>
                <Text className="text-white-100 text-xs leading-4 font-poppins-light">
                  {event.timeRange}
                </Text>
              </View>
            </View>

            <View className="flex-row items-center gap-4">
              <View className="size-[36px] bg-white-10 rounded-full items-center justify-center">
                <Ionicons name="location-outline" size={24} color="#F9FBFE" />
              </View>
              <Text className="flex-1 text-white-100 text-xs leading-4 font-poppins-light">
                {event.location}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
