-- Phase 10-1: Event Assignments table, admin-level RLS helper, and updated
-- organization_members policies so that admins (not just owners) can manage
-- memberships and assignments.

--------------------------------------------------------------------------------
-- 1. get_admin_organizations() — SECURITY DEFINER helper
--    Returns org IDs where the calling user is owner OR admin.
--    Follows the same pattern as get_owned_organizations() and
--    get_user_organizations() to avoid RLS recursion.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_organizations()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT om.organization_id
  FROM organization_members om
  JOIN users u ON om.user_id = u.id
  WHERE u.clerk_id = (auth.jwt() ->> 'sub')
    AND om.role IN ('owner', 'admin');
$$;

--------------------------------------------------------------------------------
-- 2. event_assignments table
--------------------------------------------------------------------------------
CREATE TABLE public.event_assignments (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cohost_organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- assigned_by is nullable with SET NULL so that deleting the assigning user
  -- preserves the assignment record as audit history (consistent with other
  -- audit columns across the schema).
  assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),

  -- Each row is either an individual user assignment OR a co-host org assignment
  CONSTRAINT user_or_cohost CHECK (
    (user_id IS NOT NULL AND cohost_organization_id IS NULL) OR
    (user_id IS NULL AND cohost_organization_id IS NOT NULL)
  )
);

-- A user can only be assigned once per event
CREATE UNIQUE INDEX event_assignments_unique_user
  ON public.event_assignments(event_id, user_id)
  WHERE user_id IS NOT NULL;

-- A co-host org can only be assigned once per event
CREATE UNIQUE INDEX event_assignments_unique_cohost
  ON public.event_assignments(event_id, cohost_organization_id)
  WHERE cohost_organization_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.event_assignments ENABLE ROW LEVEL SECURITY;

--------------------------------------------------------------------------------
-- 3. RLS policies on event_assignments
--------------------------------------------------------------------------------

-- SELECT: org members can read assignments for their org's events
--         + assigned users can read their own assignments
CREATE POLICY "Org members can view event assignments"
ON public.event_assignments
FOR SELECT
USING (
  organization_id IN (SELECT get_user_organizations())
  OR cohost_organization_id IN (SELECT get_user_organizations())
  OR user_id IN (
    SELECT u.id FROM users u WHERE u.clerk_id = (auth.jwt() ->> 'sub')
  )
);

-- INSERT: only owner/admin of the event's org
CREATE POLICY "Admins can create event assignments"
ON public.event_assignments
FOR INSERT
WITH CHECK (
  organization_id IN (SELECT get_admin_organizations())
);

-- DELETE: only owner/admin of the event's org
CREATE POLICY "Admins can delete event assignments"
ON public.event_assignments
FOR DELETE
USING (
  organization_id IN (SELECT get_admin_organizations())
);

--------------------------------------------------------------------------------
-- 4. Update organization_members policies
--    Extend INSERT/UPDATE/DELETE from owner-only to owner/admin, with guards:
--    - Cannot assign the 'owner' role
--    - Cannot modify/delete rows where role = 'owner'
--------------------------------------------------------------------------------

-- Drop existing per-operation policies
DROP POLICY IF EXISTS "Organization owners can select memberships" ON public.organization_members;
DROP POLICY IF EXISTS "Organization owners can insert memberships" ON public.organization_members;
DROP POLICY IF EXISTS "Organization owners can update memberships" ON public.organization_members;
DROP POLICY IF EXISTS "Organization owners can delete memberships" ON public.organization_members;

-- SELECT: all org members can see their org's members (needed for member list UI)
-- The existing "Users can view organization memberships" policy (get_user_organizations)
-- already handles this from migration 20260211212924. We re-add the admin-scoped
-- select for completeness but it's effectively covered.
CREATE POLICY "Admins can select memberships"
ON public.organization_members
FOR SELECT
USING (
  organization_id IN (SELECT get_admin_organizations())
);

-- INSERT: owner/admin can add members, but cannot assign 'owner' role
CREATE POLICY "Admins can insert memberships"
ON public.organization_members
FOR INSERT
WITH CHECK (
  organization_id IN (SELECT get_admin_organizations())
  AND role <> 'owner'
);

-- UPDATE: owner/admin can update members, but cannot change TO 'owner' role
--         and cannot modify rows where current role IS 'owner'
CREATE POLICY "Admins can update memberships"
ON public.organization_members
FOR UPDATE
USING (
  organization_id IN (SELECT get_admin_organizations())
  AND role <> 'owner'
)
WITH CHECK (
  organization_id IN (SELECT get_admin_organizations())
  AND role <> 'owner'
);

-- DELETE: owner/admin can remove members, but cannot remove owner rows
CREATE POLICY "Admins can delete memberships"
ON public.organization_members
FOR DELETE
USING (
  organization_id IN (SELECT get_admin_organizations())
  AND role <> 'owner'
);
