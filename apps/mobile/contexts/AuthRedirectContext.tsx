/**
 * Global auth redirect state that survives navigation from sign-in to home.
 * Sign-in sets this true before navigating (via CommonActions.reset); Home clears it on focus.
 * Prevents stuck spinner when router.replace is synchronous (returns void).
 * Includes a 15s timeout fallback so the overlay never stays permanently if
 * the destination screen never gains focus (e.g. unexpected route, isLoading stuck).
 *
 * @see docs/fixes/MARCH_2026_FIXES.md #374
 */

import React, { createContext, useContext, useState, useRef, useCallback } from "react";

const AUTH_REDIRECT_TIMEOUT_MS = 15000;

interface AuthRedirectContextValue {
  isAuthRedirecting: boolean;
  setAuthRedirecting: (v: boolean) => void;
}

const AuthRedirectCtx = createContext<AuthRedirectContextValue>({
  isAuthRedirecting: false,
  setAuthRedirecting: () => {},
});

export function AuthRedirectProvider({ children }: { children: React.ReactNode }) {
  const [isAuthRedirecting, setAuthRedirectingState] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setAuthRedirecting = useCallback((v: boolean) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setAuthRedirectingState(v);
    if (v) {
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        setAuthRedirectingState(false);
      }, AUTH_REDIRECT_TIMEOUT_MS);
    }
  }, []);

  return (
    <AuthRedirectCtx.Provider value={{ isAuthRedirecting, setAuthRedirecting }}>
      {children}
    </AuthRedirectCtx.Provider>
  );
}

export function useAuthRedirect(): AuthRedirectContextValue {
  return useContext(AuthRedirectCtx);
}
