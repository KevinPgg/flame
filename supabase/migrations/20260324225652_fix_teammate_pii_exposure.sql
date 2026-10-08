-- Fix: Org teammate profile RLS exposed all users columns including PII.
--
-- The previous migration (20260324221813_org_teammates_view_profiles.sql) added a
-- SELECT policy on the users table that granted row-level access to all columns
-- (including document_id, phone, billing_address, ip_address, date_of_birth) for
-- org teammates. A raw Supabase API call with a valid JWT could query SELECT * and
-- return full user rows for any teammate.
--
-- Fix: Drop the broad policy and the helper function it depended on.
-- Replace with a SECURITY DEFINER function that joins organization_members ↔ users
-- but only exposes id, first_name, last_name, email — no PII columns.
-- The function is access-guarded via get_admin_organizations() so only org owners
-- and admins can list members (consistent with the existing UI permission check).

-- 1. Drop the overly-broad SELECT policy on users
DROP POLICY IF EXISTS "Org members can view teammate profiles" ON public.users;

-- 2. Drop the now-unused helper function
DROP FUNCTION IF EXISTS public.get_org_teammate_user_ids();

-- 3. Create a SECURITY DEFINER RPC that returns org members with restricted profile data.
--    Runs as the function owner (postgres) to bypass users RLS, but restricts
--    returned columns to safe fields only (no PII).
CREATE OR REPLACE FUNCTION public.get_org_members_with_profiles(p_org_id uuid)
RETURNS TABLE(
  id          uuid,
  user_id     uuid,
  organization_id uuid,
  role        text,
  created_at  timestamptz,
  updated_at  timestamptz,
  user_email  text,
  user_first_name text,
  user_last_name  text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    om.id,
    om.user_id,
    om.organization_id,
    om.role::text,
    om.created_at,
    om.updated_at,
    u.email::text        AS user_email,
    u.first_name::text   AS user_first_name,
    u.last_name::text    AS user_last_name
  FROM organization_members om
  LEFT JOIN users u ON u.id = om.user_id
  WHERE om.organization_id = p_org_id
    AND p_org_id IN (SELECT get_admin_organizations());
$$;

REVOKE ALL ON FUNCTION public.get_org_members_with_profiles(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org_members_with_profiles(uuid) TO authenticated;
