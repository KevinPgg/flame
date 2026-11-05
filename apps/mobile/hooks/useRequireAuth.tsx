/**
 * Redirects unauthenticated users to sign-in. Use in protected screens.
 *
 * Mirrors web's requireAuth pattern: when not signed in, redirect to /sign-in.
 * Uses router.push (not replace) so sign-in is presented OVER the protected
 * screen as a fullScreenModal. This preserves the back stack, letting
 * router.back() dismiss the modal on success. SignInBackButton uses
 * CommonActions.reset to navigate to (tabs) without re-entering the
 * protected → sign-in redirect loop.
 *
 * Web source-of-truth: apps/web/app/lib/auth.ts (requireAuth)
 */

import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useOptionalAuth } from "./useOptionalAuth";
import { useAuthRedirect } from "../contexts/AuthRedirectContext";

/**
 * Grace window before a freshly-`false` isSignedIn is treated as a real
 * sign-out. On app resume Clerk can briefly report `isSignedIn: false` before
 * the SecureStore token rehydrates (W8-M1). We wait this long and probe for a
 * live token before redirecting, so a transient flicker no longer bounces a
 * signed-in user to /sign-in.
 */
const REDIRECT_GRACE_MS = 1200;

/**
 * Re-probe interval while the token probe is failing for NETWORK reasons.
 * The probe (`getToken({ skipCache: true })`) requires a round-trip to Clerk,
 * so offline (airplane mode, dead connectivity mid-flight) it rejects even
 * though the session is perfectly valid server-side. A network failure is
 * therefore INDETERMINATE — we keep the user on the loading gate and re-probe
 * until connectivity returns and Clerk gives a definitive answer, instead of
 * bouncing a signed-in user to /sign-in (the post-W8-M1 offline hole).
 */
const PROBE_RETRY_MS = 8000;

/**
 * True when an error from getToken looks like a transport/connectivity failure
 * rather than a definitive answer from Clerk.
 *
 * Verified against the installed SDK (@clerk/expo 3.1.10 → bundled clerk-js
 * 6.7.0): offline token fetches throw ClerkRuntimeError with
 * code "network_error" (e.g. "Browser is offline, skipping token fetch",
 * "Network request failed while offline"). ClerkRuntimeError EXTENDS
 * ClerkError, so it also carries the `clerkError: true` marker — the runtime
 * check must therefore run BEFORE the generic clerkError check, and the code
 * (not the message, which doesn't always contain "network") is the signal.
 *
 * Everything else clerkError-marked (ClerkAPIResponseError, other runtime
 * codes) is a definitive answer — e.g. a genuinely expired/removed session —
 * and MUST redirect, otherwise a real weekly session expiry would strand the
 * user on an infinite spinner.
 *
 * Raw (unwrapped) fetch failures can still escape Clerk's wrapping when its
 * own offline detection says "online" but the request fails (flaky
 * network/DNS): RN rejects with TypeError("Network request failed"), which the
 * message test below catches. Deliberately NOT `instanceof TypeError` alone —
 * a non-network TypeError (a programming bug) must stay definitive so it
 * redirects instead of re-probing forever.
 */
function isNetworkProbeFailure(err: unknown): boolean {
  if (typeof err === "object" && err !== null) {
    const e = err as {
      clerkRuntimeError?: unknown;
      clerkError?: unknown;
      code?: unknown;
    };
    if (e.clerkRuntimeError === true) {
      return e.code === "network_error";
    }
    if (e.clerkError === true) {
      return false; // Clerk's API answered — definitive.
    }
  }
  if (err instanceof Error) {
    return (
      err.name === "AbortError" ||
      /network|offline|connection|internet/i.test(err.message)
    );
  }
  return false;
}

/**
 * Returns true if the user is authenticated and the screen content can render.
 * When not authenticated, redirects to sign-in and returns false.
 */
export function useRequireAuth(): { isAuthenticated: boolean } {
  const { isSignedIn, isConfigured, getToken, userId } = useOptionalAuth();
  const router = useRouter();
  const { setAuthRedirecting } = useAuthRedirect();

  // Latest getToken kept in a ref so the redirect effect doesn't re-run (and
  // reset its grace timer) on every render just because Clerk hands back a new
  // getToken identity. userId is kept in a ref for the same reason — it's only
  // read inside the probe's catch for a debug log, and shouldn't reset the timer.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  useEffect(() => {
    if (!isConfigured) return; // No Clerk — allow through, hooks will handle
    if (isSignedIn === undefined) return; // Still loading
    if (isSignedIn) {
      setAuthRedirecting(false);
      return;
    }

    // isSignedIn === false. This may be a real sign-out, a transient
    // post-resume flicker before the token rehydrates, or an offline window
    // where Clerk simply can't be reached. Don't redirect immediately: after a
    // short grace period, probe for a live token with { skipCache: true } and
    // classify the outcome three ways:
    //   token returned      → session is fine, stay put.
    //   null / Clerk error  → Clerk answered definitively: real sign-out
    //                         (or expired session) → redirect to /sign-in.
    //   network failure     → INDETERMINATE: keep the loading gate and
    //                         re-probe until connectivity returns. Never
    //                         treat "couldn't reach Clerk" as "signed out".
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const redirectToSignIn = () => {
      // push (not replace) preserves the back stack so the sign-in modal is
      // presented OVER the protected screen, not as the stack root. This lets
      // router.back() / navigateBackOrTabs dismiss the modal normally. Using
      // replace would wipe the stack, making router.dismiss* a no-op in
      // standalone production builds when the modal is the only route.
      router.push("/sign-in");
    };

    const probe = async () => {
      if (cancelled) return;
      try {
        const token = await getTokenRef.current({ skipCache: true });
        if (cancelled) return;
        if (token) return; // Session rehydrated — not actually signed out.
        redirectToSignIn(); // Clerk answered: no session. Real sign-out.
      } catch (err) {
        if (cancelled) return;
        if (isNetworkProbeFailure(err)) {
          // Offline / unreachable — indeterminate. Re-probe; Clerk flipping
          // isSignedIn (either way) re-runs this effect and clears the loop.
          if (__DEV__) {
            console.warn(
              "[useRequireAuth] token probe hit a network failure; treating as indeterminate and re-probing",
              { userId: userIdRef.current, error: err },
            );
          }
          retryTimer = setTimeout(probe, PROBE_RETRY_MS);
          return;
        }
        // Definitive non-network failure (e.g. Clerk API error for an
        // expired/removed session): the sign-out is real. Log in __DEV__
        // (same pattern as useForegroundSessionRefresh) for traceability.
        if (__DEV__) {
          console.warn(
            "[useRequireAuth] token probe failed definitively; redirecting to /sign-in",
            { userId: userIdRef.current, isConfigured, error: err },
          );
        }
        redirectToSignIn();
      }
    };

    const timer = setTimeout(probe, REDIRECT_GRACE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [isSignedIn, isConfigured, router, setAuthRedirecting]);

  // When Clerk not configured, allow through (graceful degradation).
  // When configured and signed in, allow through.
  const isAuthenticated = !isConfigured || Boolean(isSignedIn);

  return { isAuthenticated };
}

/**
 * Wrapper component that shows loading until auth is verified, then either
 * redirects to sign-in or renders children. Use at the top of protected screens.
 */
export function RequireAuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useRequireAuth();

  if (!isAuthenticated) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  return <>{children}</>;
}
