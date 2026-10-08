-- Allow organization members to view profiles of users who RSVPed
-- to their events. Required for mobile direct-Supabase RSVP reads
-- (the web uses supabaseAdmin which bypasses RLS).
--
-- Uses a SECURITY DEFINER helper to avoid infinite recursion between
-- the users and rsvps RLS policies:
--   users policy → rsvps → rsvps policy → users (cycle).

-- 1. Create SECURITY DEFINER helper that returns user IDs who RSVPed
--    to events owned by the current user's organizations.
CREATE OR REPLACE FUNCTION public.get_rsvp_user_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT DISTINCT r.user_id
  FROM rsvps r
  JOIN events e ON r.event_id = e.id
  WHERE e.organization_id IN (SELECT get_user_organizations());
$$;

REVOKE ALL ON FUNCTION public.get_rsvp_user_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_rsvp_user_ids() TO authenticated;

-- 2. Create users policy using the SECURITY DEFINER function
--    (avoids direct rsvps subquery which causes infinite recursion)
CREATE POLICY "Org members can view RSVP requestor profiles"
ON public.users FOR SELECT
USING (id IN (SELECT get_rsvp_user_ids()));

-- 3. Update rsvps policies to use get_user_organizations() instead of
--    inline subqueries on users (prevents recursion from the other direction)
DROP POLICY IF EXISTS "Organization members can view RSVPs for their events" ON public.rsvps;
DROP POLICY IF EXISTS "Organization members can update RSVPs for their events" ON public.rsvps;

CREATE POLICY "Organization members can view RSVPs for their events"
ON public.rsvps FOR SELECT
USING (
  event_id IN (
    SELECT id FROM events
    WHERE organization_id IN (SELECT get_user_organizations())
  )
);

CREATE POLICY "Organization members can update RSVPs for their events"
ON public.rsvps FOR UPDATE
USING (
  event_id IN (
    SELECT id FROM events
    WHERE organization_id IN (SELECT get_user_organizations())
  )
);
