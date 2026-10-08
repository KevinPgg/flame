-- Migration: Update atomic hold validation to allow filling holes in stage sales
-- This updates the validation logic to use explicit stage.sold_quantity instead of waterfall calculation
-- allowing unsold tickets in earlier stages to be purchased even if total sales have moved to later stages.

CREATE OR REPLACE FUNCTION atomic_create_hold_with_stage_validation(
  p_user_id UUID,
  p_event_id UUID,
  p_tier_id UUID,
  p_quantity INTEGER,
  p_stage_id UUID DEFAULT NULL,
  p_expires_minutes INTEGER DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket_tier RECORD;
  v_stage RECORD;
  v_stage_name TEXT;
  v_stage_price_cents INTEGER;
  v_now TIMESTAMP WITH TIME ZONE;
  v_expires_at TIMESTAMP WITH TIME ZONE;
  v_sold_in_stage INTEGER;
  v_active_holds_in_stage INTEGER;
  v_available_in_stage INTEGER;
  v_hold_id UUID;
  v_result JSONB;
BEGIN
  v_now := NOW();
  v_expires_at := v_now + (p_expires_minutes || ' minutes')::INTERVAL;

  -- Basic sanity check: quantity must be a positive integer
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ticket quantity must be at least 1'
    );
  END IF;

  -- Lock the ticket tier for update to prevent concurrent modifications
  SELECT 
    id, 
    name, 
    price_cents, 
    quantity_total, 
    quantity_sold, 
    per_user_limit,
    sales_start,
    sales_end,
    event_id
  INTO v_ticket_tier
  FROM ticket_tiers
  WHERE id = p_tier_id
    AND event_id = p_event_id
  FOR UPDATE;

  -- Verify tier exists
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ticket tier not found'
    );
  END IF;

  -- Check sales window
  IF v_ticket_tier.sales_start IS NOT NULL AND v_now < v_ticket_tier.sales_start THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ticket sales have not started yet'
    );
  END IF;

  IF v_ticket_tier.sales_end IS NOT NULL AND v_now > v_ticket_tier.sales_end THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ticket sales have ended'
    );
  END IF;

  -- Check per-user limit
  IF p_quantity > v_ticket_tier.per_user_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Maximum %s tickets allowed per person', v_ticket_tier.per_user_limit)
    );
  END IF;

  -- If stage_id is provided, validate stage-level availability
  IF p_stage_id IS NOT NULL THEN
    -- Lock the stage for update
    SELECT
      id,
      name,
      price_cents,
      quantity,
      sold_quantity,
      order_index
    INTO v_stage
    FROM ticket_stages
    WHERE id = p_stage_id
      AND ticket_tier_id = p_tier_id
    FOR UPDATE;

    -- Verify stage exists
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'The requested ticket stage is not found or no longer available'
      );
    END IF;

    v_stage_name := v_stage.name;
    v_stage_price_cents := v_stage.price_cents;

    -- NEW LOGIC: Use explicit sold_quantity from stage record
    -- This correctly handles "holes" where earlier stages have availability despite higher total sales
    v_sold_in_stage := COALESCE(v_stage.sold_quantity, 0);

    -- Calculate active holds for this specific stage
    -- Only count non-expired holds that haven't been converted to orders
    SELECT COALESCE(SUM(quantity), 0)
    INTO v_active_holds_in_stage
    FROM holds
    WHERE stage_id = p_stage_id
      AND expires_at > v_now
      AND order_id IS NULL;

    -- Calculate available quantity accounting for both sold and held tickets
    v_available_in_stage := v_stage.quantity - v_sold_in_stage - v_active_holds_in_stage;

    -- Check if stage is sold out
    IF v_available_in_stage <= 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('The "%s" stage is sold out. Please select another ticket option.', v_stage_name)
      );
    END IF;

    -- Check if requested quantity is available
    IF p_quantity > v_available_in_stage THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Only %s ticket(s) available for the "%s" stage. Please adjust your quantity or select another ticket option.', v_available_in_stage, v_stage_name)
      );
    END IF;

  ELSE
    -- No stage selected - validate tier-level availability
    -- Use tier price and no stage name
    v_stage_name := NULL;
    v_stage_price_cents := v_ticket_tier.price_cents;

    -- Calculate active holds for the entire tier (INCLUDING holds with specific stages)
    -- This prevents overbooking by accounting for all holds against the tier
    SELECT COALESCE(SUM(quantity), 0)
    INTO v_active_holds_in_stage
    FROM holds
    WHERE tier_id = p_tier_id
      AND expires_at > v_now
      AND order_id IS NULL;

    v_available_in_stage := v_ticket_tier.quantity_total - COALESCE(v_ticket_tier.quantity_sold, 0) - v_active_holds_in_stage;

    IF v_available_in_stage <= 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'This ticket tier is sold out'
      );
    END IF;

    IF p_quantity > v_available_in_stage THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Only %s tickets available for this tier', v_available_in_stage)
      );
    END IF;
  END IF;

  -- All validations passed - create the hold
  INSERT INTO holds (
    user_id,
    event_id,
    tier_id,
    quantity,
    expires_at,
    stage_id,
    stage_name,
    stage_price_cents
  ) VALUES (
    p_user_id,
    p_event_id,
    p_tier_id,
    p_quantity,
    v_expires_at,
    p_stage_id,
    v_stage_name,
    v_stage_price_cents
  )
  RETURNING id INTO v_hold_id;

  -- Build success response
  v_result := jsonb_build_object(
    'success', true,
    'hold_id', v_hold_id,
    'expires_at', v_expires_at,
    'stage_name', v_stage_name,
    'stage_price_cents', v_stage_price_cents,
    'available_in_stage', v_available_in_stage
  );

  RETURN v_result;
END;
$$;

