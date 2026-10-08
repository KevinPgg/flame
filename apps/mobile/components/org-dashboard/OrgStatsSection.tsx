import { View, Text, Pressable } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { formatCentsAsPrice } from "@project-flame/lib";

function StatCard({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <View className="flex-1 bg-white-5 border border-white-5 rounded-card p-3 gap-2">
      <Text className="text-[#EAEAEB] text-base leading-[22px] font-poppins-semibold">
        {label}
      </Text>
      {typeof value === "string" ? (
        <Text className="text-white-100 text-lg font-poppins-semibold">
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
}

export interface OrgStatsSectionProps {
  totalEvents: number;
  totalRevenueCents: number;
  currency?: string;
  /** Per-currency revenue breakdown for multi-currency orgs */
  revenueByCurrency?: Map<string, number>;
  onScanPress?: () => void;
}

export function OrgStatsSection({
  totalEvents,
  totalRevenueCents,
  currency,
  revenueByCurrency,
  onScanPress,
}: OrgStatsSectionProps) {
  const hasMultipleCurrencies = revenueByCurrency && revenueByCurrency.size > 1;

  const revenueDisplay = hasMultipleCurrencies ? (
    <View>
      {[...revenueByCurrency.entries()].map(([cur, cents]) => (
        <Text key={cur} className="text-white-100 text-lg font-poppins-semibold">
          {formatCentsAsPrice(cents, cur)}
        </Text>
      ))}
    </View>
  ) : (
    formatCentsAsPrice(totalRevenueCents, currency)
  );

  return (
    <View className="gap-2 px-4">
      <View className="flex-row gap-2">
        <StatCard label="Total Events" value={`${totalEvents}`} />
        <StatCard label="Total Revenue" value={revenueDisplay} />
      </View>
      <Pressable
        onPress={onScanPress}
        className="bg-white-5 border border-white-5 rounded-card h-[67px] flex-row items-center justify-between p-3"
      >
        <Text className="text-[#EAEAEB] text-base leading-[22px] font-poppins-semibold">
          {"QR\nScanner"}
        </Text>
        <MaterialCommunityIcons name="qrcode-scan" size={33} color="#F9FBFE" />
      </Pressable>
    </View>
  );
}
