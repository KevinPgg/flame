import { View, Text, Pressable } from "react-native";
import { EventInfoHeader } from "./EventInfoHeader";
import type { RsvpEventData } from "../../hooks/useRsvpManagement";

interface RsvpEventCardProps {
  event: RsvpEventData;
  onActions?: () => void;
}

export function RsvpEventCard({ event, onActions }: RsvpEventCardProps) {
  return (
    <View className="bg-card rounded-card p-[10px] gap-2">
      <EventInfoHeader event={event} />

      <View className="flex-row items-center justify-between">
        <Text className="text-white-80 text-sm leading-5 font-poppins">
          {event.pendingRequests === 1 ? "Pending request" : "Pending requests"}:{" "}
          <Text className="text-white-100 font-poppins-semibold">
            {event.pendingRequests}
          </Text>
        </Text>
        <Pressable onPress={onActions}>
          <Text className="text-accent text-sm leading-5 font-poppins-medium">
            Actions
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
