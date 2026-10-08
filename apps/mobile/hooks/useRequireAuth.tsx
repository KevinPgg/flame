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

    // isSignedIn === false. This may be a real sign-out, or a transient
    // post-resume flicker before the token rehydrates. Don't redirect
    // immediately: after a short grace period, probe for a live token with
    // { skipCache: true }. If one comes back the session is fine (Clerk just
    // hadn't caught up) and we stay put; otherwise the sign-out is real.
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      try {
        const token = await getTokenRef.current({ skipCache: true });
        if (cancelled) return;
        if (token) return; // Session rehydrated — not actually signed out.
      } catch (err) {
        // Fall through to redirect — treat probe failure as unauthenticated.
        // Log in __DEV__ (same pattern as useForegroundSessionRefresh) so a
        // signed-in user bounced to /sign-in on a probe failure is traceable.
        if (__DEV__) {
          console.warn(
            "[useRequireAuth] token probe failed; treating as signed-out and redirecting to /sign-in",
            { userId: userIdRef.current, isConfigured, error: err },
          );
        }
      }
      if (cancelled) return;
      // push (not replace) preserves the back stack so the sign-in modal is
      // presented OVER the protected screen, not as the stack root. This lets
      // router.back() / navigateBackOrTabs dismiss the modal normally. Using
      // replace would wipe the stack, making router.dismiss* a no-op in
      // standalone production builds when the modal is the only route.
      router.push("/sign-in");
    }, REDIRECT_GRACE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
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
