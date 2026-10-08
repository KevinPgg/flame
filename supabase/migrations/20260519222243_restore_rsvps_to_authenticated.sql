-- Follow-up to 20260519220824_cohost_rsvp_rls_access.sql.
--
-- That migration dropped + recreated the two rsvps policies but omitted the
-- explicit `TO authenticated` clause, defaulting the role scope to PUBLIC.
-- The intent of 20260227203747_rsvp_users_policies_to_authenticated.sql was
-- specifically to scope these to the authenticated role (and the sibling
-- "Org members can view RSVP requestor profiles" policy on public.users
-- still carries TO authenticated). Restore parity.
--
-- Functional impact is low — both predicate branches rely on auth.jwt() ->>
-- 'sub' which is NULL for the anon role, so PUBLIC was inert in practice.
-- This is a hygiene + auditability fix.

DROP POLICY IF EXISTS "Organization members can view RSVPs for their events" ON public.rsvps;
DROP POLICY IF EXISTS "Organization members can update RSVPs for their events" ON public.rsvps;

CREATE POLICY "Organization members can view RSVPs for their events"
ON public.rsvps
FOR SELECT
TO authenticated
USING (
  event_id IN (
    SELECT events.id
    FROM events
    WHERE events.organization_id IN (SELECT get_user_organizations())
  )
  OR event_id IN (SELECT get_cohost_admin_event_ids())
);

CREATE POLICY "Organization members can update RSVPs for their events"
ON public.rsvps
FOR UPDATE
TO authenticated
USING (
  event_id IN (
    SELECT events.id
    FROM events
    WHERE events.organization_id IN (SELECT get_user_organizations())
  )
  OR event_id IN (SELECT get_cohost_admin_event_ids())
);
