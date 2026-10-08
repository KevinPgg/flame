/**
 * Public-facing organization data shape.
 * Used by both web and mobile when displaying organizer info.
 */
export interface OrganizationPublic {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  cover_image_url: string | null;
  description?: string | null;
  instagram_handle?: string | null;
  city?: string | null;
}

/**
 * Role a user holds within an organization.
 * Maps to the CHECK constraint on organization_members.role.
 */
export type OrgMemberRole = "owner" | "admin" | "organizer" | "viewer";

/**
 * A member row enriched with user details (from a join with users table).
 */
export interface OrganizationMember {
  id: string;
  user_id: string;
  organization_id: string;
  role: OrgMemberRole;
  created_at: string;
  updated_at: string;
  user_email?: string;
  user_first_name?: string | null;
  user_last_name?: string | null;
}

/**
 * An event assignment — either an individual user or a co-host org.
 */
export interface EventAssignment {
  id: string;
  event_id: string;
  user_id: string | null;
  organization_id: string;
  cohost_organization_id: string | null;
  assigned_by: string;
  created_at: string;
  event_name?: string;
  cohost_org_name?: string;
  source_org_name?: string;
}
