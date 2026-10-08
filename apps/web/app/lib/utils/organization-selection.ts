import { supabaseAdmin } from "../supabase/server";
import { retrySupabaseOperation } from "./supabase-retry";
import { resolveDbUserFromClerkId } from "../auth";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  approved: boolean;
  created_at: string;
  owner_user_id?: string;
  logo_url?: string | null;
}

export interface OrganizationMembership {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  created_at: string;
  updated_at: string;
  organizations: Organization | null;
}

export interface OrganizationSelectionResult {
  organization: Organization;
  allOrganizations: Array<{
    id: string;
    name: string;
    slug: string;
    approved: boolean;
    created_at: string;
    role: string;
    logo_url?: string | null;
  }>;
  approvedMemberships: OrganizationMembership[];
}

/**
 * Fetches and selects an organization for a user based on the provided slug.
 * Returns the selected organization and all approved organizations the user belongs to.
 *
 * @param clerkId - The Clerk user ID
 * @param selectedOrgSlug - Optional organization slug to select. If not provided or invalid, defaults to first approved organization.
 * @returns OrganizationSelectionResult with the selected organization and all organizations
 * @throws Error if user not found, no organizations, or no approved organizations
 */
export async function selectOrganization(
  clerkId: string,
  selectedOrgSlug?: string | null
): Promise<OrganizationSelectionResult> {
  if (!supabaseAdmin) {
    throw new Error("Database not configured");
  }

  // Get the user's Supabase record (using centralized helper with retry and JIT sync)
  let supabaseUser;
  try {
    supabaseUser = await resolveDbUserFromClerkId(clerkId);
  } catch (error: any) {
    if (error.message === "User not found") {
      throw new Error("User not found in database");
    }
    console.error(`Error fetching user for clerk_id ${clerkId}:`, error);
    throw new Error("Failed to fetch user from database");
  }

  // Fetch all organizations the user belongs to
  const { data: memberships, error: membershipsError } =
    await retrySupabaseOperation(async () =>
      await supabaseAdmin!
        .from("organization_members")
        .select(
          `*, organizations (id, name, slug, approved, created_at, owner_user_id, logo_url)`
        )
        .eq("user_id", supabaseUser.id)
    );

  if (membershipsError) {
    console.error(
      `Error fetching memberships for user_id ${supabaseUser.id}:`,
      membershipsError
    );
    throw new Error("Failed to fetch organization memberships");
  }

  if (!memberships || memberships.length === 0) {
    throw new Error("No organization found");
  }

  // Filter to only approved organizations with non-null organizations field
  const approvedMemberships = memberships.filter(
    (m: OrganizationMembership) =>
      m.organizations != null && m.organizations.approved === true
  ) as Array<OrganizationMembership & { organizations: Organization }>;

  if (approvedMemberships.length === 0) {
    throw new Error("No approved organization found");
  }

  // Find the selected organization or default to first
  let selectedMembership = approvedMemberships[0];
  if (selectedOrgSlug) {
    const found = approvedMemberships.find(
      m => m.organizations.slug === selectedOrgSlug
    );
    if (found) {
      selectedMembership = found;
    }
  }

  const organization = selectedMembership.organizations;

  // Map all organizations for easy access (organizations is guaranteed non-null after filter)
  const allOrganizations = approvedMemberships.map(m => ({
    id: m.organizations.id,
    name: m.organizations.name,
    slug: m.organizations.slug,
    approved: m.organizations.approved,
    created_at: m.organizations.created_at,
    role: m.role,
    logo_url: m.organizations.logo_url ?? null,
  }));

  return {
    organization,
    allOrganizations,
    approvedMemberships,
  };
}
