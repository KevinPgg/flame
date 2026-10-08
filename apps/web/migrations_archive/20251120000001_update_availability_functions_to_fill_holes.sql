-- Migration: Update availability functions to use explicit sold_quantity (Filling Holes)
-- This updates get_stage_availability and get_tier_stage_availability to use the stored sold_quantity
-- instead of calculating it from the waterfall. This allows "holes" in earlier stages to be filled.

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
  v_held_quantity INTEGER;
  v_sold_in_stage INTEGER;
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

  -- NEW LOGIC: Use explicit sold_quantity
  v_sold_in_stage := COALESCE(v_stage.sold_quantity, 0);

  -- Count active holds for this specific stage (non-expired, not converted to orders)
  SELECT COALESCE(SUM(quantity), 0)
  INTO v_held_quantity
  FROM holds h
  WHERE h.stage_id = p_stage_id
    AND h.expires_at > NOW()
    AND h.order_id IS NULL;

  -- Return availability details
  -- Clamp available_quantity to zero to prevent negative values
  RETURN QUERY SELECT
    v_stage.id,
    v_stage.name::TEXT,
    v_stage.price_cents,
    v_stage.quantity,
    v_sold_in_stage,
    v_held_quantity,
    GREATEST(v_stage.quantity - v_sold_in_stage - v_held_quantity, 0)::INTEGER AS available_quantity;
END;
$$;

COMMENT ON FUNCTION get_stage_availability IS 
'Returns real-time availability for a stage including sold tickets, active holds, and available quantity (using explicit sold_quantity)';


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
      COALESCE(ts.sold_quantity, 0) as sold_quantity,
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
      
      -- NEW LOGIC: Use explicit sold_quantity
      sc.sold_quantity as sold_qty,
      
      sc.held_qty::INTEGER as held_qty,
      
      -- Available quantity (clamped to zero)
      GREATEST(
        0,
        sc.total_qty - sc.sold_quantity - sc.held_qty
      )::INTEGER as available_qty
      
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
    -- 1. It has availability
    -- 2. It's the FIRST stage (by order) that is not full
    (
      sa.available_qty > 0
      AND
      (
        sa.order_index = 0
        OR
        -- Check that all previous stages are full
        NOT EXISTS (
          SELECT 1
          FROM stage_availability sa_prev
          WHERE sa_prev.order_index < sa.order_index
            AND (sa_prev.sold_qty + sa_prev.held_qty) < sa_prev.total_qty
        )
      )
    ) as is_current_stage
    
  FROM stage_availability sa
  ORDER BY sa.order_index;
END;
$$;

COMMENT ON FUNCTION get_tier_stage_availability IS 
'Returns real-time availability for all stages in a tier, allowing holes in earlier stages to be filled';

-- Grant permissions (re-applying to be safe)
GRANT EXECUTE ON FUNCTION get_stage_availability(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_tier_stage_availability(UUID) TO authenticated, anon;

