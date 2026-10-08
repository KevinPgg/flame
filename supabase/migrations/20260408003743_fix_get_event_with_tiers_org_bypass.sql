-- Fix get_event_with_tiers: allow org members to see their events regardless of status
--
-- Problem: The RPC had a hard `AND e.status = 'published'` filter. This meant:
--   1. Organizers navigating to their own published-but-past events from the organizer
--      dashboard would get NULL / "Event Not Found" if the event's status had been
--      changed to anything other than 'published' (e.g. completed, archived).
--   2. Any future draft/preview flow would also be blocked.
--
-- Fix: Return the event if EITHER:
--   (a) status = 'published'  →  safe for any unauthenticated or authenticated caller
--   (b) the caller is a member of the event's organization (via get_user_organizations())
--       →  org members always see their own events, regardless of status
--
-- get_user_organizations() is a SECURITY DEFINER helper that returns SETOF uuid
-- of organization IDs the current JWT user belongs to (clerk_id match via auth.jwt() ->> 'sub').
-- It already powers the RLS policies on events and organization_members tables.

CREATE OR REPLACE FUNCTION get_event_with_tiers(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'event', to_jsonb(e),
    'ticket_tiers', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(tt) || jsonb_build_object(
          'ticket_stages', COALESCE((
            SELECT jsonb_agg(to_jsonb(ts) ORDER BY ts.order_index)
            FROM ticket_stages ts
            WHERE ts.ticket_tier_id = tt.id
          ), '[]'::jsonb)
        )
        ORDER BY tt.order_index
      )
      FROM ticket_tiers tt
      WHERE tt.event_id = e.id
    ), '[]'::jsonb),
    'organization_name', COALESCE((
      SELECT o.name FROM organizations o WHERE o.id = e.organization_id
    ), ''),
    'cohost_org_names', COALESCE((
      SELECT jsonb_agg(name ORDER BY name)
      FROM (
        SELECT DISTINCT co.name
        FROM event_assignments ea
        JOIN organizations co ON co.id = ea.cohost_organization_id
        WHERE ea.event_id = e.id
          AND ea.cohost_organization_id IS NOT NULL
      ) sub
    ), '[]'::jsonb)
  ) INTO result
  FROM events e
  WHERE e.id = p_event_id
    AND (
      e.status = 'published'
      OR e.organization_id = ANY(ARRAY(SELECT get_user_organizations()))
    );

  RETURN result;
END;
$$;
