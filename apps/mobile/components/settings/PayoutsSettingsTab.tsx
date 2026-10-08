/**
 * Payouts settings tab — displays Stripe Connect status and onboarding.
 *
 * Ported from: apps/web/app/components/StripeConnectStatus.tsx
 * States: loading, error, not-connected, incomplete, fully-connected.
 * Onboarding redirects to Stripe via Linking.openURL().
 */

import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DEFAULT_CONNECT_COUNTRY } from "@project-flame/lib";
import { useOrgData } from "../../hooks/useOrgData";
import { useStripeConnect } from "../../hooks/useStripeConnect";
import { useMemberRoleContext } from "../../contexts/MemberRoleContext";
import { ConnectCountrySelector } from "./ConnectCountrySelector";

function StatusBadge({
  label,
  variant,
}: {
  label: string;
  variant: "success" | "warning" | "pending";
}) {
  const colorMap = {
    success: {
      bg: "bg-[rgba(34,197,94,0.15)]",
      text: "text-[#22C55E]",
      icon: "checkmark-circle" as const,
    },
    warning: {
      bg: "bg-[rgba(234,179,8,0.15)]",
      text: "text-[#EAB308]",
      icon: "warning" as const,
    },
    pending: {
      bg: "bg-[rgba(255,255,255,0.1)]",
      text: "text-white-50",
      icon: "time" as const,
    },
  };
  const style = colorMap[variant];

  return (
    <View
      className={`${style.bg} rounded-pill px-3 py-1 flex-row items-center gap-[6px]`}
    >
      <Ionicons
        name={style.icon}
        size={14}
        color={
          variant === "success"
            ? "#22C55E"
            : variant === "warning"
              ? "#EAB308"
              : "rgba(255,255,255,0.5)"
        }
      />
      <Text className={`${style.text} text-xs leading-4 font-poppins-medium`}>
        {label}
      </Text>
    </View>
  );
}

function StatusItem({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <View className="flex-row items-center gap-2">
      <Ionicons
        name={enabled ? "checkmark-circle" : "close-circle"}
        size={18}
        color={enabled ? "#22C55E" : "#EAB308"}
      />
      <Text className="text-white-80 text-sm leading-5 font-poppins">
        {label}: {enabled ? "Enabled" : "Disabled"}
      </Text>
    </View>
  );
}

function ConnectButton({
  label,
  onPress,
  loading,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  loading: boolean;
  variant?: "primary" | "secondary";
}) {
  const isPrimary = variant === "primary";
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      className={`rounded-pill py-[10px] px-6 flex-row items-center justify-center gap-2 ${
        isPrimary ? "bg-white-100" : "border border-white-30"
      } ${loading ? "opacity-60" : ""}`}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={isPrimary ? "#041C2B" : "#F9FBFE"}
        />
      ) : null}
      <Text
        className={`text-sm leading-[22px] font-poppins-medium ${
          isPrimary ? "text-dark" : "text-white-100"
        }`}
      >
        {loading ? "Opening Stripe..." : label}
      </Text>
      {!loading && (
        <Ionicons
          name="arrow-forward"
          size={16}
          color={isPrimary ? "#041C2B" : "#F9FBFE"}
        />
      )}
    </Pressable>
  );
}

export function PayoutsSettingsTab() {
  const { selectedOrgId } = useMemberRoleContext();
  const { data: orgData, isLoading: orgLoading } = useOrgData(selectedOrgId);
  const {
    status,
    isLoading,
    fetchError,
    onboarding,
    onboardError,
    handleConnect,
    refreshStatus,
  } = useStripeConnect(selectedOrgId ?? undefined);

  // Country is only used when creating a brand-new connected account.
  const [selectedCountry, setSelectedCountry] = useState<string>(
    DEFAULT_CONNECT_COUNTRY,
  );

  // Reset the pre-creation country selection when the active org changes so a
  // new org never inherits the previous org's market (this tab stays mounted
  // across org switches). Only relevant before the connected account is created.
  useEffect(() => {
    setSelectedCountry(DEFAULT_CONNECT_COUNTRY);
  }, [selectedOrgId]);

  if (orgLoading || isLoading) {
    return (
      <View className="px-4 py-8 items-center gap-3">
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text className="text-white-50 text-sm leading-5 font-poppins">
          Loading payment status...
        </Text>
      </View>
    );
  }

  if (!orgData) {
    return (
      <View className="px-4 py-8 items-center gap-3">
        <Ionicons
          name="business-outline"
          size={40}
          color="rgba(255,255,255,0.3)"
        />
        <Text className="text-white-50 text-sm leading-5 font-poppins text-center">
          No organization found. You need to be part of an organization to
          manage payouts.
        </Text>
      </View>
    );
  }

  if (fetchError) {
    return (
      <View className="px-4 gap-4">
        <View className="bg-white-5 border border-white-20 rounded-card p-4 gap-3">
          <View className="flex-row items-center gap-2">
            <Ionicons name="alert-circle" size={24} color="#EF4444" />
            <Text className="text-white-100 text-base font-poppins-semibold">
              Error Loading Payment Status
            </Text>
          </View>
          <Text className="text-white-80 text-sm leading-5 font-poppins">
            {fetchError}
          </Text>
          <ConnectButton
            label="Try Again"
            onPress={refreshStatus}
            loading={false}
            variant="secondary"
          />
        </View>
      </View>
    );
  }

  const displayError = onboardError ? (
    <View className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] rounded-card p-3 gap-1">
      <Text className="text-[#EF4444] text-xs leading-4 font-poppins-medium">
        Onboarding Error
      </Text>
      <Text className="text-white-80 text-xs leading-4 font-poppins">
        {onboardError}
      </Text>
    </View>
  ) : null;

  if (!status?.connected || !status?.accountId) {
    return (
      <View className="px-4 gap-6">
        <View className="bg-white-5 border border-white-20 rounded-card p-4 gap-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-white-100 text-lg font-poppins-semibold">
              Payment Setup Required
            </Text>
            <StatusBadge label="Not Connected" variant="pending" />
          </View>
          <Text className="text-white-80 text-sm leading-5 font-poppins">
            Connect your Stripe account to accept payments for{" "}
            <Text className="font-poppins-semibold">
              {orgData.organizationName}
            </Text>
            . This is required to sell tickets and receive payouts.
          </Text>
          <ConnectCountrySelector
            value={selectedCountry}
            onChange={setSelectedCountry}
            disabled={onboarding}
          />
          {displayError}
          <ConnectButton
            label="Connect with Stripe"
            onPress={() => handleConnect(selectedCountry)}
            loading={onboarding}
          />
        </View>

        <PayoutsInfoSection />
      </View>
    );
  }

  if (!status.chargesEnabled || !status.payoutsEnabled) {
    return (
      <View className="px-4 gap-6">
        <View className="bg-white-5 border border-white-20 rounded-card p-4 gap-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-white-100 text-lg font-poppins-semibold">
              Complete Payment Setup
            </Text>
            <StatusBadge label="Action Required" variant="warning" />
          </View>
          <Text className="text-white-80 text-sm leading-5 font-poppins">
            Your Stripe account for{" "}
            <Text className="font-poppins-semibold">
              {orgData.organizationName}
            </Text>{" "}
            is connected but needs additional information to accept payments.
          </Text>
          <View className="gap-2">
            <StatusItem label="Charges" enabled={status.chargesEnabled} />
            <StatusItem label="Payouts" enabled={status.payoutsEnabled} />
          </View>
          {displayError}
          <ConnectButton
            label="Complete Setup"
            onPress={() => handleConnect()}
            loading={onboarding}
          />
        </View>

        <PayoutsInfoSection />
      </View>
    );
  }

  return (
    <View className="px-4 gap-6">
      <View className="bg-white-5 border border-white-20 rounded-card p-4 gap-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-white-100 text-lg font-poppins-semibold">
            Payment Account
          </Text>
          <StatusBadge label="Connected" variant="success" />
        </View>
        <Text className="text-white-80 text-sm leading-5 font-poppins">
          Your Stripe account is fully connected and ready to accept payments
          for{" "}
          <Text className="font-poppins-semibold">
            {orgData.organizationName}
          </Text>
          .
        </Text>
        <View className="gap-2">
          <StatusItem label="Charges" enabled={true} />
          <StatusItem label="Payouts" enabled={true} />
        </View>
        <ConnectButton
          label="Manage Stripe Account"
          onPress={() => handleConnect()}
          loading={onboarding}
          variant="secondary"
        />
      </View>

      <PayoutsInfoSection />
    </View>
  );
}

function PayoutsInfoSection() {
  return (
    <View className="bg-white-5 border border-white-20 rounded-card p-4 gap-3">
      <Text className="text-white-100 text-base font-poppins-semibold">
        About Payouts
      </Text>
      <Text className="text-white-80 text-sm leading-5 font-poppins">
        Payouts are processed through Stripe Connect. Once your account is fully
        set up, ticket revenue will be available for payout according to your
        Stripe payout schedule.
      </Text>
      <View className="gap-2 mt-1">
        <View className="flex-row items-start gap-2">
          <Ionicons
            name="shield-checkmark"
            size={16}
            color="rgba(255,255,255,0.5)"
            style={{ marginTop: 2 }}
          />
          <Text className="text-white-50 text-xs leading-4 font-poppins flex-1">
            Secure payments powered by Stripe
          </Text>
        </View>
        <View className="flex-row items-start gap-2">
          <Ionicons
            name="card"
            size={16}
            color="rgba(255,255,255,0.5)"
            style={{ marginTop: 2 }}
          />
          <Text className="text-white-50 text-xs leading-4 font-poppins flex-1">
            Payouts are managed directly through your Stripe dashboard
          </Text>
        </View>
      </View>
    </View>
  );
}
