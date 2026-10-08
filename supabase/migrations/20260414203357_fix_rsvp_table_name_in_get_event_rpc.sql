-- Fix: rsvp_users → rsvps in get_event_with_tiers quantity_reserved subquery
-- The previous migration referenced a non-existent table rsvp_users.
-- The correct table name is rsvps.

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
          'quantity_reserved', (
            SELECT COALESCE(SUM(h.quantity), 0)
            FROM holds h
            WHERE h.tier_id = tt.id
              AND h.expires_at > NOW()
              AND h.order_id IS NULL
          ) + (
            SELECT COALESCE(SUM(ru.requested_quantity), 0)
            FROM rsvps ru
            WHERE ru.ticket_tier_id = tt.id
              AND ru.status IN ('pending', 'approved')
          ),
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
