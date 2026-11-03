/**
 * Clerk's user object in the app (2026-11-02, AccountSecurity): password, e-mails, connected
 * accounts and devices are changed with the Clerk SDK directly — no browser, no accounts.dev.
 * Same lazy require as useOptionalAuth so the app (and tests) run without Clerk configured.
 */
/** The part of Clerk's UserResource this app uses (kept local: @clerk/shared isn't a direct dependency). */
export type ClerkEmail = {
  id: string;
  emailAddress: string;
  verification?: { status?: string | null } | null;
  prepareVerification: (p: { strategy: "email_code" }) => Promise<unknown>;
  attemptVerification: (p: { code: string }) => Promise<ClerkEmail>;
  destroy: () => Promise<void>;
};
export type ClerkSession = {
  id: string;
  lastActiveAt: Date;
  latestActivity?: { browserName?: string; deviceType?: string; city?: string; country?: string; isMobile?: boolean } | null;
  revoke: () => Promise<unknown>;
};
export type UserResource = {
  id: string;
  passwordEnabled: boolean;
  primaryEmailAddressId: string | null;
  emailAddresses: ClerkEmail[];
  externalAccounts: Array<{ id: string; provider: string; emailAddress: string }>;
  updatePassword: (p: { newPassword: string; currentPassword?: string; signOutOfOtherSessions?: boolean }) => Promise<unknown>;
  createEmailAddress: (p: { email: string }) => Promise<ClerkEmail>;
  update: (p: { primaryEmailAddressId?: string }) => Promise<unknown>;
  getSessions: () => Promise<ClerkSession[]>;
  reload: () => Promise<unknown>;
};

type UseUser = () => { isLoaded: boolean; isSignedIn?: boolean; user: UserResource | null | undefined };
type UseAuthSession = () => { sessionId?: string | null };

const fallback: UseUser = () => ({ isLoaded: true, isSignedIn: false, user: null });

const useUserImpl: UseUser = (() => {
  if (!process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY) return fallback;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return (require("@clerk/expo") as { useUser: UseUser }).useUser;
  } catch {
    return fallback;
  }
})();

const useSessionIdImpl: UseAuthSession = (() => {
  if (!process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY) return () => ({ sessionId: null });
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return (require("@clerk/expo") as { useAuth: UseAuthSession }).useAuth;
  } catch {
    return () => ({ sessionId: null });
  }
})();

export function useClerkUser() {
  return useUserImpl();
}

/** The id of this device's session (to mark "This device" and not revoke it). */
export function useCurrentSessionId(): string | null {
  return useSessionIdImpl().sessionId ?? null;
}

/** Clerk errors carry `errors[0].longMessage` (English); anything else → null (caller shows its own text). */
export function clerkErrorMessage(e: unknown): string | null {
  const first = (e as { errors?: Array<{ longMessage?: string; message?: string }> })?.errors?.[0];
  return first?.longMessage || first?.message || null;
}

/** Clerk error code (e.g. "form_password_incorrect", "form_code_incorrect", "session_reverification_required"). */
export function clerkErrorCode(e: unknown): string | null {
  return (e as { errors?: Array<{ code?: string }> })?.errors?.[0]?.code ?? null;
}
