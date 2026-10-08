-- W4-C1: Add `is_manually_sold_out` + `is_hidden` toggles to ticket_tiers
-- and extend get_event_with_tiers RPC with:
--   1. Per-tier visibility filter for non-organizer viewers (hidden tiers only
--      surfaced to host-org members).
--   2. Per-stage `quantity_reserved` count (active stage holds + pending/approved
--      RSVPs by stage_id) so the organizer 'reserved' hint is stage-accurate, not
--      just tier-level.
--
-- Tier-level `quantity_reserved` already returned by the RPC since
-- 20260416042751_add_has_secret_code_to_get_event_rpc.sql; this preserves that
-- behavior. The two new boolean columns flow through `to_jsonb(tt)` automatically
-- for organizer responses.

ALTER TABLE public.ticket_tiers
  ADD COLUMN IF NOT EXISTS is_manually_sold_out BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.ticket_tiers
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ticket_tiers.is_manually_sold_out IS
  'Organizer toggle that prevents new purchases by forcing isTierAvailable() to return false. Distinct from natural sold-out (capacity reached). Attendees still see standard "Sold Out" label; organizer dashboard distinguishes via inline "Closed" indicator.';

COMMENT ON COLUMN public.ticket_tiers.is_hidden IS
  'Organizer toggle that hides this tier from attendees entirely. The get_event_with_tiers RPC filters hidden tiers from non-organizer responses. Host-org members continue to see the tier so they can manage it.';


CREATE OR REPLACE FUNCTION public.get_event_with_tiers(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  is_organizer boolean;
BEGIN
  -- Determine whether the caller is a member of the event's host organization.
  -- Organizers see hidden tiers (so they can manage them); attendees do not.
  -- Cohost-org members are intentionally NOT treated as organizers here — hidden
  -- tier management is owner/admin-only.
  SELECT EXISTS (
    SELECT 1
    FROM events e2
    WHERE e2.id = p_event_id
      AND e2.organization_id = ANY(ARRAY(SELECT get_user_organizations()))
  ) INTO is_organizer;

  SELECT jsonb_build_object(
    'event', to_jsonb(e),
    'ticket_tiers', COALESCE((
      SELECT jsonb_agg(
        -- Strip secret_code (security) and add computed fields.
        (to_jsonb(tt) - 'secret_code') || jsonb_build_object(
          'has_secret_code', (tt.secret_code IS NOT NULL AND tt.secret_code <> ''),
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
            SELECT jsonb_agg(
              to_jsonb(ts) || jsonb_build_object(
                'quantity_reserved', (
                  SELECT COALESCE(SUM(h.quantity), 0)
                  FROM holds h
                  WHERE h.tier_id = tt.id
                    AND h.stage_id = ts.id
                    AND h.expires_at > NOW()
                    AND h.order_id IS NULL
                ) + (
                  SELECT COALESCE(SUM(ru.requested_quantity), 0)
                  FROM rsvps ru
                  WHERE ru.ticket_tier_id = tt.id
                    AND ru.stage_id = ts.id
                    AND ru.status IN ('pending', 'approved')
                )
              )
              ORDER BY ts.order_index
            )
            FROM ticket_stages ts
            WHERE ts.ticket_tier_id = tt.id
          ), '[]'::jsonb)
        )
        ORDER BY tt.order_index
      )
      FROM ticket_tiers tt
      WHERE tt.event_id = e.id
        AND (NOT tt.is_hidden OR is_organizer)
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
