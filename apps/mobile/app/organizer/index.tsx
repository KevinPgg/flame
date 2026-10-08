/**
 * Stripe Connect return/refresh deep link handler for mobile.
 *
 * The mobile app has `associatedDomains: ["applinks:flme.co"]` so iOS
 * intercepts all https://flme.co/* links as Universal Links and opens them in
 * the app. After Stripe onboarding the server redirects to:
 *
 *   https://flme.co/organizer?org=<slug>&connect=success   ← onboarding done
 *   https://flme.co/organizer?error=<code>                 ← something failed
 *
 * Both land here. We show a brief status message then navigate to the org
 * profile so the user can see their updated Stripe status.
 */

import { useEffect, useRef } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { FlameText } from "@project-flame/ui";

const ERROR_MESSAGES: Record<string, string> = {
  missing_org_id: "Organization not found. Please try again from your profile.",
  missing_account_id: "Session expired. Please restart the payment setup.",
  unauthorized: "You don't have permission to manage payments for this organization.",
  insufficient_permissions: "Only owners and admins can manage payouts.",
  user_not_found: "Could not verify your account. Please sign in again.",
  org_not_found: "Organization not found.",
  account_mismatch: "Account verification failed. Please contact support.",
  update_failed: "Could not save your payment setup. Please try again.",
  server_error: "A server error occurred. Please try again.",
  connect_failed: "Payment setup could not be completed. Please try again.",
  refresh_failed: "Payment setup link expired. Please restart from your profile.",
};

export default function StripeConnectReturnScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    connect?: string;
    error?: string;
    org?: string;
  }>();
  const navigated = useRef(false);

  const isSuccess = params.connect === "success";
  const errorCode = params.error;
  const isError = !!errorCode;

  const message = isSuccess
    ? "Payment setup complete! Redirecting to your profile…"
    : isError
      ? (ERROR_MESSAGES[errorCode!] ?? "Something went wrong. Please try again from your profile.")
      : "Redirecting to your profile…";

  useEffect(() => {
    if (navigated.current) return;
    navigated.current = true;

    // Give the user time to read the message before navigating
    const delay = isError ? 2500 : 1200;
    const timer = setTimeout(() => {
      router.replace("/(tabs)/profile");
    }, delay);

    return () => clearTimeout(timer);
  }, [router, isError]);

  return (
    <View className="flex-1 bg-background items-center justify-center gap-5 px-8">
      <ActivityIndicator size="large" color="#FFFFFF" />
      <FlameText
        variant="body"
        className="text-white-80 text-center"
      >
        {message}
      </FlameText>
    </View>
  );
}
