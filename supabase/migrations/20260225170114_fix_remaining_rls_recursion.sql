-- Fix remaining RLS infinite recursion between organization_members and organizations.
--
-- The previous fix (20260211212924) updated:
--   - organization_members "Users can view organization memberships" → get_user_organizations()
--   - events policies → get_user_organizations()
--
-- But two policies still create a circular reference:
--   - organization_members "Organization owners can manage memberships" → queries organizations
--   - organizations "Users can view organizations they belong to" → queries organization_members
--
-- Fix: Replace both with SECURITY DEFINER helpers that bypass RLS.

-- 1. Create helper for owner-level org lookup (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_owned_organizations()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT o.id
  FROM organizations o
  JOIN users u ON o.owner_user_id = u.id
  WHERE u.clerk_id = (auth.jwt() ->> 'sub');
$$;

-- 2. Fix "Organization owners can manage memberships" on organization_members
DROP POLICY IF EXISTS "Organization owners can manage memberships" ON public.organization_members;

CREATE POLICY "Organization owners can manage memberships"
ON public.organization_members
USING (
  organization_id IN (SELECT get_owned_organizations())
);

-- 3. Fix "Users can view organizations they belong to" on organizations
DROP POLICY IF EXISTS "Users can view organizations they belong to" ON public.organizations;

CREATE POLICY "Users can view organizations they belong to"
ON public.organizations
FOR SELECT
USING (
  id IN (SELECT get_user_organizations())
);
