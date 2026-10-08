import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useStripeConnect } from "../../hooks/useStripeConnect";

interface PaymentAccountBannerProps {
  organizationId: string | undefined;
}

export function PaymentAccountBanner({ organizationId }: PaymentAccountBannerProps) {
  const router = useRouter();
  const { status, isLoading } = useStripeConnect(organizationId);

  if (isLoading || !status) return null;

  const isFullyConnected = status.connected && status.chargesEnabled && status.payoutsEnabled;
  const isPartial = status.connected && (!status.chargesEnabled || !status.payoutsEnabled);

  const subtitle = isFullyConnected
    ? "Your Stripe account is fully connected and ready to accept payments."
    : isPartial
      ? "Your Stripe account is connected but needs additional information to accept payments."
      : "Please connect your Stripe account to accept payments and receive payouts.";

  const badgeLabel = isFullyConnected ? "Connected" : isPartial ? "Action Required" : "Not Connected";
  const badgeBg = isFullyConnected
    ? "bg-[rgba(34,197,94,0.15)]"
    : "bg-[rgba(234,179,8,0.15)]";
  const badgeTextColor = isFullyConnected ? "text-[#22C55E]" : "text-[#EAB308]";
  const badgeIconName = isFullyConnected ? "checkmark-circle" as const : "time" as const;
  const badgeIconColor = isFullyConnected ? "#22C55E" : "#EAB308";

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/account", params: { tab: "payouts" } })}
      className="mx-4 bg-card border border-white-30 rounded-card p-4 flex-row items-center justify-between gap-3"
    >
      <View className="flex-1">
        <Text className="text-white-100 font-poppins-semibold text-base">
          Payment Account
        </Text>
        <Text className="text-white-50 text-sm leading-5 font-poppins mt-1">
          {subtitle}
        </Text>
      </View>
      <View className={`${badgeBg} rounded-pill px-3 py-1 flex-row items-center gap-[6px]`}>
        <Ionicons name={badgeIconName} size={14} color={badgeIconColor} />
        <Text className={`${badgeTextColor} text-xs leading-4 font-poppins-medium`}>
          {badgeLabel}
        </Text>
      </View>
    </Pressable>
  );
}
