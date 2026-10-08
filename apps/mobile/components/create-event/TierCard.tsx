import { type ReactNode } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import type { CreateEventTier } from "../../data/mock";

interface TierCardProps {
  tier: CreateEventTier;
  index: number;
  onEdit?: () => void;
  onDelete?: () => void;
}

function IconBubble({ children }: { children: ReactNode }) {
  return (
    <View className="bg-white-10 rounded-full size-[36px] items-center justify-center">
      {children}
    </View>
  );
}

export function TierCard({ tier, index, onEdit, onDelete }: TierCardProps) {
  return (
    <View className="bg-white-5 rounded-card px-4 py-3 gap-3">
      {/* Header */}
      <View className="flex-row items-center justify-between pb-2 border-b border-white-10">
        <Text className="text-white-100 text-lg font-poppins-semibold uppercase">
          Tier {index + 1}
        </Text>
        <View className="flex-row gap-2">
          {onEdit && (
            <Pressable
              className="bg-white-100 rounded-full size-[36px] items-center justify-center"
              onPress={onEdit}
            >
              <Ionicons name="pencil" size={18} color="#292D32" />
            </Pressable>
          )}
          <Pressable
            className="bg-white-100 rounded-full size-[36px] items-center justify-center"
            onPress={onDelete}
          >
            <Ionicons name="trash-outline" size={18} color="#292D32" />
          </Pressable>
        </View>
      </View>

      {/* Row 1: Tier Name + Price */}
      <View className="flex-row items-center gap-8">
        <View className="flex-row items-center gap-2 w-[152px]">
          <IconBubble>
            <MaterialCommunityIcons
              name="ticket-outline"
              size={20}
              color="#F9FBFE"
            />
          </IconBubble>
          <Text className="text-white-100 text-base leading-[22px] font-poppins-medium">
            {tier.name}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <IconBubble>
            <Ionicons name="cash-outline" size={20} color="#F9FBFE" />
          </IconBubble>
          <Text className="text-white-100 text-base leading-[22px] font-poppins-medium">
            ${tier.price.toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Row 2: Availability + Per User */}
      <View className="flex-row items-center gap-8">
        <View className="flex-row items-center gap-2">
          <IconBubble>
            <MaterialCommunityIcons
              name="alpha-a-circle-outline"
              size={20}
              color="#F9FBFE"
            />
          </IconBubble>
          <Text className="text-white-100 text-xs leading-4 font-poppins-medium">
            {Math.max(0, tier.totalAvailable - tier.sold)}/{tier.totalAvailable} available
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <IconBubble>
            <MaterialCommunityIcons
              name="account-outline"
              size={20}
              color="#F9FBFE"
            />
          </IconBubble>
          <Text className="text-white-100 text-xs leading-4 font-poppins-medium">
            {tier.perUserLimit} per user
          </Text>
        </View>
      </View>
    </View>
  );
}
