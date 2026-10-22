/**
 * Types of the web API responses the v2 organizer screens read (fase 1b: the app talks to the
 * same endpoints as the web v2, never to Supabase directly).
 */
import type { OrgMemberRole } from "@project-flame/lib";
import type { EnrichedOrgEvent } from "../../hooks/useOrgEventEnriched";

/** GET /api/organizations — the signed-in person's memberships (rejected ones already removed). */
export interface MyOrganization {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string;
  approved: boolean;
  logo_url: string | null;
  role: OrgMemberRole;
  eventCount: number;
}

export interface MyOrganizationsResponse {
  hasOrganization: boolean | null;
  organizations: MyOrganization[];
}

/**
 * Event as /api/organizer/data returns it. The v1 type (EnrichedOrgEvent, validated by zod in v1
 * hooks) leaves out fields v2 needs; v2 reads the raw response, so they are there.
 */
export type OrgEventTierV2 = EnrichedOrgEvent["ticket_tiers"][number] & {
  quantity_reserved?: number | null;
  is_hidden?: boolean | null;
  is_manually_sold_out?: boolean | null;
};
export type OrgEventV2 = Omit<EnrichedOrgEvent, "ticket_tiers"> & {
  organization_id?: string;
  ticket_tiers: OrgEventTierV2[];
};

/** GET /api/organizer/data?org= — same payload the web dashboard reads. */
export interface OrganizerDataResponse {
  organization: { id: string; name: string; slug: string };
  events: OrgEventV2[];
  cohost_events?: Array<{ assignment_id: string; owner_org_name: string; owner_org_slug: string; event: OrgEventV2 }>;
  owner_cohost_assignments?: Array<{ event_id: string; cohost_org_name: string }>;
}

/** Text to show after a failed call: the server's message for 4xx (it says what to fix), generic otherwise. */
export function apiErrorText(error: unknown, generic: string): string {
  const e = error as { status?: number; message?: string } | null;
  if (e && typeof e.status === "number" && e.status >= 400 && e.status < 500 && e.status !== 401 && e.message?.trim()) {
    return e.message;
  }
  return generic;
}
