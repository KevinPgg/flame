import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../lib/supabase/server";
import { updateUserRoleToOrganizer } from "../../lib/users";
import { z } from "zod";

const createOrganizationSchema = z.object({
  name: z.string().min(1, "Organization name is required").max(100),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(50)
    .regex(
      /^[a-z0-9-]+$/,
      "Slug can only contain lowercase letters, numbers, and hyphens"
    ),
});

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 }
      );
    }

    // Get the Supabase user
    const { data: supabaseUser } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("clerk_id", userId)
      .single();

    if (!supabaseUser) {
      // User not synced yet - return null to indicate loading state
      return NextResponse.json({ hasOrganization: null, organizations: [] });
    }

    // Get user's organization memberships with org details and event count
    const { data: memberships } = await supabaseAdmin
      .from("organization_members")
      .select(
        `
        role,
        organizations (
          id,
          name,
          slug,
          owner_user_id,
          approved,
          rejected_at,
          logo_url,
          events(count)
        )
      `
      )
      .eq("user_id", supabaseUser.id)
      .order("created_at", { ascending: true });

    type OrgRow = {
      id: string;
      name: string;
      slug: string;
      owner_user_id: string;
      approved: boolean | null;
      rejected_at: string | null;
      logo_url: string | null;
      events?: Array<{ count: number }>;
    };

    const organizations = (memberships ?? [])
      .map(m => {
        const raw = m.organizations as unknown;
        const org = (Array.isArray(raw) ? raw[0] : raw) as OrgRow | null;
        // Hide rejected orgs from the owner's "My Organizers" list — a rejected
        // org should disappear, not linger as "Pending approval" (W7-H1 QA).
        if (!org || org.rejected_at) return null;
        const rawCount = Array.isArray(org.events) ? org.events[0]?.count : undefined;
        const eventCount = typeof rawCount === "number" ? rawCount : 0;
        return {
          id: org.id,
          name: org.name,
          slug: org.slug,
          owner_user_id: org.owner_user_id,
          approved: Boolean(org.approved),
          logo_url: org.logo_url ?? null,
          role: m.role as string,
          eventCount,
        };
      })
      .filter((o): o is NonNullable<typeof o> => o !== null);

    // Count cohosted events per org so the profile "N events" pill matches the
    // dashboard listing (which merges owned + cohosted). One query for all the
    // user's orgs, grouped client-side.
    if (organizations.length > 0) {
      const orgIds = organizations.map(o => o.id);
      const { data: cohostRows } = await supabaseAdmin
        .from("event_assignments")
        .select("cohost_organization_id")
        .in("cohost_organization_id", orgIds)
        .not("cohost_organization_id", "is", null);

      const cohostCountByOrg = new Map<string, number>();
      for (const row of (cohostRows ?? []) as Array<{ cohost_organization_id: string }>) {
        const id = row.cohost_organization_id;
        cohostCountByOrg.set(id, (cohostCountByOrg.get(id) ?? 0) + 1);
      }

      for (const o of organizations) {
        o.eventCount += cohostCountByOrg.get(o.id) ?? 0;
      }
    }

    return NextResponse.json({
      hasOrganization: organizations.length > 0,
      organizations,
    });
  } catch (error) {
    console.error("Error fetching user organizations:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clerkUser = await currentUser();
    if (!clerkUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 }
      );
    }

    // Get the Supabase user
    const { data: supabaseUser } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("clerk_id", userId)
      .single();

    if (!supabaseUser) {
      return NextResponse.json(
        { error: "User not found in database" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const validatedData = createOrganizationSchema.parse(body);

    // Check if slug is already taken
    const { data: existingOrg } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .eq("slug", validatedData.slug)
      .single();

    if (existingOrg) {
      return NextResponse.json(
        { error: "This URL slug is already taken" },
        { status: 400 }
      );
    }

    // Update user role to organizer FIRST - fail early if this doesn't work
    // This prevents creating resources that would need cleanup if role update fails
    try {
      await updateUserRoleToOrganizer(supabaseUser.id);
    } catch (roleError) {
      console.error("Error updating user role to organizer:", roleError);
      return NextResponse.json(
        { error: "Failed to update user role to organizer" },
        { status: 500 }
      );
    }

    // Create organization
    const { data: organization, error: orgError } = await supabaseAdmin
      .from("organizations")
      .insert({
        name: validatedData.name,
        slug: validatedData.slug,
        owner_user_id: supabaseUser.id,
      })
      .select()
      .single();

    if (orgError) {
      console.error("Error creating organization:", orgError);
      return NextResponse.json(
        { error: "Failed to create organization" },
        { status: 500 }
      );
    }

    // Create membership (user becomes owner)
    const { error: membershipError } = await supabaseAdmin
      .from("organization_members")
      .insert({
        organization_id: organization.id,
        user_id: supabaseUser.id,
        role: "owner",
      });

    if (membershipError) {
      console.error("Error creating membership:", membershipError);
      // Try to clean up the organization if membership creation failed
      await supabaseAdmin
        .from("organizations")
        .delete()
        .eq("id", organization.id);

      return NextResponse.json(
        { error: "Failed to create organization membership" },
        { status: 500 }
      );
    }

    console.log("✅ Organization created successfully:", organization);

    return NextResponse.json({
      success: true,
      organization,
      message: "Organization created successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }

    console.error("Error in organization creation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
