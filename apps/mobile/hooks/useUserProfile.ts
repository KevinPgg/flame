/**
 * Fetches the current user's profile (read-only).
 *
 * Queries Supabase directly using a Clerk-issued "supabase" JWT.
 * RLS policies scope results to the authenticated user.
 *
 * Profile mutation/editing (cedula, billing) is delegated to the web
 * "Manage Account" flow (apps/web). This hook only reads.
 *
 * Web source-of-truth: apps/web/app/api/user/profile/route.ts
 */

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import type { UserProfile } from "@project-flame/lib";
import { getAuthenticatedClient } from "../lib/supabase-auth";
import { useOptionalAuth } from "./useOptionalAuth";

export type { UserProfile };

const PROFILE_FIELDS =
  "id, email, clerk_id, first_name, last_name, profile_image_url";

const UserProfileSchema = z.object({
  id: z.string(),
  email: z.string(),
  clerk_id: z.string(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  profile_image_url: z.string().nullable().optional(),
});

export function useUserProfile() {
  const { getToken, isSignedIn, isConfigured, userId } = useOptionalAuth();

  const { data, isLoading, error, refetch } = useQuery<UserProfile | null>({
    queryKey: ["user-profile", userId],
    queryFn: async () => {
      try {
        const client = await getAuthenticatedClient(getToken);

        const { data: user, error: fetchError } = await client
          .from("users")
          .select(PROFILE_FIELDS)
          .eq("clerk_id", userId!)
          .maybeSingle();

        if (fetchError) throw fetchError;
        if (!user) return null;

        const parsed = UserProfileSchema.safeParse(user);
        if (!parsed.success) throw new Error("Invalid profile response shape");
        return parsed.data;
      } catch (err) {
        console.error("[useUserProfile] fetchUserProfile failed", {
          userId,
          action: "fetchUserProfile",
          error: err,
        });
        throw new Error("Failed to fetch user profile");
      }
    },
    enabled: Boolean(isSignedIn && isConfigured && userId),
    staleTime: 1000 * 60 * 5,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  });

  return {
    profile: data ?? null,
    isLoading,
    error,
    refetch,
  };
}
