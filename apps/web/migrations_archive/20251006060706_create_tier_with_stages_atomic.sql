-- Migration: Add atomic transaction function for creating ticket tiers with stages
-- This ensures that tier and stage creation happens atomically, preventing orphaned tiers

CREATE OR REPLACE FUNCTION create_ticket_tier_with_stages(
  p_event_id UUID,
  p_name TEXT,
  p_price_cents INTEGER,
  p_quantity_total INTEGER,
  p_per_user_limit INTEGER,
  p_sales_start TIMESTAMPTZ,
  p_sales_end TIMESTAMPTZ,
  p_order_index INTEGER,
  p_use_stages BOOLEAN DEFAULT false,
  p_stages JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_tier_id UUID;
  v_stage JSONB;
  v_result JSONB;
  v_total_stage_quantity INTEGER;
BEGIN
  -- Create the ticket tier
  INSERT INTO ticket_tiers (
    event_id,
    name,
    price_cents,
    quantity_total,
    per_user_limit,
    sales_start,
    sales_end,
    order_index
  ) VALUES (
    p_event_id,
    p_name,
    p_price_cents,
    p_quantity_total,
    p_per_user_limit,
    p_sales_start,
    p_sales_end,
    p_order_index
  )
  RETURNING id INTO v_tier_id;

  -- Create ticket stages if provided
  IF p_use_stages AND p_stages IS NOT NULL THEN
    -- Validate that stage quantities sum to tier total
    SELECT COALESCE(SUM((stage->>'quantity')::INTEGER), 0) INTO v_total_stage_quantity
    FROM jsonb_array_elements(p_stages) AS stage;

    IF v_total_stage_quantity != p_quantity_total THEN
      RAISE EXCEPTION 'Stage quantities (%) must sum to tier total quantity (%)',
        v_total_stage_quantity, p_quantity_total
        USING ERRCODE = 'check_violation';
    END IF;

    -- Insert all stages
    FOR v_stage IN SELECT * FROM jsonb_array_elements(p_stages)
    LOOP
      INSERT INTO ticket_stages (
        ticket_tier_id,
        name,
        price_cents,
        currency,
        quantity,
        sold_quantity,
        order_index
      ) VALUES (
        v_tier_id,
        v_stage->>'name',
        (v_stage->>'price_cents')::INTEGER,
        'USD',
        (v_stage->>'quantity')::INTEGER,
        0,
        (v_stage->>'order_index')::INTEGER
      );
    END LOOP;
  END IF;

  -- Return the created tier ID
  v_result := jsonb_build_object(
    'success', true,
    'tier_id', v_tier_id,
    'message', 'Ticket tier created successfully'
  );
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Any error will trigger automatic rollback of the entire transaction
    -- No orphaned tiers will be created
    RAISE;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION create_ticket_tier_with_stages(UUID, TEXT, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, BOOLEAN, JSONB) IS 
'Atomically creates a ticket tier and its stages in a single transaction. 
If stage creation fails, the tier creation is automatically rolled back, preventing orphaned tiers.
Validates that stage quantities sum to the tier total quantity.
Returns JSONB with tier_id on success. Raises exceptions on failures which trigger automatic rollback.';

-- Set search_path for security
ALTER FUNCTION create_ticket_tier_with_stages(UUID, TEXT, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, BOOLEAN, JSONB) SET search_path = public, pg_temp;
