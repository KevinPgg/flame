-- Migration: Add promoter_code parameter to complete_hold_purchase function
-- Description: Enable tracking of promoter codes for hold-based purchases

-- Drop the existing function with old signature
DROP FUNCTION IF EXISTS complete_hold_purchase(UUID, UUID, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, UUID, UUID, UUID, TEXT, TEXT, JSONB, UUID, INTEGER);

-- Recreate with promoter_code parameter
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
  p_discount_amount_cents INTEGER DEFAULT 0,
  p_promoter_code VARCHAR(50) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id UUID;
  v_hold_record RECORD;
  v_tier_record RECORD;
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
BEGIN
  -- Validate hold exists, hasn't expired, and hasn't been used
  SELECT * INTO v_hold_record
  FROM holds
  WHERE id = p_hold_id
    AND user_id = p_user_id
    AND expires_at > NOW()
    AND order_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hold not found, expired, or already used';
  END IF;

  -- Get tier record to determine expected price and check inventory
  SELECT * INTO v_tier_record
  FROM ticket_tiers
  WHERE id = p_tier_id
    AND event_id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket tier not found for event';
  END IF;

  -- Determine expected unit price: Use stage price if hold has one, otherwise tier price
  IF v_hold_record.stage_price_cents IS NOT NULL THEN
    v_expected_unit_price_cents := v_hold_record.stage_price_cents;
    v_stage_id := v_hold_record.stage_id;
    v_stage_price_cents := v_hold_record.stage_price_cents;
    
    -- Get stage name
    SELECT name INTO v_stage_name
    FROM ticket_stages
    WHERE id = v_hold_record.stage_id;
  ELSE
    v_expected_unit_price_cents := v_tier_record.price_cents;
  END IF;

  -- Validate the expected monetary values
  v_expected_subtotal_cents := v_expected_unit_price_cents * p_quantity;

  -- Promotional code validation if provided
  IF p_promotional_code_id IS NOT NULL THEN
    -- Get promo code details
    SELECT * INTO v_promo_record
    FROM promotional_codes
    WHERE id = p_promotional_code_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Promotional code not found';
    END IF;

    -- Calculate expected discount using ROUND() to match client-side Math.round() logic
    -- This ensures consistency with validate-promo-code API and prevents 1-cent rounding errors
    v_expected_discount_cents := ROUND((v_expected_subtotal_cents * v_promo_record.discount_percentage::NUMERIC) / 100);
  ELSE
    v_expected_discount_cents := 0;
  END IF;

  -- Calculate expected total (subtotal + fees - discount)
  v_expected_total_cents := v_expected_subtotal_cents + p_processing_fee_cents - v_expected_discount_cents;

  -- Validate the monetary values from client match expected values
  IF p_unit_price_cents != v_expected_unit_price_cents THEN
    RAISE EXCEPTION 'Unit price mismatch: expected % cents, got % cents', 
      v_expected_unit_price_cents, p_unit_price_cents;
  END IF;

  IF p_subtotal_cents != v_expected_subtotal_cents THEN
    RAISE EXCEPTION 'Subtotal mismatch: expected % cents, got % cents',
      v_expected_subtotal_cents, p_subtotal_cents;
  END IF;

  IF p_discount_amount_cents != v_expected_discount_cents THEN
    RAISE EXCEPTION 'Discount mismatch: expected % cents, got % cents',
      v_expected_discount_cents, p_discount_amount_cents;
  END IF;

  IF p_total_cents != v_expected_total_cents THEN
    RAISE EXCEPTION 'Total mismatch: expected % cents, got % cents',
      v_expected_total_cents, p_total_cents;
  END IF;

  -- Check if tier has enough available tickets
  IF v_tier_record.quantity_sold + p_quantity > v_tier_record.quantity_total THEN
    RAISE EXCEPTION 'Not enough tickets available';
  END IF;

  -- Validate ticket data
  IF p_ticket_data IS NULL OR jsonb_array_length(p_ticket_data) != p_quantity THEN
    RAISE EXCEPTION 'Invalid ticket data: expected % tickets', p_quantity;
  END IF;

  -- Create namespace UUID for deterministic UUIDs (v5)
  DECLARE
    v_namespace_app UUID := '6ba7b810-9dad-11d1-80b4-00c04fd430c8'::UUID;
    v_idempotency_key UUID := extensions.uuid_generate_v5(v_namespace_app, p_hold_id::TEXT || '_' || p_user_id::TEXT);
  BEGIN
    -- Create the order (all values have been validated)
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
      promoter_code,
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
      p_promoter_code,               -- Add promoter code
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
  SET quantity_sold = quantity_sold + p_quantity
  WHERE id = p_tier_id
  RETURNING quantity_sold INTO v_new_quantity_sold;

  -- Update stage quantity_sold if applicable
  IF v_stage_id IS NOT NULL THEN
    UPDATE ticket_stages
    SET sold_quantity = sold_quantity + p_quantity
    WHERE id = v_stage_id;
  END IF;

  -- Create tickets from the ticket_data array, including stage metadata
  FOR v_ticket IN SELECT * FROM jsonb_array_elements(p_ticket_data)
  LOOP
    INSERT INTO tickets (
      order_id,
      user_id,
      event_id,
      ticket_tier_id,
      attendee_name,
      attendee_email,
      qr_token,
      qr_code,
      metadata
    ) VALUES (
      v_order_id,
      p_user_id,
      p_event_id,
      p_tier_id,
      p_attendee_name,
      p_attendee_email,
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
        ELSE
          NULL
      END
    )
    RETURNING id INTO v_created_ticket_id;

    v_ticket_ids := array_append(v_ticket_ids, v_created_ticket_id);
  END LOOP;

  -- Return success with order and ticket IDs
  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'ticket_ids', to_jsonb(v_ticket_ids),
    'is_retry', false
  );
END;
$$;

-- Add comment explaining the update
COMMENT ON FUNCTION complete_hold_purchase IS 
  'Atomically completes a hold-based purchase with promoter tracking. Updated to include promoter_code parameter for tracking sales attributed to promoters.';

