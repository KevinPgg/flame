import { View, Text } from "react-native";

export interface StatCardProps {
  label: string;
  value: string;
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <View className="flex-1 bg-white-5 border border-white-5 rounded-card p-3 gap-2">
      <Text className="text-[#EAEAEB] text-base leading-[22px] font-poppins-medium">
        {label}
      </Text>
      <Text className="text-white-100 text-lg font-poppins-semibold">
        {value}
      </Text>
    </View>
  );
}

export interface StatsGridProps {
  totalTickets?: number;
  pending?: number;
  purchased?: number;
}

export function StatsGrid({
  totalTickets = 0,
  pending = 0,
  purchased = 0,
}: StatsGridProps) {
  return (
    <View className="px-4">
      <View className="flex-row gap-2">
        <StatCard label="Total" value={`${totalTickets}`} />
        <StatCard label="Purchased" value={`${purchased}`} />
        <StatCard label="Pending" value={`${pending}`} />
      </View>
    </View>
  );
}
