import { supabaseAdmin } from "./supabase/server";
import { updateUserRoleToOrganizer } from "./users";

export async function getUserOrganization(userId: string) {
  try {
    if (!supabaseAdmin) {
      return null;
    }

    // Get the Supabase user first
    const { data: supabaseUser } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("clerk_id", userId)
      .single();

    if (!supabaseUser) {
      return null;
    }

    // Get user's organization membership
    const { data: membership } = await supabaseAdmin
      .from("organization_members")
      .select(
        `
        *,
        organizations (
          id,
          name,
          slug,
          owner_user_id,
          approved,
          created_at
        )
      `
      )
      .eq("user_id", supabaseUser.id)
      .single();

    if (!membership) {
      return null;
    }

    return {
      organization: membership.organizations as any,
      membership,
      supabaseUser,
    };
  } catch (error) {
    console.error("Error getting user organization:", error);
    return null;
  }
}

export async function createOrganization(data: {
  name: string;
  slug: string;
  ownerClerkId: string;
}) {
  try {
    if (!supabaseAdmin) {
      throw new Error("Database not configured");
    }

    // Get the Supabase user
    const { data: supabaseUser } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("clerk_id", data.ownerClerkId)
      .single();

    if (!supabaseUser) {
      throw new Error("User not found in database");
    }

    // Update user role to organizer FIRST - fail early if this doesn't work
    // This prevents creating resources that would need cleanup if role update fails
    try {
      await updateUserRoleToOrganizer(supabaseUser.id);
    } catch (roleError) {
      console.error("Error updating user role to organizer:", roleError);
      throw new Error("Failed to update user role to organizer");
    }

    // Create organization
    const { data: organization, error: orgError } = await supabaseAdmin
      .from("organizations")
      .insert({
        name: data.name,
        slug: data.slug,
        owner_user_id: supabaseUser.id,
      })
      .select()
      .single();

    if (orgError) {
      throw orgError;
    }

    // Create membership
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("organization_members")
      .insert({
        organization_id: organization.id,
        user_id: supabaseUser.id,
        role: "owner",
      })
      .select()
      .single();

    if (membershipError) {
      // Clean up organization if membership creation failed
      await supabaseAdmin
        .from("organizations")
        .delete()
        .eq("id", organization.id);

      throw membershipError;
    }

    return organization;
  } catch (error) {
    console.error("Error creating organization:", error);
    throw error;
  }
}
