/**
 * Optional Clerk auth hook.
 *
 * Resolves useAuth from @clerk/expo when EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
 * is set; otherwise returns a stable fallback. Ensures Rules of Hooks compliance
 * by always calling the same hook reference unconditionally.
 */

type GetTokenOptions = {
  template?: string;
  skipCache?: boolean;
  leewayInSeconds?: number;
  organizationId?: string;
  throwOnError?: boolean;
};

type AuthHookResult = {
  getToken: (options?: GetTokenOptions) => Promise<string | null>;
  isSignedIn: boolean | undefined;
  userId?: string | null;
  signOut?: (options?: { redirectUrl?: string }) => Promise<void>;
};

type AuthHook = () => AuthHookResult;

const useAuth: AuthHook = (() => {
  if (!process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return useFallbackAuth;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const clerk = require("@clerk/expo");
    return clerk.useAuth as AuthHook;
  } catch {
    return useFallbackAuth;
  }
})();

const FALLBACK_AUTH = {
  getToken: async (_options?: GetTokenOptions) => null as string | null,
  isSignedIn: false as boolean | undefined,
  userId: null as string | null,
  isConfigured: false,
  signOut: async () => {},
} as const;

function useFallbackAuth(): AuthHookResult {
  return FALLBACK_AUTH;
}

/** Result augmented with isConfigured for consumers that need to know if Clerk is active */
export type AuthResult = {
  getToken: (options?: GetTokenOptions) => Promise<string | null>;
  isSignedIn: boolean | undefined;
  userId: string | null | undefined;
  isConfigured?: boolean;
  signOut: (options?: { redirectUrl?: string }) => Promise<void>;
};

/**
 * Returns auth state from Clerk when configured, or a no-op fallback.
 * Use isConfigured to detect when Clerk is not available (e.g., show config error).
 */
export function useOptionalAuth(): AuthResult {
  const result = useAuth();
  // FALLBACK_AUTH explicitly sets isConfigured: false when Clerk is not configured.
  // Real Clerk's useAuth omits isConfigured, so we default to true (configured) when absent.
  const isConfigured =
    "isConfigured" in result && typeof result.isConfigured === "boolean"
      ? result.isConfigured
      : true;
  const raw = result as { userId?: string | null; signOut?: (options?: unknown) => Promise<void> };
  const userId = typeof raw.userId === "string" ? raw.userId : null;
  const signOut = typeof raw.signOut === "function" ? raw.signOut : FALLBACK_AUTH.signOut;
  return { ...result, userId, isConfigured, signOut };
}
