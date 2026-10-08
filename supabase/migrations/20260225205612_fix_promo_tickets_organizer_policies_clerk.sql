-- Fix: organizer-scoped policies on promotional_tickets use auth.uid(),
-- which fails with 22P02 when evaluated with Clerk JWTs (Clerk user IDs
-- are non-UUID strings like "user_abc123"). Replace with get_owned_organizations()
-- (SECURITY DEFINER), consistent with the org_members policies.

DROP POLICY IF EXISTS "Organizers can view promotional tickets for their events" ON public.promotional_tickets;
DROP POLICY IF EXISTS "Organizers can create promotional tickets for their events" ON public.promotional_tickets;
DROP POLICY IF EXISTS "Organizers can update promotional tickets for their events" ON public.promotional_tickets;

CREATE POLICY "Organizers can view promotional tickets for their events"
ON public.promotional_tickets
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = promotional_tickets.event_id
      AND e.organization_id IN (SELECT get_owned_organizations())
  )
);

CREATE POLICY "Organizers can create promotional tickets for their events"
ON public.promotional_tickets
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = promotional_tickets.event_id
      AND e.organization_id IN (SELECT get_owned_organizations())
  )
);

CREATE POLICY "Organizers can update promotional tickets for their events"
ON public.promotional_tickets
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = promotional_tickets.event_id
      AND e.organization_id IN (SELECT get_owned_organizations())
  )
);
