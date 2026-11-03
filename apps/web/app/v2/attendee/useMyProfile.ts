"use client";

import { useQuery } from "@tanstack/react-query";
import { useUser } from "@clerk/nextjs";

/** GET /api/me/profile (Edit profile, 2026-11-02). `photo_url` is null for no photo (or the default image). */
export type MyProfile = {
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  instagram: string | null;
  avatar_color: string | null;
  photo_url: string | null;
};

export const MY_PROFILE_KEY = ["me-profile"] as const;

export function useMyProfile() {
  const { isSignedIn, isLoaded } = useUser();
  return useQuery<MyProfile>({
    queryKey: MY_PROFILE_KEY,
    queryFn: async () => {
      const res = await fetch("/api/me/profile", { cache: "no-store" });
      if (!res.ok) throw new Error(`profile ${res.status}`);
      return res.json();
    },
    enabled: isSignedIn && isLoaded,
    staleTime: 60_000,
  });
}
