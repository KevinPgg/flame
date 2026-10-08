import type { OrgMemberRole } from "../types/organization";

export function canManageMembers(role: OrgMemberRole | null): boolean {
  return role === "owner" || role === "admin";
}

export function canCreateEvents(role: OrgMemberRole | null): boolean {
  return role === "owner" || role === "admin";
}

export function canViewAllEvents(role: OrgMemberRole | null): boolean {
  return role === "owner" || role === "admin";
}

/**
 * True if the role can manage RSVPs / check-in for events the user can act on.
 *
 * Owner/admin → can manage RSVPs for ALL org events.
 * Organizer   → can manage RSVPs only for events explicitly assigned to them
 *               (call sites are responsible for filtering by the assignment set).
 * Viewer      → no RSVP management.
 *
 * Use this for gating the RSVPs action tile and the rsvp-management screen
 * access. The per-event scope is enforced downstream via `useAssignedEvents`
 * (mobile) or `?mine=true` on the assignments API (web).
 */
export function canManageAssignedEvents(role: OrgMemberRole | null): boolean {
  return role === "owner" || role === "admin" || role === "organizer";
}

export function canAccessOrgSettings(role: OrgMemberRole | null): boolean {
  return role === "owner" || role === "admin";
}

export function canManagePayouts(role: OrgMemberRole | null): boolean {
  return role === "owner" || role === "admin";
}

export function canManageAccessCodes(role: OrgMemberRole | null): boolean {
  return role === "owner" || role === "admin";
}
