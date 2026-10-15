import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canActOnEvent, type OrgMemberRole } from "@project-flame/lib";

/**
 * Event-level authorization for organizer API routes (web and the mobile app call the same routes).
 *
 * Rule (packages/lib canActOnEvent): owner/admin of the event's organization → any of its events;
 * organizer → only events assigned to them in `event_assignments` by that same organization;
 * viewer / non-member → denied.
 *
 * Before 2026-10-15 these routes only checked "is a member of the organization", so an organizer
 * could act on events they were never assigned to by calling the API directly.
 */
export interface EventAccess {
  allowed: boolean;
  role: OrgMemberRole | null;
  /** A database query failed: answer 500, never "allowed". */
  failed?: boolean;
}

export async function getEventAccess(
  db: SupabaseClient,
  userId: string,
  eventId: string,
  organizationId: string
): Promise<EventAccess> {
  const { data: membership, error } = await db
    .from("organization_members")
    .select("role")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) {
    console.error("[event-access] membership query failed", { userId, eventId, organizationId, error });
    return { allowed: false, role: null, failed: true };
  }
  const role = ((membership as { role?: string } | null)?.role ?? null) as OrgMemberRole | null;
  if (role !== "organizer") return { allowed: canActOnEvent(role, false), role };

  const { data: assignment, error: assignmentError } = await db
    .from("event_assignments")
    .select("id")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .limit(1)
    .maybeSingle();
  if (assignmentError) {
    console.error("[event-access] assignment query failed", { userId, eventId, organizationId, error: assignmentError });
    return { allowed: false, role, failed: true };
  }
  return { allowed: canActOnEvent(role, Boolean(assignment)), role };
}

/** For route handlers: `const denied = await requireEventAccess(...); if (denied) return denied;` */
export async function requireEventAccess(
  db: SupabaseClient,
  userId: string,
  eventId: string,
  organizationId: string
): Promise<NextResponse | null> {
  const access = await getEventAccess(db, userId, eventId, organizationId);
  if (access.failed) return NextResponse.json({ error: "Failed to verify permissions" }, { status: 500 });
  if (!access.allowed) return NextResponse.json({ error: "You don't have access to this event" }, { status: 403 });
  return null;
}

/**
 * Event ids a member may see in the organizer dashboard data. `null` = all events (owner/admin).
 * Organizer → their assignments in this organization. Anyone else → none.
 */
export async function visibleEventIds(
  db: SupabaseClient,
  userId: string,
  organizationId: string,
  role: OrgMemberRole | string | null
): Promise<Set<string> | null> {
  if (role === "owner" || role === "admin") return null;
  if (role !== "organizer") return new Set();
  const { data, error } = await db
    .from("event_assignments")
    .select("event_id")
    .eq("user_id", userId)
    .eq("organization_id", organizationId);
  if (error) throw new Error("Failed to load event assignments");
  return new Set(((data ?? []) as Array<{ event_id: string }>).map((a) => a.event_id));
}
