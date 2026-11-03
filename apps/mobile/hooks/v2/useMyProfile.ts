/** GET /api/me/profile (Edit profile, 2026-11-02). `photo_url` null = no photo (or the default image). */
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { useOptionalAuth } from "../useOptionalAuth";

export type MyProfile = {
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  instagram: string | null;
  avatar_color: string | null;
  photo_url: string | null;
};

export const MY_PROFILE_KEY = ["v2", "my-profile"] as const;

export function useMyProfile() {
  const { getToken, isSignedIn } = useOptionalAuth();
  return useQuery<MyProfile>({
    queryKey: MY_PROFILE_KEY,
    queryFn: () => apiGet("/api/me/profile", getToken),
    enabled: isSignedIn === true,
    staleTime: 60_000,
  });
}
