import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { getEventAccess } from "@/app/lib/utils/event-access";
import type { OrgMemberRole } from "@project-flame/lib";

export type EventToolGate =
  | { res: NextResponse }
  | { res?: undefined; callerId: string; role: OrgMemberRole | null; event: { id: string; organization_id: string } };

/**
 * Guard for per-event organizer tools (scanners, access code…): signed in, known user, existing
 * event, and owner/admin of its organization or an organizer assigned to it (requireEventAccess).
 */
export async function eventToolGate(eventId: string): Promise<EventToolGate> {
  const { userId } = await auth();
  if (!userId) return { res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!supabaseAdmin) return { res: NextResponse.json({ error: "Database not configured" }, { status: 500 }) };

  const { data: caller, error: callerError } = await supabaseAdmin.from("users").select("id").eq("clerk_id", userId).maybeSingle();
  if (callerError) return { res: NextResponse.json({ error: "Failed to verify permissions" }, { status: 500 }) };
  if (!caller) return { res: NextResponse.json({ error: "User not found" }, { status: 404 }) };

  const { data: event, error: eventError } = await supabaseAdmin
    .from("events")
    .select("id, organization_id")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) return { res: NextResponse.json({ error: "Failed to load event" }, { status: 500 }) };
  if (!event) return { res: NextResponse.json({ error: "Event not found" }, { status: 404 }) };

  const access = await getEventAccess(supabaseAdmin, caller.id, event.id, event.organization_id);
  if (access.failed) return { res: NextResponse.json({ error: "Failed to verify permissions" }, { status: 500 }) };
  if (!access.allowed) return { res: NextResponse.json({ error: "You don't have access to this event" }, { status: 403 }) };
  return { callerId: caller.id as string, role: access.role, event: event as { id: string; organization_id: string } };
}
