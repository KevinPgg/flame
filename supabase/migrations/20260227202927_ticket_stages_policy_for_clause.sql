-- Fix: Add explicit FOR UPDATE, DELETE, SELECT to "Organization members can manage ticket stages"
-- so direct INSERTs by clients are prevented. PostgreSQL requires one policy per command.
DROP POLICY IF EXISTS "Organization members can manage ticket stages" ON public.ticket_stages;

CREATE POLICY "Organization members can manage ticket stages"
ON public.ticket_stages
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.ticket_tiers tt
    JOIN public.events e ON tt.event_id = e.id
    WHERE tt.id = ticket_stages.ticket_tier_id
      AND e.organization_id IN (SELECT get_user_organizations())
  )
);

CREATE POLICY "Organization members can update ticket stages"
ON public.ticket_stages
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.ticket_tiers tt
    JOIN public.events e ON tt.event_id = e.id
    WHERE tt.id = ticket_stages.ticket_tier_id
      AND e.organization_id IN (SELECT get_user_organizations())
  )
);

CREATE POLICY "Organization members can delete ticket stages"
ON public.ticket_stages
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.ticket_tiers tt
    JOIN public.events e ON tt.event_id = e.id
    WHERE tt.id = ticket_stages.ticket_tier_id
      AND e.organization_id IN (SELECT get_user_organizations())
  )
);
