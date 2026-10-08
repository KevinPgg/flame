-- Fix: ticket_stages RLS policies use auth.uid(), which fails with Clerk JWTs.
-- Clerk user IDs are strings like "user_abc123", not UUIDs. auth.uid() casts
-- auth.jwt() ->> 'sub' to UUID and raises 22P02.
--
-- useOrgEvents (org-dashboard, events-management) selects events with nested
-- ticket_tiers and ticket_stages. The ticket_stages policies blocked organizers
-- from reading stages for their own events. useRsvpEvents works because it
-- only queries events + rsvps (no ticket_tiers/stages join).
--
-- Fix: Replace auth.uid() with get_user_organizations() (Clerk-compatible).

-- 1. "Organization members can manage ticket stages" — used for SELECT/UPDATE/DELETE
DROP POLICY IF EXISTS "Organization members can manage ticket stages" ON public.ticket_stages;

CREATE POLICY "Organization members can manage ticket stages"
ON public.ticket_stages
USING (
  EXISTS (
    SELECT 1
    FROM public.ticket_tiers tt
    JOIN public.events e ON tt.event_id = e.id
    WHERE tt.id = ticket_stages.ticket_tier_id
      AND e.organization_id IN (SELECT get_user_organizations())
  )
);

-- 2. "Users can view ticket stages for accessible events" — SELECT for org members OR published events
DROP POLICY IF EXISTS "Users can view ticket stages for accessible events" ON public.ticket_stages;

CREATE POLICY "Users can view ticket stages for accessible events"
ON public.ticket_stages
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.ticket_tiers tt
    JOIN public.events e ON tt.event_id = e.id
    WHERE tt.id = ticket_stages.ticket_tier_id
      AND (
        e.organization_id IN (SELECT get_user_organizations())
        OR (e.status)::text = 'published'
      )
  )
);
