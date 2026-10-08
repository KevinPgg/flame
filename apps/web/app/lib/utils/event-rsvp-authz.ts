import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns true when the user can manage RSVPs for an event:
 *   - Any member of the event's primary organization (matches the pre-existing
 *     check across the three RSVP routes), OR
 *   - Owner/admin of any organization listed as a cohost on the event in
 *     `event_assignments.cohost_organization_id`.
 *
 * Cohost-side intentionally restricts to owner/admin (the primary side stays
 * open to any member) so cohost orgs don't gain a broader surface than they
 * have elsewhere.
 */
export async function canManageEventRsvps(
  supabase: SupabaseClient,
  supabaseUserId: string,
  eventOrganizationId: string,
  eventId: string,
): Promise<boolean> {
  const { data: primaryMembership, error: primaryErr } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", supabaseUserId)
    .eq("organization_id", eventOrganizationId)
    .maybeSingle();

  if (primaryErr) {
    console.error("[canManageEventRsvps] primary membership query failed", {
      supabaseUserId,
      eventId,
      eventOrganizationId,
      error: primaryErr,
    });
    return false;
  }

  if (primaryMembership) return true;

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
