import { useQuery } from "@tanstack/react-query";
import { useUser } from "@clerk/nextjs";
import type { OrgMemberRole } from "@project-flame/lib";

export interface UserOrganization {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string;
  approved: boolean;
  logo_url: string | null;
  role: OrgMemberRole;
  eventCount: number;
}

interface UserOrganizationsResponse {
  // null = supabase user not yet synced from clerk webhook
  hasOrganization: boolean | null;
  organizations: UserOrganization[];
}

export function useUserOrganizations() {
  const { isSignedIn, isLoaded } = useUser();

  return useQuery<UserOrganizationsResponse>({
    queryKey: ["organizations"],
    queryFn: async () => {
      const response = await fetch("/api/organizations");
      if (!response.ok) {
        throw new Error("Failed to fetch organizations");
      }
      return response.json();
    },
    enabled: isSignedIn && isLoaded,
  });
}

export function useHasOrganization() {
  const { data, isLoading, error } = useUserOrganizations();

  return {
    hasOrganization: data?.hasOrganization ?? null,
    organizations: data?.organizations ?? [],
    isLoading,
    error,
  };
}
