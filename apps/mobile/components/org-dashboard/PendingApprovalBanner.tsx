import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DashboardBar } from "../dashboard/DashboardBar";

interface PendingApprovalBannerProps {
  organizationName: string;
}

export function PendingApprovalBanner({ organizationName }: PendingApprovalBannerProps) {
  return (
    <View className="flex-1 bg-background">
      <DashboardBar />
      <View className="flex-1 items-center justify-center px-6">
      <View className="bg-card border border-white-30 rounded-card p-6 gap-4 items-center w-full">
        <View className="size-[56px] rounded-[9999px] bg-[rgba(234,179,8,0.15)] items-center justify-center">
          <Ionicons name="time" size={28} color="#EAB308" />
        </View>
        <Text className="text-white-100 text-lg font-poppins-semibold text-center">
          Waiting for Approval
        </Text>
        <Text className="text-white-80 text-sm leading-5 font-poppins text-center">
          <Text className="font-poppins-semibold">{organizationName}</Text> is
          currently under review. You&apos;ll be able to access the organizer
          dashboard once your organization has been approved.
        </Text>
        <View className="bg-[rgba(234,179,8,0.15)] rounded-pill px-4 py-[6px] flex-row items-center gap-2">
          <Ionicons name="time" size={14} color="#EAB308" />
          <Text className="text-[#EAB308] text-xs leading-4 font-poppins-medium">
            Pending Review
          </Text>
        </View>
      </View>
      </View>
    </View>
  );
}
