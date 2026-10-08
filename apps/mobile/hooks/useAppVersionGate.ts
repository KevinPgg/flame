/**
 * useAppVersionGate — resolves the current version-gate status.
 *
 * Compares the native binary version (from Info.plist) against the remote
 * config served by /api/mobile/app-config. Returns one of:
 *   - "hard": render <ForceUpdateScreen /> above the entire app, no dismiss.
 *   - "soft": render <UpdateAvailableBanner /> on top of the normal app.
 *   - "ok":   render the app as usual.
 *
 * Refetch policy:
 *   - On mount, TanStack Query runs the query.
 *   - On AppState → "active", we `refetchQueries` (bypasses staleTime), so a
 *     user who backgrounds and re-foregrounds gets the freshest config.
 *   - staleTime = 5min is fine because the AppState listener manually
 *     invalidates; the 5min just deduplicates accidental re-renders mid-session.
 *
 * Production-only by default:
 *   - In dev / preview channels the gate is short-circuited to "ok" so internal
 *     testers don't get force-updated mid-test. Set EXPO_PUBLIC_DEV_FORCE_GATE=1
 *     in apps/mobile/.env to force-enable the gate in dev for the test matrix.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isProductionBuild } from "../lib/internal";
import {
  fetchAppConfig,
  getCurrentNativeVersion,
  getPlatformConfig,
  resolveGateStatus,
  type AppConfigResponse,
  type GateStatus,
  type PlatformConfig,
} from "../lib/version-check";

const QUERY_KEY = ["app-config"] as const;
const STALE_TIME_MS = 5 * 60 * 1000;

// __DEV__-only escape hatch so the local test matrix can force the gate on in
// dev/preview builds. Strip-eligible in production: __DEV__ is false there and
// process.env.EXPO_PUBLIC_DEV_FORCE_GATE will never be set in EAS production env.
const FORCE_GATE_IN_DEV =
  __DEV__ && process.env.EXPO_PUBLIC_DEV_FORCE_GATE === "1";

export type AppVersionGateResult = {
  status: GateStatus;
  config: PlatformConfig | null;
  currentVersion: string;
  isLoading: boolean;
};

export function useAppVersionGate(): AppVersionGateResult {
  const queryClient = useQueryClient();

  const currentVersion = useMemo(() => getCurrentNativeVersion(), []);
  // The gate is intentionally OFF in dev/preview channels (TestFlight, dev
  // builds). FORCE_GATE_IN_DEV flips it back on so we can verify scenarios
  // locally. This pair MUST stay in sync with the same logic in
  // useOtaUpdatePrompt — see the test matrix in EAS_OTA_UPDATES.md.
  const gateEnabled = isProductionBuild || FORCE_GATE_IN_DEV;

  const { data, isLoading } = useQuery<AppConfigResponse>({
    queryKey: QUERY_KEY,
    queryFn: fetchAppConfig,
    staleTime: STALE_TIME_MS,
    enabled: gateEnabled,
    // fetchAppConfig is fail-open — no point retrying on network errors,
    // we'd just delay reaching the safe-default. AppState refetch covers
    // recovery when the user comes back online.
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  // Re-fetch on foreground so a user who backgrounds the app while we ship a
  // gate flip picks it up on their next "active" transition. Uses
  // refetchQueries (not invalidateQueries) so the previous data stays visible
  // while the new fetch is in flight — avoids a flash of "ok" → "hard".
  useEffect(() => {
    if (!gateEnabled) return;
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") {
        queryClient.refetchQueries({ queryKey: QUERY_KEY });
      }
    });
    return () => sub.remove();
  }, [queryClient, gateEnabled]);

  const { status, config } = useMemo(() => {
    if (!gateEnabled) {
      return { status: "ok" as GateStatus, config: null };
    }
    if (!data) {
      // First-load: don't gate. Either the safe-default is on its way or we
      // hit a cached fresh value via fetchAppConfig. Either way, "ok" is the
      // right starting state to avoid a flash of ForceUpdateScreen.
      return { status: "ok" as GateStatus, config: null };
    }
    const platformConfig = getPlatformConfig(data);
    return {
      status: resolveGateStatus({ currentVersion, platformConfig }),
      config: platformConfig,
    };
  }, [data, currentVersion, gateEnabled]);

  return { status, config, currentVersion, isLoading };
}

/**
 * useSoftBannerDismissal — companion hook that exposes "dismissed for this
 * latest_version?" state. Persistence is per-version so once the operator
 * bumps latest_version the banner reappears, but within a single
 * latest_version the banner only ever nags once per device.
 */

import * as SecureStore from "expo-secure-store";

const SOFT_DISMISS_KEY = "app_config_soft_banner_dismissal_v1";

type DismissalState = { dismissedForVersion: string | null };

export function useSoftBannerDismissal(latestVersion: string | undefined) {
  const [state, setState] = useState<DismissalState>({ dismissedForVersion: null });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(SOFT_DISMISS_KEY);
        if (!mounted || !raw) return;
        const parsed = JSON.parse(raw) as DismissalState;
        if (typeof parsed?.dismissedForVersion === "string") {
          setState(parsed);
        }
      } catch (err) {
        // Best-effort load; failure is non-fatal (banner just stays visible
        // until in-session dismissal). Log in __DEV__ so silent SecureStore
        // breakage is at least diagnosable in Metro logs.
        if (__DEV__) {
          console.warn("[useSoftBannerDismissal] dismissal_load failed", {
            key: SOFT_DISMISS_KEY,
            err,
          });
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const isDismissed = Boolean(
    latestVersion &&
      state.dismissedForVersion &&
      state.dismissedForVersion === latestVersion,
  );

  const dismiss = useCallback(async () => {
    if (!latestVersion) return;
    const next: DismissalState = { dismissedForVersion: latestVersion };
    setState(next);
    try {
      await SecureStore.setItemAsync(SOFT_DISMISS_KEY, JSON.stringify(next));
    } catch (err) {
      // Best-effort persist; in-memory state still hides the banner for this
      // session, so the user UX is correct — they just see the banner again
      // next launch. Log in __DEV__ for diagnosability.
      if (__DEV__) {
        console.warn("[useSoftBannerDismissal] dismissal_persist failed", {
          key: SOFT_DISMISS_KEY,
          latestVersion,
          err,
        });
      }
    }
  }, [latestVersion]);

  return { isDismissed, dismiss };
}
