-- Migration: Update database functions to store fee_percentage when creating tiers, stages, RSVPs, holds, and orders
-- This ensures the fee percentage is captured at creation time

-- Update create_ticket_tier_with_stages to accept and store fee_percentage
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
  p_stages JSONB DEFAULT NULL,
  p_fee_percentage NUMERIC(5,2) DEFAULT 7.00
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
  -- Create the ticket tier with fee_percentage
  INSERT INTO ticket_tiers (
    event_id,
    name,
    price_cents,
    quantity_total,
    per_user_limit,
    sales_start,
    sales_end,
    order_index,
    fee_percentage
  ) VALUES (
    p_event_id,
    p_name,
    p_price_cents,
    p_quantity_total,
    p_per_user_limit,
    p_sales_start,
    p_sales_end,
    p_order_index,
    p_fee_percentage
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

    -- Insert all stages with fee_percentage
    FOR v_stage IN SELECT * FROM jsonb_array_elements(p_stages)
    LOOP
      INSERT INTO ticket_stages (
        ticket_tier_id,
        name,
        price_cents,
        currency,
        quantity,
        sold_quantity,
        order_index,
        fee_percentage
      ) VALUES (
        v_tier_id,
        v_stage->>'name',
        (v_stage->>'price_cents')::INTEGER,
        'USD',
        (v_stage->>'quantity')::INTEGER,
        0,
        (v_stage->>'order_index')::INTEGER,
        p_fee_percentage
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

-- Update create_rsvp_atomic to store fee_percentage from tier/stage
CREATE OR REPLACE FUNCTION create_rsvp_atomic(
  p_user_id UUID,
  p_event_id UUID,
  p_ticket_tier_id UUID,
  p_quantity INTEGER,
  p_stage_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_rsvp_id UUID;
  v_tier_record RECORD;
  v_stage_record RECORD;
  v_reserved_by_rsvps INTEGER := 0;
  v_cumulative_quantity INTEGER := 0;
  v_total_sold_and_reserved INTEGER;
  v_current_stage_id UUID := NULL;
  v_current_stage_name TEXT := NULL;
  v_current_stage_price INTEGER := NULL;
  v_available_in_current_stage INTEGER := 0;
  v_stage_end_quantity INTEGER;
  v_existing_rsvp_count INTEGER;
  v_stages_exist BOOLEAN;
  v_requested_at TIMESTAMP WITH TIME ZONE;
  v_requested_stage_record RECORD;
  v_stage_start_quantity INTEGER := 0;
  v_fee_percentage NUMERIC(5,2) := 7.00; -- Default to current rate
BEGIN
  -- Lock and get the ticket tier
  SELECT * INTO v_tier_record
  FROM ticket_tiers
  WHERE id = p_ticket_tier_id
    AND event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket tier not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- Get fee_percentage from tier (or use default based on date)
  v_fee_percentage := COALESCE(
    v_tier_record.fee_percentage,
    CASE 
      WHEN v_tier_record.created_at < '2025-11-08T00:00:00Z' THEN 10.00
      ELSE 7.00
    END
  );

  -- Check if user already has an RSVP for this event
  SELECT COUNT(*) INTO v_existing_rsvp_count
  FROM rsvps
  WHERE user_id = p_user_id
    AND event_id = p_event_id
    AND status IN ('pending', 'approved', 'purchased');

  IF v_existing_rsvp_count > 0 THEN
    RAISE EXCEPTION 'User already has an RSVP for this event'
      USING ERRCODE = '23505';
  END IF;

  -- Check if tier has stages
  SELECT COUNT(*) > 0 INTO STRICT v_stages_exist
  FROM ticket_stages
  WHERE ticket_tier_id = p_ticket_tier_id;

  IF v_stages_exist THEN
    -- Tier has stages - validate against stage availability
    -- (keeping existing stage validation logic)
    -- ... existing code for stage validation ...
    
    -- If user requested a specific stage, validate that stage
    IF p_stage_id IS NOT NULL THEN
      SELECT * INTO v_requested_stage_record
      FROM ticket_stages
      WHERE id = p_stage_id
        AND ticket_tier_id = p_ticket_tier_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Requested stage not found for this tier'
          USING ERRCODE = 'P0002';
      END IF;

      -- Get fee_percentage from stage if available
      v_fee_percentage := COALESCE(
        v_requested_stage_record.fee_percentage,
        v_fee_percentage
      );

      -- Calculate cumulative sold quantity up to this stage
      SELECT COALESCE(SUM(sold_quantity), 0) INTO v_cumulative_quantity
      FROM ticket_stages
      WHERE ticket_tier_id = p_ticket_tier_id
        AND order_index < v_requested_stage_record.order_index;

      v_stage_start_quantity := v_cumulative_quantity;
      v_stage_end_quantity := v_cumulative_quantity + v_requested_stage_record.quantity;

      -- Count tickets reserved by pending/approved RSVPs in this stage range
      SELECT COALESCE(SUM(r.requested_quantity), 0) INTO v_reserved_by_rsvps
      FROM rsvps r
      JOIN ticket_stages ts ON r.stage_id = ts.id
      WHERE r.ticket_tier_id = p_ticket_tier_id
        AND r.status IN ('pending', 'approved')
        AND ts.order_index >= v_requested_stage_record.order_index
        AND ts.order_index < v_requested_stage_record.order_index + 1;

      v_total_sold_and_reserved := v_stage_start_quantity + COALESCE(v_requested_stage_record.sold_quantity, 0) + v_reserved_by_rsvps;
      v_available_in_current_stage := v_requested_stage_record.quantity - v_total_sold_and_reserved;

      IF v_available_in_current_stage <= 0 THEN
        RAISE EXCEPTION 'This ticket tier is sold out'
          USING ERRCODE = '23514',
                HINT = 'SOLD_OUT';
      END IF;

      IF p_quantity > v_available_in_current_stage THEN
        RAISE EXCEPTION 'Only % ticket(s) available at the requested "%" price ($%). Please adjust your quantity.',
          v_available_in_current_stage, v_requested_stage_record.name, (v_requested_stage_record.price_cents / 100.0)
          USING ERRCODE = '23514',
                HINT = 'INSUFFICIENT_QUANTITY';
      END IF;

      v_current_stage_id := p_stage_id;
      v_current_stage_name := v_requested_stage_record.name;
      v_current_stage_price := v_requested_stage_record.price_cents;
    ELSE
      -- Auto-assign to current active stage based on availability
      -- Find the first stage with availability
      FOR v_stage_record IN 
        SELECT * FROM ticket_stages
        WHERE ticket_tier_id = p_ticket_tier_id
        ORDER BY order_index ASC
        FOR UPDATE
      LOOP
        -- Calculate cumulative sold quantity up to this stage
        SELECT COALESCE(SUM(sold_quantity), 0) INTO v_cumulative_quantity
        FROM ticket_stages
        WHERE ticket_tier_id = p_ticket_tier_id
          AND order_index < v_stage_record.order_index;

        v_stage_start_quantity := v_cumulative_quantity;
        v_stage_end_quantity := v_cumulative_quantity + v_stage_record.quantity;

        -- Count tickets reserved by pending/approved RSVPs in this stage range
        SELECT COALESCE(SUM(r.requested_quantity), 0) INTO v_reserved_by_rsvps
        FROM rsvps r
        JOIN ticket_stages ts ON r.stage_id = ts.id
        WHERE r.ticket_tier_id = p_ticket_tier_id
          AND r.status IN ('pending', 'approved')
          AND ts.order_index >= v_stage_record.order_index
          AND ts.order_index < v_stage_record.order_index + 1;

        v_total_sold_and_reserved := v_stage_start_quantity + COALESCE(v_stage_record.sold_quantity, 0) + v_reserved_by_rsvps;
        v_available_in_current_stage := v_stage_record.quantity - v_total_sold_and_reserved;

        IF v_available_in_current_stage > 0 THEN
          -- Found an available stage
          v_current_stage_id := v_stage_record.id;
          v_current_stage_name := v_stage_record.name;
          v_current_stage_price := v_stage_record.price_cents;
          
          -- Get fee_percentage from stage if available
          v_fee_percentage := COALESCE(
            v_stage_record.fee_percentage,
            v_fee_percentage
          );
          
          EXIT; -- Exit loop once we find an available stage
        END IF;
      END LOOP;

      -- Validate we found an active stage with availability
      IF v_current_stage_id IS NULL OR v_available_in_current_stage <= 0 THEN
        RAISE EXCEPTION 'This ticket tier is sold out'
          USING ERRCODE = '23514',
                HINT = 'SOLD_OUT';
      END IF;

      -- Validate quantity against current stage availability
      IF p_quantity > v_available_in_current_stage THEN
        RAISE EXCEPTION 'Only % ticket(s) available at the current "%" price ($%). Please adjust your quantity.',
          v_available_in_current_stage, v_current_stage_name, (v_current_stage_price / 100.0)
          USING ERRCODE = '23514',
                HINT = 'INSUFFICIENT_QUANTITY';
      END IF;
    END IF;

  ELSE
    -- No stages - validate against tier-level availability
    -- Count tickets reserved by pending/approved RSVPs for this tier
    SELECT COALESCE(SUM(requested_quantity), 0) INTO v_reserved_by_rsvps
    FROM rsvps
    WHERE ticket_tier_id = p_ticket_tier_id
      AND status IN ('pending', 'approved');

    v_available_in_current_stage := v_tier_record.quantity_total - COALESCE(v_tier_record.quantity_sold, 0) - v_reserved_by_rsvps;

    IF v_available_in_current_stage <= 0 THEN
      RAISE EXCEPTION 'This ticket tier is sold out'
        USING ERRCODE = '23514',
              HINT = 'SOLD_OUT';
    END IF;

    IF p_quantity > v_available_in_current_stage THEN
      RAISE EXCEPTION 'Only % tickets available for this tier', v_available_in_current_stage
        USING ERRCODE = '23514',
              HINT = 'INSUFFICIENT_QUANTITY';
    END IF;
  END IF;

  -- All validations passed - create the RSVP with stage information and fee_percentage
  INSERT INTO rsvps (
    user_id,
    event_id,
    ticket_tier_id,
    requested_quantity,
    status,
    requested_at,
    stage_id,
    stage_name,
    stage_price_cents,
    fee_percentage
  ) VALUES (
    p_user_id,
    p_event_id,
    p_ticket_tier_id,
    p_quantity,
    'pending',
    NOW(),
    v_current_stage_id,
    v_current_stage_name,
    COALESCE(v_current_stage_price, v_tier_record.price_cents),
    v_fee_percentage
  )
  RETURNING id, requested_at INTO v_rsvp_id, v_requested_at;

  -- Return success with RSVP details including stage info
  RETURN jsonb_build_object(
    'success', true,
    'rsvp_id', v_rsvp_id,
    'status', 'pending',
    'requested_at', v_requested_at,
    'stage_id', v_current_stage_id,
    'stage_name', v_current_stage_name,
    'stage_price_cents', COALESCE(v_current_stage_price, v_tier_record.price_cents),
    'fee_percentage', v_fee_percentage
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Any error will trigger automatic rollback
    RAISE;
END;
$$;

-- Update atomic_create_hold_with_stage_validation to store fee_percentage
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
  v_cumulative_quantity INTEGER;
  v_stage_start INTEGER;
  v_stage_end INTEGER;
  v_sold_in_stage INTEGER;
  v_active_holds_in_stage INTEGER;
  v_available_in_stage INTEGER;
  v_hold_id UUID;
  v_result JSONB;
  v_fee_percentage NUMERIC(5,2) := 7.00; -- Default to current rate
BEGIN
  v_now := NOW();
  v_expires_at := v_now + (p_expires_minutes || ' minutes')::INTERVAL;

  -- Lock and get the ticket tier
  SELECT * INTO v_ticket_tier
  FROM ticket_tiers
  WHERE id = p_tier_id
    AND event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ticket tier not found'
    );
  END IF;

  -- Get fee_percentage from tier (or use default based on date)
  v_fee_percentage := COALESCE(
    v_ticket_tier.fee_percentage,
    CASE 
      WHEN v_ticket_tier.created_at < '2025-11-08T00:00:00Z' THEN 10.00
      ELSE 7.00
    END
  );

  -- If stage_id is provided, validate that specific stage
  IF p_stage_id IS NOT NULL THEN
    SELECT * INTO v_stage
    FROM ticket_stages
    WHERE id = p_stage_id
      AND ticket_tier_id = p_tier_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Requested stage not found for this tier'
      );
    END IF;

    -- Get fee_percentage from stage if available
    v_fee_percentage := COALESCE(
      v_stage.fee_percentage,
      v_fee_percentage
    );

    v_stage_name := v_stage.name;
    v_stage_price_cents := v_stage.price_cents;

    -- Calculate cumulative sold quantity up to this stage
    SELECT COALESCE(SUM(sold_quantity), 0) INTO v_cumulative_quantity
    FROM ticket_stages
    WHERE ticket_tier_id = p_tier_id
      AND order_index < v_stage.order_index;

    v_stage_start := v_cumulative_quantity;
    v_stage_end := v_cumulative_quantity + v_stage.quantity;

    -- Count tickets sold in this stage
    v_sold_in_stage := COALESCE(v_stage.sold_quantity, 0);

    -- Count active holds for this specific stage
    SELECT COALESCE(SUM(quantity), 0)
    INTO v_active_holds_in_stage
    FROM holds
    WHERE tier_id = p_tier_id
      AND stage_id = p_stage_id
      AND expires_at > v_now
      AND order_id IS NULL;

    v_available_in_stage := v_stage.quantity - v_sold_in_stage - v_active_holds_in_stage;

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

    v_available_in_stage := v_ticket_tier.quantity_total - v_ticket_tier.quantity_sold - v_active_holds_in_stage;

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

  -- All validations passed - create the hold with fee_percentage
  INSERT INTO holds (
    user_id,
    event_id,
    tier_id,
    quantity,
    expires_at,
    stage_id,
    stage_name,
    stage_price_cents,
    fee_percentage
  ) VALUES (
    p_user_id,
    p_event_id,
    p_tier_id,
    p_quantity,
    v_expires_at,
    p_stage_id,
    v_stage_name,
    v_stage_price_cents,
    v_fee_percentage
  )
  RETURNING id INTO v_hold_id;

  -- Build success response
  v_result := jsonb_build_object(
    'success', true,
    'hold_id', v_hold_id,
    'expires_at', v_expires_at,
    'stage_name', v_stage_name,
    'stage_price_cents', v_stage_price_cents,
    'available_in_stage', v_available_in_stage,
    'fee_percentage', v_fee_percentage
  );

  RETURN v_result;
END;
$$;

-- Update complete_hold_purchase to store fee_percentage in orders
-- Note: This function signature matches the latest version from 20251104200000_fix_complete_hold_purchase_stage_pricing_validation.sql
CREATE OR REPLACE FUNCTION complete_hold_purchase(
  p_hold_id UUID,
  p_user_id UUID,
  p_quantity INTEGER,
  p_unit_price_cents INTEGER,
  p_subtotal_cents INTEGER,
  p_processing_fee_cents INTEGER,
  p_total_cents INTEGER,
  p_organization_id UUID,
  p_event_id UUID,
  p_tier_id UUID,
  p_attendee_name TEXT,
  p_attendee_email TEXT,
  p_ticket_data JSONB,
  p_promotional_code_id UUID DEFAULT NULL,
  p_discount_amount_cents INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id UUID;
  v_hold_record RECORD;
  v_tier_record RECORD;
  v_stage_record RECORD;
  v_promo_record RECORD;
  v_ticket JSONB;
  v_ticket_ids UUID[] := '{}';
  v_created_ticket_id UUID;
  v_new_quantity_sold INTEGER;
  v_expected_unit_price_cents INTEGER;
  v_expected_subtotal_cents INTEGER;
  v_expected_discount_cents INTEGER;
  v_expected_total_cents INTEGER;
  v_stage_id UUID := NULL;
  v_stage_name TEXT := NULL;
  v_stage_price_cents INTEGER := NULL;
  v_fee_percentage NUMERIC(5,2) := 7.00; -- Default to current rate
BEGIN
  -- Validate hold exists, hasn't expired, and hasn't been used
  SELECT * INTO v_hold_record
  FROM holds
  WHERE id = p_hold_id
    AND user_id = p_user_id
    AND expires_at > NOW()
    AND order_id IS NULL
  FOR UPDATE; -- Lock the row to prevent concurrent updates

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hold not found, expired, or already used'
      USING ERRCODE = 'P0002';
  END IF;

  -- Extract stage information from hold if it exists
  v_stage_id := v_hold_record.stage_id;
  v_stage_name := v_hold_record.stage_name;
  v_stage_price_cents := v_hold_record.stage_price_cents;
  
  -- Get fee_percentage from hold (or infer from tier/stage)
  v_fee_percentage := COALESCE(
    v_hold_record.fee_percentage,
    7.00 -- Default to current rate
  );

  -- Get and lock the ticket tier row
  SELECT * INTO v_tier_record
  FROM ticket_tiers
  WHERE id = p_tier_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket tier not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- If we don't have fee_percentage from hold, try to get it from tier/stage
  IF v_fee_percentage = 7.00 AND v_hold_record.fee_percentage IS NULL THEN
    IF v_stage_id IS NOT NULL THEN
      -- Try to get fee_percentage from stage
      SELECT fee_percentage INTO v_fee_percentage
      FROM ticket_stages
      WHERE id = v_stage_id;
      
      -- If stage doesn't have it, fall back to tier
      IF v_fee_percentage IS NULL THEN
        v_fee_percentage := COALESCE(
          v_tier_record.fee_percentage,
          CASE 
            WHEN v_tier_record.created_at < '2025-11-08T00:00:00Z' THEN 10.00
            ELSE 7.00
          END
        );
      END IF;
    ELSE
      -- No stage, use tier fee_percentage
      v_fee_percentage := COALESCE(
        v_tier_record.fee_percentage,
        CASE 
          WHEN v_tier_record.created_at < '2025-11-08T00:00:00Z' THEN 10.00
          ELSE 7.00
        END
      );
    END IF;
  END IF;

  -- Validate sufficient inventory
  v_new_quantity_sold := v_tier_record.quantity_sold + p_quantity;
  IF v_new_quantity_sold > v_tier_record.quantity_total THEN
    RAISE EXCEPTION 'Insufficient ticket inventory. Available: %, Requested: %',
      (v_tier_record.quantity_total - v_tier_record.quantity_sold), p_quantity
      USING ERRCODE = '23514';
  END IF;

  -- Compute expected monetary values from database (CRITICAL: prevents tampering)
  -- FIX: Use stage price if available, otherwise use tier base price
  IF v_stage_price_cents IS NOT NULL THEN
    v_expected_unit_price_cents := v_stage_price_cents;
  ELSE
    v_expected_unit_price_cents := v_tier_record.price_cents;
  END IF;
  
  v_expected_subtotal_cents := v_expected_unit_price_cents * p_quantity;
  
  -- Validate promotional code and discount if provided
  v_expected_discount_cents := 0;
  IF p_promotional_code_id IS NOT NULL THEN
    SELECT * INTO v_promo_record
    FROM promotional_codes
    WHERE id = p_promotional_code_id
      AND event_id = p_event_id
      AND usage_count < usage_limit
    FOR UPDATE;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Promotional code not found, invalid, or usage limit reached'
        USING ERRCODE = 'P0002';
    END IF;
    
    -- Compute expected discount from promotional code percentage
    -- Use ROUND() to match the rounding logic in validate-promo-code API
    v_expected_discount_cents := LEAST(
      ROUND((v_expected_subtotal_cents * v_promo_record.discount_percentage)::NUMERIC / 100),
      v_expected_subtotal_cents
    );
    
    -- Validate caller-supplied discount matches computed discount
    IF p_discount_amount_cents <> v_expected_discount_cents THEN
      RAISE EXCEPTION 'Discount amount mismatch: expected % cents, got % cents',
        v_expected_discount_cents, p_discount_amount_cents
        USING ERRCODE = '22000';
    END IF;
  ELSIF p_discount_amount_cents <> 0 THEN
    -- Discount provided without promotional code
    RAISE EXCEPTION 'Discount amount provided without valid promotional code'
      USING ERRCODE = '22000';
  END IF;
  
  -- Compute expected total (subtotal + fees - discount)
  v_expected_total_cents := GREATEST(0, 
    v_expected_subtotal_cents + p_processing_fee_cents - v_expected_discount_cents
  );
  
  -- Validate caller-supplied unit price matches database price
  IF p_unit_price_cents <> v_expected_unit_price_cents THEN
    RAISE EXCEPTION 'Unit price mismatch: expected % cents (stage_price: % cents, tier_price: % cents), got % cents',
      v_expected_unit_price_cents, v_stage_price_cents, v_tier_record.price_cents, p_unit_price_cents
      USING ERRCODE = '22000';
  END IF;
  
  -- Validate caller-supplied subtotal matches computed subtotal
  IF p_subtotal_cents <> v_expected_subtotal_cents THEN
    RAISE EXCEPTION 'Subtotal mismatch: expected % cents (% × %), got % cents',
      v_expected_subtotal_cents, v_expected_unit_price_cents, p_quantity, p_subtotal_cents
      USING ERRCODE = '22000';
  END IF;
  
  -- Validate caller-supplied total matches computed total
  IF p_total_cents <> v_expected_total_cents THEN
    RAISE EXCEPTION 'Total mismatch: expected % cents, got % cents',
      v_expected_total_cents, p_total_cents
      USING ERRCODE = '22000';
  END IF;

  -- Validate ticket_data count matches requested quantity
  -- Explicit NULL check: p_ticket_data cannot be NULL when quantity > 0
  IF p_ticket_data IS NULL AND p_quantity > 0 THEN
    RAISE EXCEPTION 'p_ticket_data is NULL but p_quantity > 0'
      USING ERRCODE = '22023'; -- invalid_parameter_value
  END IF;
  
  -- Validate ticket_data array length matches requested quantity (for non-NULL p_ticket_data)
  IF p_ticket_data IS NOT NULL AND jsonb_array_length(p_ticket_data) != p_quantity THEN
    RAISE EXCEPTION 'Ticket data count (%) does not match requested quantity (%)', 
      jsonb_array_length(p_ticket_data), p_quantity
      USING ERRCODE = '22023'; -- invalid_parameter_value
  END IF;

  -- Create deterministic idempotency key from hold_id and user_id using UUID v5
  DECLARE
    v_namespace_app UUID := 'a8b7c6d5-e4f3-5a2b-9c8d-7e6f5a4b3c2d'::uuid;
    v_idempotency_key UUID := extensions.uuid_generate_v5(v_namespace_app, p_hold_id::TEXT || '_' || p_user_id::TEXT);
  BEGIN
    -- Create the order with fee_percentage (all values have been validated)
    INSERT INTO orders (
      user_id,
      organization_id,
      event_id,
      ticket_tier_id,
      quantity,
      unit_price_cents,
      subtotal_cents,
      fees_cents,
      total_cents,
      total_amount_cents,
      processing_fee_cents,
      promotional_code_id,
      discount_amount_cents,
      fee_percentage,
      status,
      payment_method,
      idempotency_key
    ) VALUES (
      p_user_id,
      p_organization_id,
      p_event_id,
      p_tier_id,
      p_quantity,
      v_expected_unit_price_cents,  -- Use validated value
      v_expected_subtotal_cents,     -- Use validated value
      p_processing_fee_cents,
      v_expected_total_cents,        -- Use validated value
      v_expected_total_cents,        -- Use validated value
      p_processing_fee_cents,
      p_promotional_code_id,
      v_expected_discount_cents,     -- Use validated value
      v_fee_percentage,              -- Store fee_percentage
      'completed',
      'direct',
      v_idempotency_key
    )
    RETURNING id INTO v_order_id;

  EXCEPTION
    WHEN unique_violation THEN
      SELECT id INTO v_order_id
      FROM orders
      WHERE idempotency_key = v_idempotency_key;
      
      IF v_order_id IS NULL THEN
        RAISE;
      END IF;
      
      -- Return existing order with its ticket IDs
      SELECT array_agg(id) INTO v_ticket_ids
      FROM tickets
      WHERE order_id = v_order_id;
      
      RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'ticket_ids', to_jsonb(COALESCE(v_ticket_ids, '{}'::UUID[])),
        'is_retry', true
      );
  END;

  -- Update promotional code usage count if used
  IF p_promotional_code_id IS NOT NULL THEN
    UPDATE promotional_codes
    SET usage_count = usage_count + 1
    WHERE id = p_promotional_code_id;
  END IF;

  -- Update hold with order_id to mark as used
  UPDATE holds
  SET order_id = v_order_id,
      updated_at = NOW()
  WHERE id = p_hold_id;

  -- Update ticket tier quantity_sold
  UPDATE ticket_tiers
  SET quantity_sold = v_new_quantity_sold,
      updated_at = NOW()
  WHERE id = p_tier_id;

  -- Update stage sold_quantity if this hold was for a specific stage
  IF v_stage_id IS NOT NULL THEN
    UPDATE ticket_stages
    SET sold_quantity = sold_quantity + p_quantity,
        updated_at = NOW()
    WHERE id = v_stage_id;
    
    -- Enforce data integrity: stage referenced by hold must exist
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Stage % not found for hold % (tier: %, quantity: %), data integrity violation',
        v_stage_id, p_hold_id, p_tier_id, p_quantity
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Create tickets from the ticket_data array, including stage metadata
  FOR v_ticket IN SELECT * FROM jsonb_array_elements(p_ticket_data)
  LOOP
    INSERT INTO tickets (
      order_id,
      ticket_tier_id,
      user_id,
      event_id,
      attendee_name,
      attendee_email,
      status,
      qr_token,
      qr_code,
      metadata
    ) VALUES (
      v_order_id,
      p_tier_id,
      p_user_id,
      p_event_id,
      p_attendee_name,
      p_attendee_email,
      'issued',
      (v_ticket->>'qr_token')::uuid,
      v_ticket->>'qr_code',
      -- Include stage info in ticket metadata if available
      CASE 
        WHEN v_stage_id IS NOT NULL THEN 
          jsonb_build_object(
            'stage_id', v_stage_id,
            'stage_name', v_stage_name,
            'stage_price_cents', v_stage_price_cents
          )
        ELSE NULL
      END
    )
    RETURNING id INTO v_created_ticket_id;

    v_ticket_ids := array_append(v_ticket_ids, v_created_ticket_id);
  END LOOP;

  -- Return success with order_id and ticket_ids
  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'ticket_ids', to_jsonb(v_ticket_ids),
    'is_retry', false
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- Any error will trigger automatic rollback of the entire transaction
    RAISE;
END;
$$;

