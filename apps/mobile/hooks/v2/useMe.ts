/**
 * Signed-in person (name, photo) from Clerk, for the avatar in the organizer top bar. Same
 * optional-Clerk pattern as useOptionalAuth: without EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY (tests,
 * Expo Go) it returns null instead of crashing.
 */
type ClerkUser = {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  imageUrl?: string | null;
  hasImage?: boolean;
  primaryEmailAddress?: { emailAddress?: string } | null;
} | null;

const useUserHook: () => { user?: ClerkUser } = (() => {
  if (!process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY) return () => ({ user: null });
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("@clerk/expo").useUser;
  } catch {
    return () => ({ user: null });
  }
})();

export function useMe(): { name: string; imageUrl: string | null; email: string | null } | null {
  const { user } = useUserHook();
  if (!user) return null;
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || user.primaryEmailAddress?.emailAddress || "";
  return { name, imageUrl: user.hasImage === false ? null : (user.imageUrl ?? null), email: user.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null };
}
