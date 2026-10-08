-- Add get_event_with_tiers RPC
--
-- Problem: The mobile app uses the Supabase anon client, which is subject to RLS.
-- Joining ticket_tiers (or organizations) from the events table triggers infinite
-- recursion in the organization_members RLS policy (error 42P17), because:
--   ticket_tiers RLS → checks organization_id → organization_members RLS → loop
--
-- The web app avoids this by using supabaseAdmin (bypasses RLS entirely).
-- For the mobile app, we create a SECURITY DEFINER function that:
--   1. Bypasses RLS to read events, ticket_tiers, ticket_stages, and organizations
--   2. Only returns published events (safe for anonymous access)
--   3. Returns everything as a single JSONB object for one round-trip
--
-- This follows the same pattern as the existing get_user_organizations() function
-- (see 20260210_fix_recursion.sql).

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
    ), '')
  ) INTO result
  FROM events e
  WHERE e.id = p_event_id
    AND e.status = 'published';

  RETURN result;
END;
$$;
