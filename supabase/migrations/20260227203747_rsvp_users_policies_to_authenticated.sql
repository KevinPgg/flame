-- Add TO authenticated to users/rsvps RLS policies so they only run for
-- authenticated role (get_rsvp_user_ids/get_user_organizations require JWT).
-- Policies previously applied to PUBLIC by default.
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
