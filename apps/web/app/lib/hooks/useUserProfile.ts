"use client";

import { useQuery } from "@tanstack/react-query";
import { useUser } from "@clerk/nextjs";

export interface UserProfile {
  id: string;
  email: string;
  clerk_id: string;
  first_name: string | null;
  last_name: string | null;
  profile_image_url?: string | null;
}

export function useUserProfile() {
  const { isSignedIn, isLoaded } = useUser();

  const { data, isLoading, error, refetch } = useQuery<UserProfile | null>({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const response = await fetch("/api/user/profile");
      if (!response.ok) {
        if (response.status === 404) {
          // User not found in Supabase yet (still syncing from Clerk webhook)
          return null;
        }
        throw new Error("Failed to fetch user profile");
      }
      return response.json();
    },
    enabled: isSignedIn && isLoaded,
    staleTime: 1000 * 60 * 5, // 5 minutes
    // Retry 3 times with delays for new users (webhook sync delay)
    retry: 3,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 5000), // 1s, 2s, 4s
  });

  return {
    profile: data,
    isLoading,
    error,
    refetch,
  };
}
