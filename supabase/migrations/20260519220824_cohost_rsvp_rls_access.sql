-- W3-B1: Allow cohost org owner/admin to read + update RSVPs for cohosted events.
--
-- Mirrors the apps/web/app/lib/utils/event-rsvp-authz.ts TS helper so that:
--   - The mobile direct-Supabase reads in useRsvpManagement.useRsvpEvents
--     and useEventRsvps work for cohost admins (currently blocked by RLS).
--   - The "{n} pending" hint in useOrgEvents stops silently dropping for
--     cohost orgs.
--   - The web SSR organizer RSVP page can rely on RLS as a backstop.
--
-- Cohost access is intentionally restricted to owner/admin only. Primary-org
-- access remains open to any member (matches the existing TS helper + previous
-- API-route checks).

--------------------------------------------------------------------------------
-- 1. get_cohost_admin_event_ids() — SECURITY DEFINER helper
--    Returns event IDs where the calling Clerk user is owner OR admin of an
--    organization listed as a cohost in event_assignments.cohost_organization_id.
--
--    Follows the same pattern as get_user_organizations() /
--    get_admin_organizations() to avoid RLS recursion when used in policies.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cohost_admin_event_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT ea.event_id
  FROM event_assignments ea
  JOIN organization_members om
    ON om.organization_id = ea.cohost_organization_id
  JOIN users u
    ON u.id = om.user_id
  WHERE ea.cohost_organization_id IS NOT NULL
    AND u.clerk_id = (auth.jwt() ->> 'sub')
    AND om.role IN ('owner', 'admin');
$$;

--------------------------------------------------------------------------------
-- 2. Extend rsvps RLS to grant cohost-admin SELECT + UPDATE access.
--
-- Drop + recreate the two pre-existing policies (originally in
-- 20260128000000_baseline.sql) so the USING clause covers both
-- primary-org membership AND cohost-admin event access.
--------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Organization members can view RSVPs for their events" ON public.rsvps;
DROP POLICY IF EXISTS "Organization members can update RSVPs for their events" ON public.rsvps;

-- TO authenticated preserves the explicit role scope set by
-- 20260227203747_rsvp_users_policies_to_authenticated.sql. Without it the
-- policies default to PUBLIC, which is functionally safe (both helpers
-- read auth.jwt() ->> 'sub' which is null for anon → predicate false) but
-- silently reverts a prior explicit fix and breaks parity with the sibling
-- "Org members can view RSVP requestor profiles" policy on public.users.
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
