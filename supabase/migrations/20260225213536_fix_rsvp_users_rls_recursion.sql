-- Fix infinite RLS recursion between users and rsvps (Fix #224).
-- The original 20260225212511 created a users policy that queried rsvps directly,
-- while rsvps policies queried users → infinite recursion.
--
-- This migration: (1) creates get_rsvp_user_ids() SECURITY DEFINER helper,
-- (2) recreates the users policy to use it, (3) updates rsvps policies to use
-- get_user_organizations() instead of inline users subqueries.
--
-- NOTE: The correct content was later merged into 20260225212511 (Fix #228)
-- so fresh deployments get it in one migration. This file exists for parity
-- with the remote migration history — all operations are idempotent.

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

DROP POLICY IF EXISTS "Org members can view RSVP requestor profiles" ON public.users;
CREATE POLICY "Org members can view RSVP requestor profiles"
ON public.users FOR SELECT TO authenticated
USING (id IN (SELECT get_rsvp_user_ids()));

DROP POLICY IF EXISTS "Organization members can view RSVPs for their events" ON public.rsvps;
DROP POLICY IF EXISTS "Organization members can update RSVPs for their events" ON public.rsvps;

CREATE POLICY "Organization members can view RSVPs for their events"
ON public.rsvps FOR SELECT TO authenticated
USING (
  event_id IN (
    SELECT id FROM events
    WHERE organization_id IN (SELECT get_user_organizations())
  )
);

CREATE POLICY "Organization members can update RSVPs for their events"
ON public.rsvps FOR UPDATE TO authenticated
USING (
  event_id IN (
    SELECT id FROM events
    WHERE organization_id IN (SELECT get_user_organizations())
  )
);
