import type { SupabaseClient } from "@supabase/supabase-js";
import { getEventAccess } from "./event-access";

/**
 * Returns true when the user can manage RSVPs for an event:
 *   - Owner/admin of the event's primary organization, or an organizer of it who is
 *     assigned to the event (getEventAccess — before 2026-10-15 any member passed), OR
 *   - Owner/admin of any organization listed as a cohost on the event in
 *     `event_assignments.cohost_organization_id`.
 *
 * Cohost-side intentionally restricts to owner/admin so cohost orgs don't gain a
 * broader surface than they have elsewhere.
 */
export async function canManageEventRsvps(
  supabase: SupabaseClient,
  supabaseUserId: string,
  eventOrganizationId: string,
  eventId: string,
): Promise<boolean> {
  const primary = await getEventAccess(supabase, supabaseUserId, eventId, eventOrganizationId);
  if (primary.failed) return false;
  if (primary.allowed) return true;
  // Not allowed on the primary side (e.g. an unassigned organizer): they may still be
  // owner/admin of a cohost organization, checked below.

  const { data: cohostAssignments, error: cohostAssignErr } = await supabase
    .from("event_assignments")
    .select("cohost_organization_id")
    .eq("event_id", eventId)
    .not("cohost_organization_id", "is", null);

  if (cohostAssignErr) {
    console.error("[canManageEventRsvps] cohost assignments query failed", {
      supabaseUserId,
      eventId,
      eventOrganizationId,
      error: cohostAssignErr,
    });
    return false;
  }

  const cohostOrgIds = (cohostAssignments ?? [])
    .map(a => a.cohost_organization_id)
    .filter((id): id is string => Boolean(id));

  if (cohostOrgIds.length === 0) return false;

  const { data: cohostMembership, error: cohostMemberErr } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", supabaseUserId)
    .in("organization_id", cohostOrgIds)
    .in("role", ["owner", "admin"])
    .limit(1)
    .maybeSingle();

  if (cohostMemberErr) {
    console.error("[canManageEventRsvps] cohost membership query failed", {
      supabaseUserId,
      eventId,
      eventOrganizationId,
      cohostOrgIds,
      error: cohostMemberErr,
    });
    return false;
  }

  return Boolean(cohostMembership);
}
