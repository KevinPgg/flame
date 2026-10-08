import { View, Text, ScrollView } from "react-native";
import type { RsvpDetailStats } from "../../hooks/useRsvpManagement";

interface RsvpStatsBarProps {
  stats: RsvpDetailStats;
}

export function RsvpStatsBar({ stats }: RsvpStatsBarProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ alignItems: "center", gap: 16 }}
    >
      {/* ALL count — bold, separated by vertical divider */}
      <View className="flex-row items-center gap-2 border-r border-[rgba(255,255,255,0.6)] pr-2 py-1">
        <Text className="text-white-100 text-lg font-poppins-semibold uppercase">
          All
        </Text>
        <Text className="text-white-100 text-sm leading-5 font-poppins-medium">
          :
        </Text>
        <Text className="text-white-100 text-lg font-poppins-semibold uppercase">
          {stats.total}
        </Text>
      </View>

      {/* Breakdown counts */}
      <View className="flex-row items-center gap-4">
        <View className="flex-row items-center gap-2">
          <Text className="text-white-100 text-sm leading-5 font-poppins">
            Pending:
          </Text>
          <Text className="text-white-100 text-sm leading-5 font-poppins">
            {stats.pending}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Text className="text-white-100 text-sm leading-5 font-poppins">
            Approved:
          </Text>
          <Text className="text-white-100 text-sm leading-5 font-poppins">
            {stats.approved}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Text className="text-white-100 text-sm leading-5 font-poppins">
            Rejected:
          </Text>
          <Text className="text-white-100 text-sm leading-5 font-poppins">
            {stats.rejected}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Text className="text-white-100 text-sm leading-5 font-poppins">
            Expired:
          </Text>
          <Text className="text-white-100 text-sm leading-5 font-poppins">
            {stats.expired}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
