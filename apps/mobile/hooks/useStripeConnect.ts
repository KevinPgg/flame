/**
 * Stripe Connect status and onboarding hook.
 *
 * Ported from: apps/web/app/components/StripeConnectStatus.tsx
 * API endpoints:
 *   GET  /api/stripe/connect/status?organizationId=X
 *   POST /api/stripe/connect/onboard { organizationId }
 *
 * Mobile uses Linking.openURL() instead of window.location.href for onboarding redirect.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { AppState, AppStateStatus, Linking } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, ApiError } from "../lib/api";
import { useOptionalAuth } from "./useOptionalAuth";

export interface ConnectStatus {
  connected: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  accountId: string | null;
}

interface OnboardResponse {
  url: string;
}

export function useStripeConnect(organizationId: string | undefined) {
  const { getToken } = useOptionalAuth();
  const queryClient = useQueryClient();
  const [onboarding, setOnboarding] = useState(false);
  const [onboardError, setOnboardError] = useState<string | null>(null);

  const {
    data: status,
    isLoading,
    error: fetchError,
    refetch,
  } = useQuery<ConnectStatus>({
    queryKey: ["stripe-connect-status", organizationId],
    queryFn: () =>
      apiGet<ConnectStatus>(
        `/api/stripe/connect/status?organizationId=${encodeURIComponent(organizationId!)}`,
        getToken
      ),
    enabled: Boolean(organizationId),
    staleTime: 2 * 60 * 1000,
  });

  // `country` is only sent when creating a brand-new connected account (the
  // "Connect with Stripe" button). For existing accounts (Complete Setup /
  // Manage) the onboard route skips creation, so country is omitted/ignored.
  const handleConnect = useCallback(async (country?: string) => {
    if (!organizationId || onboarding) return;

    try {
      setOnboarding(true);
      setOnboardError(null);

      const data = await apiPost<OnboardResponse>(
        "/api/stripe/connect/onboard",
        { organizationId, ...(country ? { country } : {}) },
        getToken
      );

      const parsedUrl = new URL(data.url);
      const isValidStripeHost =
        parsedUrl.hostname === "stripe.com" ||
        parsedUrl.hostname.endsWith(".stripe.com");
      if (parsedUrl.protocol !== "https:" || !isValidStripeHost) {
        throw new Error("Invalid onboarding URL received from server.");
      }
      if (!(await Linking.canOpenURL(data.url))) {
        throw new Error("This device cannot open the Stripe URL.");
      }
      await Linking.openURL(data.url);
    } catch (err) {
      console.error("[useStripeConnect] onboarding error:", err);

      let message = "Failed to start onboarding";
      if (err instanceof ApiError) {
        message = err.message;
      } else if (err instanceof Error) {
        message = err.message;
      }
      setOnboardError(message);
    } finally {
      setOnboarding(false);
    }
  }, [organizationId, onboarding, getToken]);

  const refreshStatus = useCallback(async () => {
    setOnboardError(null);
    await refetch();
  }, [refetch]);

  const invalidateStatus = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["stripe-connect-status", organizationId],
    });
  }, [queryClient, organizationId]);

  // Foreground-resume polling. When the user opens Stripe onboarding via
  // Linking.openURL the app goes to background; coming back to foreground is
  // our cue that they may have finished onboarding. Re-fetch status so the
  // banner / pill flips from "Action Required" → "Connected" without the user
  // having to pull-to-refresh. Industry standard for OAuth-style mobile flows
  // (Uber, DoorDash, Lyft all do this). Skips re-fetch once the account is
  // fully enabled to avoid needless Stripe API calls on every app resume.
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const isFullyConnected =
    !!status?.connected && !!status?.chargesEnabled && !!status?.payoutsEnabled;

  useEffect(() => {
    if (!organizationId || isFullyConnected) return;

    const sub = AppState.addEventListener("change", (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (prev.match(/inactive|background/) && next === "active") {
        invalidateStatus();
      }
    });

    return () => {
      sub.remove();
    };
  }, [organizationId, isFullyConnected, invalidateStatus]);

  return {
    status: status ?? null,
    isLoading,
    fetchError: fetchError instanceof Error ? fetchError.message : null,
    onboarding,
    onboardError,
    handleConnect,
    refreshStatus,
    invalidateStatus,
  };
}
