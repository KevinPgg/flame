-- Migration: Add ticket_data validation to complete_hold_purchase function
-- Description: Validate ticket payload shape and cardinality to prevent silent failures
-- Security: Prevents inventory/billing mismatches

-- Drop the existing function
DROP FUNCTION IF EXISTS complete_hold_purchase(UUID, UUID, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, UUID, UUID, UUID, TEXT, TEXT, JSONB, UUID, INTEGER);

-- Recreate with ticket_data validation
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
  v_promo_record RECORD;
  v_ticket JSONB;
  v_ticket_ids UUID[] := '{}';
  v_created_ticket_id UUID;
  v_new_quantity_sold INTEGER;
  v_expected_unit_price_cents INTEGER;
  v_expected_subtotal_cents INTEGER;
  v_expected_discount_cents INTEGER;
  v_expected_total_cents INTEGER;
BEGIN
  -- Validate hold exists, hasn't expired, and hasn't been used
  SELECT * INTO v_hold_record
  FROM holds
  WHERE id = p_hold_id
    AND user_id = p_user_id
    AND expires_at > NOW()
    AND order_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hold not found, expired, or already used'
      USING ERRCODE = 'P0002';
  END IF;

  -- Get and lock the ticket tier row
  SELECT * INTO v_tier_record
  FROM ticket_tiers
  WHERE id = p_tier_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket tier not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- Validate sufficient inventory
  v_new_quantity_sold := v_tier_record.quantity_sold + p_quantity;
  IF v_new_quantity_sold > v_tier_record.quantity_total THEN
    RAISE EXCEPTION 'Insufficient ticket inventory. Available: %, Requested: %',
      (v_tier_record.quantity_total - v_tier_record.quantity_sold), p_quantity
      USING ERRCODE = '23514';
  END IF;

  -- Compute expected monetary values from database (CRITICAL: prevents tampering)
  v_expected_unit_price_cents := v_tier_record.price_cents;
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
    RAISE EXCEPTION 'Unit price mismatch: expected % cents, got % cents',
      v_expected_unit_price_cents, p_unit_price_cents
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

  -- Create deterministic idempotency key
  DECLARE
    v_namespace_app UUID := 'a8b7c6d5-e4f3-5a2b-9c8d-7e6f5a4b3c2d'::uuid;
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
      status,
      payment_method,
      idempotency_key
    ) VALUES (
      p_user_id,
      p_organization_id,
      p_event_id,
      p_tier_id,
      p_quantity,
      v_expected_unit_price_cents,
      v_expected_subtotal_cents,
      p_processing_fee_cents,
      v_expected_total_cents,
      v_expected_total_cents,
      p_processing_fee_cents,
      p_promotional_code_id,
      v_expected_discount_cents,
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

  -- Validate ticket payload shape and cardinality
  IF jsonb_typeof(p_ticket_data) <> 'array' THEN
    RAISE EXCEPTION 'ticket_data must be a JSON array'
      USING ERRCODE = '22023';
  END IF;
  
  IF jsonb_array_length(p_ticket_data) <> p_quantity THEN
    RAISE EXCEPTION 'ticket_data length (%) must equal quantity (%)',
      jsonb_array_length(p_ticket_data), p_quantity
      USING ERRCODE = '22023';
  END IF;

  -- Create tickets from the ticket_data array
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
      qr_code
    ) VALUES (
      v_order_id,
      p_tier_id,
      p_user_id,
      p_event_id,
      p_attendee_name,
      p_attendee_email,
      'issued',
      (v_ticket->>'qr_token')::uuid,
      v_ticket->>'qr_code'
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
    RAISE;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION complete_hold_purchase(UUID, UUID, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, UUID, UUID, UUID, TEXT, TEXT, JSONB, UUID, INTEGER) IS 
'Atomically completes a hold purchase with full validation.
SECURITY: Validates all monetary amounts, promotional codes, and ticket data payload.
Ensures ticket_data is a JSON array with length matching p_quantity.
Prevents price tampering, inventory mismatches, and silent failures.
Uses deterministic idempotency key (hold_id + user_id) to prevent duplicate orders on retries.
Returns JSONB with order_id and ticket_ids on success.';

-- Set search_path for security
ALTER FUNCTION complete_hold_purchase(UUID, UUID, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, UUID, UUID, UUID, TEXT, TEXT, JSONB, UUID, INTEGER) SET search_path = public, pg_temp;

