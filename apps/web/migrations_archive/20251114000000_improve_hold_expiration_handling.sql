-- Migration: Improve hold expiration handling for accurate stage availability
-- This adds automatic cleanup and real-time availability functions

-- ============================================================================
-- FUNCTION: cleanup_expired_holds
-- Automatically delete expired holds to free up inventory
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_expired_holds()
RETURNS TABLE (
  deleted_count INTEGER,
  affected_tier_ids UUID[]
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted_count INTEGER;
  v_affected_tier_ids UUID[];
BEGIN
  -- Delete expired holds and return count + affected tiers
  WITH deleted_holds AS (
    DELETE FROM holds
    WHERE expires_at <= NOW()
      AND order_id IS NULL
    RETURNING tier_id
  )
  SELECT 
    COUNT(*)::INTEGER,
    ARRAY_AGG(DISTINCT tier_id)
  INTO v_deleted_count, v_affected_tier_ids
  FROM deleted_holds;

  RETURN QUERY SELECT v_deleted_count, v_affected_tier_ids;
END;
$$;

COMMENT ON FUNCTION cleanup_expired_holds IS 
'Deletes all expired holds and returns count of deleted holds and affected tier IDs. Should be called periodically to free up inventory.';


-- ============================================================================
-- FUNCTION: get_stage_availability
-- Get real-time availability for a specific stage including active holds
-- ============================================================================
CREATE OR REPLACE FUNCTION get_stage_availability(
  p_stage_id UUID
)
RETURNS TABLE (
  stage_id UUID,
  stage_name TEXT,
  stage_price_cents INTEGER,
  total_quantity INTEGER,
  sold_quantity INTEGER,
  held_quantity INTEGER,
  available_quantity INTEGER
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_stage RECORD;
  v_tier RECORD;
  v_held_quantity INTEGER;
  v_sold_in_stage INTEGER;
  v_cumulative_quantity INTEGER;
BEGIN
  -- Get stage details
  SELECT 
    ts.id,
    ts.name,
    ts.price_cents,
    ts.quantity,
    ts.sold_quantity,
    ts.order_index,
    ts.ticket_tier_id
  INTO v_stage
  FROM ticket_stages ts
  WHERE ts.id = p_stage_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stage not found: %', p_stage_id;
  END IF;

  -- Get tier details
  SELECT 
    tt.id,
    tt.quantity_sold
  INTO v_tier
  FROM ticket_tiers tt
  WHERE tt.id = v_stage.ticket_tier_id;

  -- Calculate cumulative position to determine sold quantity in this stage
  SELECT COALESCE(SUM(quantity), 0)
  INTO v_cumulative_quantity
  FROM ticket_stages
  WHERE ticket_tier_id = v_stage.ticket_tier_id
    AND order_index < v_stage.order_index;

  -- Calculate sold tickets in this specific stage
  v_sold_in_stage := GREATEST(
    0,
    LEAST(
      v_stage.quantity,
      v_tier.quantity_sold - v_cumulative_quantity
    )
  );

  -- Count active holds for this specific stage (non-expired, not converted to orders)
  SELECT COALESCE(SUM(quantity), 0)
  INTO v_held_quantity
  FROM holds
  WHERE stage_id = p_stage_id
    AND expires_at > NOW()
    AND order_id IS NULL;

  -- Return availability details
  -- Clamp available_quantity to zero to prevent negative values from data drift or race conditions
  RETURN QUERY SELECT
    v_stage.id,
    v_stage.name,
    v_stage.price_cents,
    v_stage.quantity,
    v_sold_in_stage,
    v_held_quantity,
    GREATEST(v_stage.quantity - v_sold_in_stage - v_held_quantity, 0)::INTEGER AS available_quantity;
END;
$$;

COMMENT ON FUNCTION get_stage_availability IS 
'Returns real-time availability for a stage including sold tickets, active holds, and available quantity';


-- ============================================================================
-- FUNCTION: get_tier_stage_availability
-- Get real-time availability for all stages in a tier
-- ============================================================================
CREATE OR REPLACE FUNCTION get_tier_stage_availability(
  p_tier_id UUID
)
RETURNS TABLE (
  stage_id UUID,
  stage_name TEXT,
  stage_price_cents INTEGER,
  stage_order INTEGER,
  total_quantity INTEGER,
  sold_quantity INTEGER,
  held_quantity INTEGER,
  available_quantity INTEGER,
  is_current_stage BOOLEAN
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tier RECORD;
  v_cumulative_sold INTEGER := 0;
  v_cumulative_quantity INTEGER := 0;
BEGIN
  -- Get tier details
  SELECT 
    id,
    quantity_total,
    quantity_sold
  INTO v_tier
  FROM ticket_tiers
  WHERE id = p_tier_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tier not found: %', p_tier_id;
  END IF;

  -- Return availability for all stages
  RETURN QUERY
  WITH stage_holds AS (
    -- Count active holds per stage
    SELECT 
      h.stage_id,
      COALESCE(SUM(h.quantity), 0) as held_qty
    FROM holds h
    WHERE h.tier_id = p_tier_id
      AND h.stage_id IS NOT NULL
      AND h.expires_at > NOW()
      AND h.order_id IS NULL
    GROUP BY h.stage_id
  ),
  stage_calcs AS (
    SELECT 
      ts.id,
      ts.name::TEXT,
      ts.price_cents,
      ts.order_index,
      ts.quantity as total_qty,
      ts.sold_quantity,
      
      -- Calculate cumulative sold up to (but not including) this stage
      (SELECT COALESCE(SUM(ts2.quantity), 0)
       FROM ticket_stages ts2
       WHERE ts2.ticket_tier_id = p_tier_id
         AND ts2.order_index < ts.order_index
      ) as cumulative_before,
      
      -- Get held quantity for this stage
      COALESCE(sh.held_qty, 0) as held_qty
      
    FROM ticket_stages ts
    LEFT JOIN stage_holds sh ON sh.stage_id = ts.id
    WHERE ts.ticket_tier_id = p_tier_id
    ORDER BY ts.order_index
  ),
  stage_availability AS (
    SELECT
      sc.id,
      sc.name,
      sc.price_cents,
      sc.order_index,
      sc.total_qty,
      
      -- Sold in this specific stage
      GREATEST(
        0,
        LEAST(
          sc.total_qty,
          v_tier.quantity_sold - sc.cumulative_before
        )
      )::INTEGER as sold_qty,
      
      sc.held_qty::INTEGER as held_qty,
      
      -- Available quantity (clamped to zero to prevent negative values)
      GREATEST(
        0,
        sc.total_qty - 
        GREATEST(0, LEAST(sc.total_qty, v_tier.quantity_sold - sc.cumulative_before)) - 
        sc.held_qty
      )::INTEGER as available_qty,
      
      sc.cumulative_before
      
    FROM stage_calcs sc
  )
  SELECT
    sa.id as stage_id,
    sa.name as stage_name,
    sa.price_cents as stage_price_cents,
    sa.order_index as stage_order,
    sa.total_qty as total_quantity,
    sa.sold_qty as sold_quantity,
    sa.held_qty as held_quantity,
    sa.available_qty as available_quantity,
    
    -- Is this the current stage?
    -- A stage is current if:
    -- 1. It has availability (available_quantity > 0)
    -- 2. It's the first stage (order_index = 0) OR all previous stages are completely full
    --    (each previous stage: sold + held >= total)
    (
      sa.available_qty > 0
      AND
      (
        sa.order_index = 0  -- First stage is always current if it has availability
        OR
        -- Check that all previous stages are full
        NOT EXISTS (
          SELECT 1
          FROM stage_availability sa_prev
          WHERE sa_prev.order_index < sa.order_index
            AND (
              -- Previous stage is NOT full if: (sold + held) < total
              (
                GREATEST(0, LEAST(sa_prev.total_qty, v_tier.quantity_sold - sa_prev.cumulative_before)) + sa_prev.held_qty
              ) < sa_prev.total_qty
            )
        )
      )
    ) as is_current_stage
    
  FROM stage_availability sa
  ORDER BY sa.order_index;
END;
$$;

COMMENT ON FUNCTION get_tier_stage_availability IS 
'Returns real-time availability for all stages in a tier, including which stage is currently active';


-- ============================================================================
-- VIEW: v_active_holds_by_stage
-- View showing all active holds grouped by stage for monitoring
-- ============================================================================
CREATE OR REPLACE VIEW v_active_holds_by_stage AS
SELECT 
  h.tier_id,
  h.stage_id,
  ts.name as stage_name,
  COUNT(*) as hold_count,
  SUM(h.quantity) as total_held_quantity,
  MIN(h.expires_at) as earliest_expiration,
  MAX(h.expires_at) as latest_expiration,
  tt.name as tier_name,
  e.name as event_name,
  e.slug as event_slug
FROM holds h
JOIN ticket_tiers tt ON tt.id = h.tier_id
JOIN events e ON e.id = h.event_id
LEFT JOIN ticket_stages ts ON ts.id = h.stage_id
WHERE h.expires_at > NOW()
  AND h.order_id IS NULL
GROUP BY h.tier_id, h.stage_id, ts.name, tt.name, e.name, e.slug
ORDER BY earliest_expiration ASC;

COMMENT ON VIEW v_active_holds_by_stage IS 
'Shows all currently active holds grouped by stage for monitoring and debugging';


-- ============================================================================
-- Grant permissions
-- ============================================================================
-- SECURITY: cleanup_expired_holds() performs DELETE operations and should only
-- be callable by authenticated users or backend services (via service role).
-- Backend routes use supabaseAdmin (service role) which bypasses RLS and doesn't
-- require these grants, but we restrict to authenticated to prevent anonymous
-- users from deleting holds if called from frontend.
GRANT EXECUTE ON FUNCTION cleanup_expired_holds() TO authenticated;
GRANT EXECUTE ON FUNCTION get_stage_availability(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_tier_stage_availability(UUID) TO authenticated, anon;
GRANT SELECT ON v_active_holds_by_stage TO authenticated;

