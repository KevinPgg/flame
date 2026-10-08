import { type ReactNode } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { formatCentsAsPrice } from "@project-flame/lib";
import type { RsvpRequestData, RsvpStatus } from "../../hooks/useRsvpManagement";

const STATUS_CONFIG: Record<
  RsvpStatus,
  { color: string; label: string }
> = {
  pending: { color: "#FBD68D", label: "Pending" },
  approved: { color: "#5DDBB1", label: "Approved" },
  rejected: { color: "#EA3370", label: "Rejected" },
  expired: { color: "rgba(255,255,255,0.5)", label: "Expired" },
  unknown: { color: "rgba(255,255,255,0.3)", label: "Unknown" },
};

function IconCircle({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <View className="bg-white-10 size-[36px] rounded-full items-center justify-center">
      {children}
    </View>
  );
}

interface RsvpRequestCardProps {
  request: RsvpRequestData;
  onViewDetails?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  isProcessing?: boolean;
  isPastEvent?: boolean;
  currency?: string;
}

export function RsvpRequestCard({
  request,
  onViewDetails,
  onApprove,
  onReject,
  isProcessing,
  isPastEvent,
  currency,
}: RsvpRequestCardProps) {
  const statusConfig = STATUS_CONFIG[request.status];

  return (
    <View className="bg-card rounded-card p-[10px] gap-4">
      {/* Header: name + ID | status badge */}
      <View className="gap-2">
        <View className="border-b border-white-20 pb-2 flex-row items-start justify-between">
          <View className="flex-1 gap-2">
            <Text className="text-white-100 text-base font-poppins-semibold uppercase">
              {request.personName}
            </Text>
            <Text className="text-white-100 text-xs leading-4 font-poppins">
              ID: {request.personId}
            </Text>
          </View>

          {/* Status badge */}
          <View className="w-[60px] items-center">
            <Text
              style={{ color: statusConfig.color }}
              className="text-xs leading-4 font-poppins-medium"
            >
              {statusConfig.label}
            </Text>
            {request.statusDate && (
              <Text className="text-[rgba(255,255,255,0.6)] text-[10px] leading-4 font-poppins">
                {request.statusDate}
              </Text>
            )}
          </View>
        </View>

        {/* Info rows — 2x2 grid with equal-width items */}
        <View className="gap-2">
          {/* Row 1: Tier + Ticket count */}
          <View className="flex-row items-center gap-4">
            <View className="flex-1 flex-row items-center gap-2">
              <IconCircle>
                <Ionicons name="ticket-outline" size={24} color="#F9FBFE" />
              </IconCircle>
              <Text className="flex-1 text-white-100 text-sm leading-5 font-poppins-medium" numberOfLines={1}>
                {request.tierName}
              </Text>
            </View>
            <View className="flex-1 flex-row items-center gap-2">
              <IconCircle>
                <MaterialCommunityIcons
                  name="alpha-q-box-outline"
                  size={24}
                  color="#F9FBFE"
                />
              </IconCircle>
              <Text className="flex-1 text-white-100 text-sm leading-5 font-poppins-medium" numberOfLines={1}>
                {request.ticketCount} {request.ticketCount === 1 ? "ticket" : "tickets"}
              </Text>
            </View>
          </View>

          {/* Row 2: Date + Price */}
          <View className="flex-row items-center gap-4">
            <View className="flex-1 flex-row items-center gap-2">
              <IconCircle>
                <Ionicons name="calendar-outline" size={24} color="#F9FBFE" />
              </IconCircle>
              <Text className="flex-1 text-white-100 text-sm leading-5 font-poppins-medium" numberOfLines={1}>
                {request.requestDate}
              </Text>
            </View>
            <View className="flex-1 flex-row items-center gap-2">
              <IconCircle>
                <MaterialCommunityIcons
                  name="cash"
                  size={24}
                  color="#F9FBFE"
                />
              </IconCircle>
              <Text className="flex-1 text-white-100 text-sm leading-5 font-poppins-medium" numberOfLines={1}>
                {formatCentsAsPrice(request.price, currency)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Action buttons — aligned to the right */}
      <View className="flex-row items-center justify-end gap-2">
        <Pressable
          onPress={onViewDetails}
          disabled={isProcessing || !onViewDetails}
          className="border border-white-30 rounded-pill px-[14px] py-2"
          style={isProcessing || !onViewDetails ? { opacity: 0.5 } : undefined}
        >
          <Text className="text-white-100 text-xs leading-4 font-poppins">
            View Details
          </Text>
        </Pressable>
        {request.status === "pending" && !isPastEvent && (
          <>
            <Pressable
              onPress={onReject}
              disabled={isProcessing || !onReject}
              className="border border-white-30 rounded-pill px-4 py-[10px]"
              style={isProcessing || !onReject ? { opacity: 0.5 } : undefined}
            >
              <Text className="text-white-100 text-sm leading-5 font-poppins-medium">
                Reject
              </Text>
            </Pressable>
            <Pressable
              onPress={onApprove}
              disabled={isProcessing || !onApprove}
              className="bg-white-100 rounded-pill px-6 py-[10px]"
              style={isProcessing || !onApprove ? { opacity: 0.5 } : undefined}
            >
              <Text className="text-dark text-sm leading-5 font-poppins-medium">
                Approve
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}
