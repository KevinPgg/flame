import { supabaseAdmin } from "./supabase/server";
import { retrySupabaseOperation } from "./utils/supabase-retry";

export type UserRole = "user" | "organizer" | "admin";

export interface UserWithRole {
  id: string;
  email: string;
  clerk_id: string;
  first_name?: string;
  last_name?: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

/**
 * Get user role from Supabase
 */
export async function getUserRole(clerkId: string): Promise<UserRole | null> {
  if (!supabaseAdmin) return null;

  try {
    const { data, error } = await retrySupabaseOperation<{ role: UserRole }>(
      async () =>
        await supabaseAdmin!
          .from("users")
          .select("role")
          .eq("clerk_id", clerkId)
          .maybeSingle()
    );

    if (error) {
      console.error("Error fetching user role:", error);
      return null;
    }

    // If user doesn't exist in database, return null (not a default role)
    if (!data) {
      return null;
    }

    // User exists but role field may be undefined/null, default to "user"
    return data.role || "user";
  } catch (error) {
    console.error("Error in getUserRole:", error);
    return null;
  }
}

/**
 * Get full user data with role
 */
export async function getUserWithRole(
  clerkId: string
): Promise<UserWithRole | null> {
  if (!supabaseAdmin) return null;

  try {
    const { data, error } = await retrySupabaseOperation(
      async () =>
        await supabaseAdmin!
          .from("users")
          .select("*")
          .eq("clerk_id", clerkId)
          .maybeSingle()
    );

    if (error) {
      console.error("Error fetching user with role:", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("Error in getUserWithRole:", error);
    return null;
  }
}

/**
 * Check if user has specific role
 */
export function hasRole(
  userRole: UserRole | null,
  requiredRole: UserRole
): boolean {
  if (!userRole) return false;

  const roleHierarchy: Record<UserRole, number> = {
    user: 1,
    organizer: 2,
    admin: 3,
  };

  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}

/**
 * Check if user is admin
 */
export function isAdmin(userRole: UserRole | null): boolean {
  return hasRole(userRole, "admin");
}

/**
 * Check if user is organizer or higher
 */
export function isOrganizerOrHigher(userRole: UserRole | null): boolean {
  return hasRole(userRole, "organizer");
}

/**
 * Check if user has organization (should be organizer role)
 */
export async function getUserOrganization(clerkId: string) {
  if (!supabaseAdmin) return null;

  try {
    const { data: user } = await retrySupabaseOperation<{ id: string }>(
      async () =>
        await supabaseAdmin!
          .from("users")
          .select("id")
          .eq("clerk_id", clerkId)
          .maybeSingle()
    );

    if (!user) return null;

    // An admin can belong to multiple orgs — .maybeSingle() errors on multiple rows.
    // Use an array query + take the first result deterministically.
    const { data: memberships } = await retrySupabaseOperation<
      { organization: any }[]
    >(
      async () =>
        await supabaseAdmin!
          .from("organization_members")
          .select(
            `
        organization:organizations(*)
      `
          )
          .eq("user_id", user!.id)
          .in("role", ["owner", "admin"])
          .limit(1)
    );

    return memberships?.[0]?.organization || null;
  } catch (error) {
    console.error("Error fetching user organization:", error);
    return null;
  }
}

/**
 * Update user role
 */
export async function updateUserRole(
  clerkId: string,
  role: UserRole
): Promise<boolean> {
  if (!supabaseAdmin) return false;

  try {
    const { error } = await retrySupabaseOperation(
      async () =>
        await supabaseAdmin!
          .from("users")
          .update({
            role,
            updated_at: new Date().toISOString(),
          })
          .eq("clerk_id", clerkId)
    );

    if (error) {
      console.error("Error updating user role:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error in updateUserRole:", error);
    return false;
  }
}
