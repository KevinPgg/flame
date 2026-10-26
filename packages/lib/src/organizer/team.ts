/**
 * Organizer "Team" (v2): members of an organization, their roles and, for organizers, the events
 * they're scoped to. Same API as v1 (/api/organizations/[id]/members, …/event-assignments).
 */
import type { OrgMemberRole } from "../types";

export interface TeamMember {
  id: string;
  user_id: string;
  role: OrgMemberRole;
  user_first_name: string | null;
  user_last_name: string | null;
  user_email: string | null;
}

export interface TeamAssignment {
  event_id: string;
  user_id: string | null;
}

/** Roles that can be given from the Team screen (owner is never assignable; viewer unused). */
export const ASSIGNABLE_ROLES = ["admin", "organizer"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, organizer: 2, viewer: 3 };

export function memberName(m: Pick<TeamMember, "user_first_name" | "user_last_name" | "user_email">): string {
  return [m.user_first_name, m.user_last_name].map((x) => x?.trim()).filter(Boolean).join(" ") || m.user_email || "—";
}

export function memberInitials(m: Pick<TeamMember, "user_first_name" | "user_last_name" | "user_email">): string {
  const a = m.user_first_name?.trim().charAt(0) ?? "";
  const b = m.user_last_name?.trim().charAt(0) ?? "";
  return (a || b ? a + b : m.user_email?.charAt(0) ?? "?").toUpperCase();
}

/** Owner first, then admins, organizers; alphabetical inside each role. */
export function sortTeam<T extends TeamMember>(members: T[], locale = "en"): T[] {
  return [...members].sort(
    (a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || memberName(a).localeCompare(memberName(b), locale),
  );
}

/** Events assigned per user (organizers see only those). */
export function assignmentCounts(assignments: TeamAssignment[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const a of assignments) if (a.user_id) out.set(a.user_id, (out.get(a.user_id) ?? 0) + 1);
  return out;
}

export function assignedEventIds(assignments: TeamAssignment[], userId: string): string[] {
  return assignments.filter((a) => a.user_id === userId).map((a) => a.event_id);
}

/** Starting role in "Change role" (legacy viewer/owner fall back to organizer, like v1). */
export function editableRole(role: OrgMemberRole): AssignableRole {
  return role === "admin" || role === "organizer" ? role : "organizer";
}

export interface AssignableEvent {
  id: string;
  name: string;
  starts_at: string | null;
  cohost: boolean;
}

/**
 * Events an organizer can be newly scoped to: the organization's own and the ones it co-hosts
 * (organizer data shape) that **haven't ended yet** — upcoming and running (Kevin, 2026-10-26:
 * past events aren't offered, but someone can still be added during an event) — soonest first,
 * no duplicates. Without an end time the start decides; undated events aren't offered.
 */
type DatedEvent = { id: string; name: string; starts_at?: string | null; ends_at?: string | null };

export function assignableEvents(
  data: {
    events?: DatedEvent[] | null;
    cohost_events?: Array<{ event: DatedEvent }> | null;
  },
  now: Date = new Date(),
): AssignableEvent[] {
  const seen = new Set<string>();
  const out: Array<AssignableEvent & { ends: number }> = [];
  const time = (iso?: string | null) => (iso ? new Date(iso).getTime() : Number.NaN);
  const push = (e: DatedEvent, cohost: boolean) => {
    if (seen.has(e.id)) return;
    seen.add(e.id);
    const ends = time(e.ends_at);
    out.push({ id: e.id, name: e.name, starts_at: e.starts_at ?? null, cohost, ends: Number.isFinite(ends) ? ends : time(e.starts_at) });
  };
  for (const e of data.events ?? []) push(e, false);
  for (const c of data.cohost_events ?? []) push(c.event, true);
  return out
    .filter((e) => e.ends > now.getTime())
    .sort((a, b) => time(a.starts_at) - time(b.starts_at))
    .map(({ ends: _ends, ...e }) => e);
}

/**
 * Event ids to send to PUT event-assignments (which REPLACES the person's whole list): what's
 * checked among the offered events, plus their current assignments that aren't offered anymore
 * (events already over) — hiding past events must not silently remove the access the
 * organizer still needs to those events' sales and guests.
 */
export function assignmentsToSave(selected: Iterable<string>, offered: Array<{ id: string }>, current: string[]): string[] {
  const offeredIds = new Set(offered.map((e) => e.id));
  const picked = new Set(selected);
  const keep = current.filter((id) => !offeredIds.has(id));
  return [...offered.map((e) => e.id).filter((id) => picked.has(id)), ...keep.filter((id, i) => keep.indexOf(id) === i)];
}

/** Whether the member's row offers actions (owners can't be changed or removed from here). */
export const memberHasActions = (m: Pick<TeamMember, "role">) => m.role !== "owner";
