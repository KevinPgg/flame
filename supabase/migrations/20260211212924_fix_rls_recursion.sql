-- Fix Infinite Recursion in RLS Policies
--
-- The error "infinite recursion detected in policy for relation organization_members" occurs
-- because the policy "Users can view organization memberships" queries the organization_members
-- table itself to check permissions, creating a loop.
--
-- This script fixes it by:
-- 1. Creating a SECURITY DEFINER function `get_user_organizations()` that bypasses RLS
--    to safely fetch the user's organization IDs.
-- 2. Updating the RLS policies on `organization_members` and `events` to use this function.

-- 1. Create the security definer function to safely get user organizations
CREATE OR REPLACE FUNCTION public.get_user_organizations()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT organization_id
  FROM organization_members
  WHERE user_id IN (
    SELECT id FROM users WHERE clerk_id = (auth.jwt() ->> 'sub')
  );
$$;

-- 2. Drop the problematic recursive policy
DROP POLICY IF EXISTS "Users can view organization memberships" ON public.organization_members;

-- 3. Create the new non-recursive policy
CREATE POLICY "Users can view organization memberships"
ON public.organization_members
FOR SELECT
USING (
  organization_id IN (SELECT get_user_organizations())
);

-- 4. Update the Events policies to use the new function as well (cleaner, faster)
DROP POLICY IF EXISTS "Organization members can view their events" ON public.events;
DROP POLICY IF EXISTS "Organization members can update their events" ON public.events;
DROP POLICY IF EXISTS "Organization members can create events" ON public.events;

CREATE POLICY "Organization members can view their events"
ON public.events
FOR SELECT
USING (
  organization_id IN (SELECT get_user_organizations())
);

CREATE POLICY "Organization members can update their events"
ON public.events
FOR UPDATE
USING (
  organization_id IN (SELECT get_user_organizations())
);

CREATE POLICY "Organization members can create events"
ON public.events
FOR INSERT
WITH CHECK (
  organization_id IN (SELECT get_user_organizations())
);
