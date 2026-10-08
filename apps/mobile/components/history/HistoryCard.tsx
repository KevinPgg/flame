import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, FlameImage } from "@project-flame/ui";
import type { TicketGroupDisplay } from "../../lib/user-ticket-mappers";

export interface HistoryCardProps {
  ticket: TicketGroupDisplay;
  onPress?: () => void;
}

export function HistoryCard({ ticket, onPress }: HistoryCardProps) {
  const Wrapper = onPress ? Pressable : View;
  const wrapperProps = onPress ? { onPress } : {};

  return (
    <Wrapper {...wrapperProps} className="bg-card rounded-card p-[10px] gap-2">
      {/* Top section — event info */}
      <View className="border-b border-white-20 pb-2 gap-2">
        {/* Event name + thumbnail + eye icon */}
        <View className="flex-row items-center gap-2">
          {ticket.eventImageUrl ? (
            <FlameImage
              source={{ uri: ticket.eventImageUrl }}
              className="w-[44px] h-[43px] rounded-[8px]"
              contentFit="cover"
            />
          ) : (
            <View className="w-[44px] h-[43px] rounded-[8px] bg-white-10 items-center justify-center">
              <Ionicons name="image-outline" size={20} color={colors["white-30"]} />
            </View>
          )}
          <Text className="flex-1 text-white-100 text-base font-poppins-semibold uppercase">
            {ticket.tierName
              ? `${ticket.eventName} — ${ticket.tierName}${ticket.stageName ? ` (${ticket.stageName})` : ""}`
              : ticket.eventName}
          </Text>
          <Ionicons name="eye-outline" size={24} color={colors["white-100"]} />
        </View>

        {/* Date / time row */}
        <View className="flex-row items-center gap-2">
          <Ionicons name="calendar-outline" size={24} color={colors["white-100"]} />
          <View className="flex-1 flex-row items-center gap-2">
            <View className="border-r border-[#BFC0C2] pr-1">
              <Text className="text-white-100 text-xs leading-4 font-poppins-light">
                {ticket.date}
              </Text>
            </View>
            <Text className="text-white-100 text-xs leading-4 font-poppins-light">
              {ticket.timeRange}
            </Text>
          </View>
        </View>

        {/* Location row */}
        <View className="flex-row items-center gap-2">
          <Ionicons name="location-outline" size={24} color={colors["white-100"]} />
          <Text className="flex-1 text-white-100 text-xs leading-4 font-poppins-light">
            {ticket.location}
          </Text>
        </View>
      </View>

      {/* Bottom section — quantity + price */}
      <View className="flex-row items-center gap-6">
        <Text className="text-white-80 text-base leading-[22px] font-poppins">
          Ticket QNT:{" "}
          <Text className="text-white-100 font-poppins-semibold">
            {ticket.ticketQuantity}
          </Text>
        </Text>
        <Text className="text-white-80 text-base leading-[22px] font-poppins">
          Price:{" "}
          <Text className="text-white-100 font-poppins-medium">
            {ticket.priceDisplay}
          </Text>
        </Text>
      </View>
    </Wrapper>
  );
}
