import { View, Text, Pressable } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, FlameImage } from "@project-flame/ui";
import type {
  TicketGroupDisplay,
  TicketDisplayStatus,
} from "../../lib/user-ticket-mappers";

type TicketCardData = TicketGroupDisplay;

const STATUS_COLORS: Record<TicketDisplayStatus, string> = {
  purchased: "#30C680",
  pending: "#238FDA",
  cancelled: colors["white-50"],
};

const STATUS_LABELS: Record<TicketDisplayStatus, string> = {
  purchased: "Purchased",
  pending: "Pending",
  cancelled: "Cancelled",
};

const DEFAULT_STATUS_COLOR = "#9CA3AF";
const DEFAULT_STATUS_LABEL = "Unknown";

interface TicketCardProps {
  ticket: TicketCardData;
  onQRPress?: () => void;
}

export function TicketCard({ ticket, onQRPress }: TicketCardProps) {
  const statusColor = STATUS_COLORS[ticket.status] ?? DEFAULT_STATUS_COLOR;
  const statusLabel = STATUS_LABELS[ticket.status] ?? DEFAULT_STATUS_LABEL;

  const renderAction = () => {
    if (ticket.status === "purchased") {
      return (
        <Pressable onPress={onQRPress}>
          <MaterialCommunityIcons name="qrcode" size={33} color={colors["white-100"]} />
        </Pressable>
      );
    }
    if (ticket.status === "pending") {
      return (
        <Pressable
          disabled
          pointerEvents="none"
          className="px-6 py-[10px] rounded-pill bg-white-20"
          style={{ opacity: 0.6 }}
        >
          <Text className="text-white-80 text-sm leading-[22px] font-poppins-medium">
            Pending
          </Text>
        </Pressable>
      );
    }
    // cancelled / unknown — no action
    return null;
  };

  return (
    <View className="bg-card rounded-card p-[10px] gap-2">
      {/* Top section — event info + status badge */}
      <View className="border-b border-white-20 pb-2 flex-row items-start justify-between">
        <View className="flex-1 gap-2">
          {/* Event name + thumbnail */}
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
              {ticket.tierName || ticket.stageName
                ? `${ticket.eventName} — ${[ticket.tierName, ticket.stageName].filter(Boolean).join(" · ")}`
                : ticket.eventName}
            </Text>
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

        {/* Status label */}
        <Text
          style={{ color: statusColor }}
          className="text-xs leading-4 font-poppins"
        >
          {statusLabel}
        </Text>
      </View>

      {/* Bottom section — quantity, price, action */}
      <View className="flex-row items-center justify-between">
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

        {renderAction()}
      </View>
    </View>
  );
}
