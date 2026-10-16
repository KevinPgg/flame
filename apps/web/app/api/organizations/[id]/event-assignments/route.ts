import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { OrgMemberRole } from "@project-flame/lib";
import { supabaseAdmin } from "../../../../lib/supabase/server";

async function requireOrgMember(orgId: string, clerkUserId: string) {
  if (!supabaseAdmin) return { error: "Database not configured", status: 500 } as const;

  const { data: callerUser } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("clerk_id", clerkUserId)
    .single();
  if (!callerUser) return { error: "User not found", status: 404 } as const;

  const { data: membership } = await supabaseAdmin
    .from("organization_members")
    .select("role")
    .eq("user_id", callerUser.id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!membership) return { error: "Forbidden", status: 403 } as const;
  return {
    callerUserId: callerUser.id,
    role: membership.role as OrgMemberRole,
  } as const;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: orgId } = await params;
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const gate = await requireOrgMember(orgId, userId);
    if ("error" in gate) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    // `?mine=true` scopes the response to the caller's own assignments,
    // suitable for organizer-role members who can only see events explicitly
    // assigned to them. Without it, all org assignments are returned (admin
    // surfaces like the Team page use the unscoped form).
    const mineOnly = req.nextUrl.searchParams.get("mine") === "true";

    let query = supabaseAdmin
      .from("event_assignments")
      .select("id, event_id, user_id, organization_id")
      .eq("organization_id", orgId);

    if (mineOnly) {
      query = query.eq("user_id", gate.callerUserId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[GET event-assignments] error", { orgId, mineOnly, error });
      return NextResponse.json(
        { error: "Failed to fetch assignments" },
        { status: 500 },
      );
    }

    return NextResponse.json({ assignments: data ?? [] });
  } catch (err) {
    console.error("[GET event-assignments] unexpected", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const putSchema = z.object({
  userId: z.string().uuid(),
  eventIds: z.array(z.string().uuid()),
});

// Replaces the full set of event assignments for a single user in this org.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: orgId } = await params;
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const gate = await requireOrgMember(orgId, clerkUserId);
    if ("error" in gate) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    if (gate.role !== "owner" && gate.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Malformed JSON body" },
        { status: 400 },
      );
    }
    const { userId: targetUserId, eventIds } = putSchema.parse(body);

    // Only members of this organization can be scoped, and only to events this organization
    // owns or co-hosts. Before, any user id / any event id was accepted.
    const { data: targetMember, error: targetError } = await supabaseAdmin
      .from("organization_members")
      .select("role")
      .eq("organization_id", orgId)
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (targetError) {
      console.error("[PUT event-assignments] member lookup error", targetError);
      return NextResponse.json({ error: "Failed to validate member" }, { status: 500 });
    }
    if (!targetMember) {
      return NextResponse.json({ error: "User is not a member of this organization" }, { status: 400 });
    }

    const uniqueEventIds = Array.from(new Set(eventIds));
    if (uniqueEventIds.length > 0) {
      const [owned, cohosted] = await Promise.all([
        supabaseAdmin.from("events").select("id").eq("organization_id", orgId).in("id", uniqueEventIds),
        supabaseAdmin
          .from("event_assignments")
          .select("event_id")
          .eq("cohost_organization_id", orgId)
          .in("event_id", uniqueEventIds),
      ]);
      if (owned.error || cohosted.error) {
        console.error("[PUT event-assignments] event lookup error", owned.error ?? cohosted.error);
        return NextResponse.json({ error: "Failed to validate events" }, { status: 500 });
      }
      const allowed = new Set<string>([
        ...(owned.data ?? []).map((e: { id: string }) => e.id),
        ...(cohosted.data ?? []).map((e: { event_id: string }) => e.event_id),
      ]);
      if (uniqueEventIds.some((id) => !allowed.has(id))) {
        return NextResponse.json({ error: "Some events don't belong to this organization" }, { status: 400 });
      }
    }

    // Clear existing assignments for this user in this org, then insert the new set.
    const { error: deleteError } = await supabaseAdmin
      .from("event_assignments")
      .delete()
      .eq("organization_id", orgId)
      .eq("user_id", targetUserId);

    if (deleteError) {
      console.error("[PUT event-assignments] delete error", deleteError);
      return NextResponse.json(
        { error: "Failed to clear existing assignments" },
        { status: 500 },
      );
    }

    if (uniqueEventIds.length > 0) {
      const rows = uniqueEventIds.map(eventId => ({
        organization_id: orgId,
        user_id: targetUserId,
        event_id: eventId,
        assigned_by: gate.callerUserId,
      }));

      const { error: insertError } = await supabaseAdmin
        .from("event_assignments")
        .insert(rows);

      if (insertError) {
        console.error("[PUT event-assignments] insert error", insertError);
        return NextResponse.json(
          { error: "Failed to insert assignments" },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    console.error("[PUT event-assignments] unexpected", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
