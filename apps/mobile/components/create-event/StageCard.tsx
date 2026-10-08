import { type ReactNode } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import type { CreateEventStage } from "../../data/mock";

interface StageCardProps {
  stage: CreateEventStage;
  onDelete?: () => void;
}

function IconBubble({ children }: { children: ReactNode }) {
  return (
    <View className="bg-white-10 rounded-full size-[36px] items-center justify-center">
      {children}
    </View>
  );
}

export function StageCard({ stage, onDelete }: StageCardProps) {
  return (
    <View className="bg-card border border-white-10 rounded-card px-4 py-3 gap-3">
      {/* Header */}
      <View className="flex-row items-center justify-between pb-2 border-b border-white-10">
        <Text className="text-white-100 text-lg font-poppins-semibold uppercase">
          {stage.stageName}
        </Text>
        {onDelete && (
          <Pressable
            className="bg-white-100 rounded-full size-[36px] items-center justify-center"
            onPress={onDelete}
          >
            <Ionicons name="trash-outline" size={18} color="#292D32" />
          </Pressable>
        )}
      </View>

      {/* Row 1: Tier Name (full width) */}
      <View className="flex-row items-center gap-2">
        <IconBubble>
          <MaterialCommunityIcons
            name="ticket-outline"
            size={20}
            color="#F9FBFE"
          />
        </IconBubble>
        <Text className="text-white-100 text-base leading-[22px] font-poppins-medium">
          {stage.tierName}
        </Text>
      </View>

      {/* Row 2: Cost + Quantity */}
      <View className="flex-row items-center gap-8">
        <View className="flex-row items-center gap-2">
          <IconBubble>
            <Ionicons name="cash-outline" size={20} color="#F9FBFE" />
          </IconBubble>
          <Text className="text-white-100 text-base leading-[22px] font-poppins-medium">
            ${stage.price}
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
            {stage.ticketCount} tickets
          </Text>
        </View>
      </View>
    </View>
  );
}
