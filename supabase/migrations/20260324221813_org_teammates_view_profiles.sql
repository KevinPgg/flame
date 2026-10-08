-- Allow organization members to view basic profile info of fellow org members.
-- Required for the Team Members screen (org-members.tsx) where useOrgMembers
-- joins organization_members → users to show name + email.
--
-- Without this policy, Supabase RLS returns null for all joined user fields
-- (only your own profile is readable), causing teammates to display as "Unknown".
--
-- Uses a SECURITY DEFINER helper to avoid infinite recursion between
-- the users and organization_members RLS policies.

-- 1. Create SECURITY DEFINER helper that returns user IDs who share
--    an organization with the current user.
CREATE OR REPLACE FUNCTION public.get_org_teammate_user_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT DISTINCT om2.user_id
  FROM organization_members om1
  JOIN organization_members om2 ON om1.organization_id = om2.organization_id
  JOIN users u ON om1.user_id = u.id
  WHERE u.clerk_id = (auth.jwt() ->> 'sub');
$$;

REVOKE ALL ON FUNCTION public.get_org_teammate_user_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org_teammate_user_ids() TO authenticated;

-- 2. Create users SELECT policy using the SECURITY DEFINER function
CREATE POLICY "Org members can view teammate profiles"
ON public.users FOR SELECT TO authenticated
USING (id IN (SELECT get_org_teammate_user_ids()));
