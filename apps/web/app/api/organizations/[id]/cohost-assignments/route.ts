import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { OrgMemberRole } from "@project-flame/lib";
import { supabaseAdmin } from "../../../../lib/supabase/server";

/**
 * Cohost-org assignments for an event.
 *
 *   GET    ?event_id=<uuid>  → list current cohost orgs for that event
 *   GET    ?search=<text>[&event_id=<uuid>] → approved orgs to add as co-host (owner/admin):
 *          name contains <text>, excluding this org and the event's current co-hosts. Used by
 *          the app (fase 1b), which only talks to the web API; the web v1/v2 modal reads the same
 *          data with the anon Supabase client.
 *   POST   { eventId, cohostOrgId } → add cohost (owner/admin only)
 *   DELETE ?id=<assignmentId> → remove (owner/admin only)
 *
 * Mirrors mobile useEventAssignments (assignCohostOrg / removeAssignment).
 * RLS already enforces owner/admin INSERT/DELETE on event_assignments, but we
 * also gate at the route layer for consistency with the rest of the web API.
 */
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

    const eventId = req.nextUrl.searchParams.get("event_id");
    const search = req.nextUrl.searchParams.get("search");

    if (search !== null) {
      if (gate.role !== "owner" && gate.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      // PostgREST pattern / filter syntax characters out; at most 50 chars.
      const term = search.replace(/[%_,()\\*]/g, " ").trim().slice(0, 50);
      if (!term) return NextResponse.json({ organizations: [] });

      const exclude = new Set<string>([orgId]);
      if (eventId) {
        const { data: current, error: currentError } = await supabaseAdmin
          .from("event_assignments")
          .select("cohost_organization_id")
          .eq("organization_id", orgId)
          .eq("event_id", eventId)
          .not("cohost_organization_id", "is", null);
        if (currentError) {
          console.error("[GET cohost-assignments search] current", { orgId, eventId, currentError });
          return NextResponse.json({ error: "Failed to search organizations" }, { status: 500 });
        }
        for (const r of current ?? []) exclude.add(r.cohost_organization_id as string);
      }

      const { data: orgs, error: searchError } = await supabaseAdmin
        .from("organizations")
        .select("id, name, slug, logo_url, city")
        .eq("approved", true)
        .ilike("name", `%${term}%`)
        .order("name", { ascending: true })
        .limit(20 + exclude.size);
      if (searchError) {
        console.error("[GET cohost-assignments search] error", { orgId, searchError });
        return NextResponse.json({ error: "Failed to search organizations" }, { status: 500 });
      }
      return NextResponse.json({ organizations: (orgs ?? []).filter((o) => !exclude.has(o.id)).slice(0, 20) });
    }

    let query = supabaseAdmin
      .from("event_assignments")
      .select(
        "id, event_id, cohost_organization_id, cohost_org:cohost_organization_id (id, name, slug, logo_url)",
      )
      .eq("organization_id", orgId)
      .not("cohost_organization_id", "is", null);

    if (eventId) {
      query = query.eq("event_id", eventId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[GET cohost-assignments] error", { orgId, eventId, error });
      return NextResponse.json(
        { error: "Failed to fetch cohost assignments" },
        { status: 500 },
      );
    }

    return NextResponse.json({ assignments: data ?? [] });
  } catch (err) {
    console.error("[GET cohost-assignments] unexpected", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const postSchema = z.object({
  eventId: z.string().uuid(),
  cohostOrgId: z.string().uuid(),
});

export async function POST(
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
      return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
    }
    const { eventId, cohostOrgId } = postSchema.parse(body);

    if (cohostOrgId === orgId) {
      return NextResponse.json(
        { error: "Cannot assign your own organization as a cohost" },
        { status: 400 },
      );
    }

    // Verify the event belongs to this org (prevents cross-org cohost injection).
    const { data: ev } = await supabaseAdmin
      .from("events")
      .select("id, organization_id")
      .eq("id", eventId)
      .maybeSingle();

    if (!ev || ev.organization_id !== orgId) {
      return NextResponse.json(
        { error: "Event not found in this organization" },
        { status: 404 },
      );
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("event_assignments")
      .insert({
        event_id: eventId,
        organization_id: orgId,
        cohost_organization_id: cohostOrgId,
        assigned_by: gate.callerUserId,
      })
      .select("id")
      .single();

    if (insertError) {
      // 23505 = unique violation (already assigned)
      if ((insertError as { code?: string }).code === "23505") {
        return NextResponse.json(
          { error: "This organization is already a cohost for this event" },
          { status: 409 },
        );
      }
      console.error("[POST cohost-assignments] insert error", insertError);
      return NextResponse.json(
        { error: "Failed to add cohost" },
        { status: 500 },
      );
    }

    return NextResponse.json({ id: inserted.id }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    console.error("[POST cohost-assignments] unexpected", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
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

    const assignmentId = req.nextUrl.searchParams.get("id");
    if (!assignmentId) {
      return NextResponse.json(
        { error: "Missing assignment id" },
        { status: 400 },
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from("event_assignments")
      .delete()
      .eq("id", assignmentId)
      .eq("organization_id", orgId)
      .not("cohost_organization_id", "is", null);

    if (deleteError) {
      console.error("[DELETE cohost-assignments] error", deleteError);
      return NextResponse.json(
        { error: "Failed to remove cohost" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE cohost-assignments] unexpected", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
