import { View, Text, Pressable } from "react-native";
import { EventInfoHeader } from "../org-dashboard/EventInfoHeader";
import type { ManageEvent } from "../../data/mock";

interface ManageEventCardProps {
  event: ManageEvent;
  onManage?: () => void;
}

export function ManageEventCard({ event, onManage }: ManageEventCardProps) {
  return (
    <View className="bg-card rounded-card p-[10px] gap-2">
      <EventInfoHeader event={event} />

      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-4">
          <Text className="text-white-80 text-sm leading-5 font-poppins">
            Attendees:{" "}
            <Text className="text-white-100">
              {event.attendees}/{event.totalCapacity}
            </Text>
          </Text>
          <Text className="text-white-80 text-sm leading-5 font-poppins">
            Ticket tiers:{" "}
            <Text className="text-white-100">
              {event.ticketTierCount}
            </Text>
          </Text>
        </View>
        <Pressable onPress={onManage}>
          <Text className="text-white-100 text-sm leading-5 font-poppins-medium">
            Manage
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
