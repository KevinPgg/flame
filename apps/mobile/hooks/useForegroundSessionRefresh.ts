/**
 * useForegroundSessionRefresh — refreshes the Clerk session token whenever the
 * app returns to the foreground.
 *
 * Why this exists (W8-M1): on resume, Clerk can briefly report
 * `isSignedIn: false` before the SecureStore token rehydrates. Any auth gate
 * that reads `isSignedIn` in that window (e.g. useRequireAuth) would falsely
 * bounce the user to /sign-in, even though a force-quit + relaunch — which runs
 * full hydration — shows them still signed in.
 *
 * The fix is the industry-standard "refresh on foreground": on every AppState
 * "active" transition we call `getToken({ skipCache: true })`, which forces
 * Clerk to re-read/refresh the session from the token cache before any gate
 * treats a transient `isSignedIn: false` as real. This mirrors the AppState
 * refetch pattern already used by useAppVersionGate / useOtaUpdatePrompt.
 *
 * Mounted once inside the ClerkProvider tree (AppShell) so it has auth context.
 * No-op when Clerk is not configured.
 */

import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useOptionalAuth } from "./useOptionalAuth";

export function useForegroundSessionRefresh(): void {
  const { getToken, isConfigured } = useOptionalAuth();

  // Hold the latest getToken in a ref so the AppState subscription is installed
  // once and never torn down/re-added as Clerk re-renders (getToken identity can
  // change across renders). Keeps the listener stable for the app's lifetime.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  useEffect(() => {
    if (!isConfigured) return;

    const sub = AppState.addEventListener(
      "change",
      (next: AppStateStatus) => {
        if (next !== "active") return;
        // Force a fresh token so Clerk rehydrates the session before any gate
        // reads isSignedIn. Best-effort: a failure here just means the gate
        // falls back to its own grace-period probe.
        getTokenRef.current({ skipCache: true }).catch((err) => {
          if (__DEV__) {
            console.warn("[useForegroundSessionRefresh] token refresh failed", err);
          }
        });
      },
    );

    return () => sub.remove();
  }, [isConfigured]);
}
