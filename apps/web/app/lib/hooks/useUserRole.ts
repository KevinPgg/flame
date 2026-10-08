import { useQuery } from "@tanstack/react-query";
import { useUser } from "@clerk/nextjs";

// Types for user role data
interface UserRoleData {
  role: "user" | "organizer" | "admin";
  hasOrganization: boolean;
  organization?: {
    id: string;
    name: string;
    slug: string;
    approved?: boolean;
    created_at?: string;
  };
}

// Hook for fetching user role and organization status
export function useUserRole() {
  const { isSignedIn, isLoaded, user } = useUser();

  return useQuery<UserRoleData>({
    queryKey: ["user-role", user?.id],
    queryFn: async () => {
      const response = await fetch("/api/user/role");

      if (!response.ok) {
        throw new Error("Failed to fetch user role");
      }

      return response.json();
    },
    enabled: isLoaded && isSignedIn && !!user?.id, // Only run query if Clerk is fully loaded AND user is signed in
    staleTime: 5 * 60 * 1000, // 5 minutes - user roles don't change often
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: false, // Don't retry if user is not authenticated
  });
}

// Convenience hook to check if user is admin
export function useIsAdmin() {
  const { data, isLoading, error } = useUserRole();

  return {
    isAdmin: data?.role === "admin",
    isLoading,
    error,
  };
}

// Convenience hook to check if user has organization
export function useHasOrganization() {
  const { data, isLoading, error } = useUserRole();

  return {
    hasOrganization: data?.hasOrganization || false,
    organization: data?.organization,
    isLoading,
    error,
  };
}

// Export types for use in components
export type { UserRoleData };
