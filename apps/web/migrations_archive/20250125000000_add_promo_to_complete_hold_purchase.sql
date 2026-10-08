-- Migration: Update complete_hold_purchase function to support promotional codes
-- Description: Add promotional_code_id and discount_amount_cents parameters to the atomic purchase function

-- Drop the old function (note: this is safe since we're recreating it immediately)
DROP FUNCTION IF EXISTS complete_hold_purchase(UUID, UUID, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, UUID, UUID, UUID, TEXT, TEXT, JSONB);

-- Recreate the function with promotional code support
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
  v_ticket JSONB;
  v_ticket_ids UUID[] := '{}';
  v_created_ticket_id UUID;
  v_new_quantity_sold INTEGER;
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

  -- Create deterministic idempotency key from hold_id and user_id using UUID v5
  -- This ensures retries with same hold_id won't create duplicate orders
  -- Using a custom namespace UUID for this application-specific function
  -- RFC 4122 recommends using standard namespaces (DNS, URL, OID, X500) only for their intended purposes
  DECLARE
    v_namespace_app UUID := 'a8b7c6d5-e4f3-5a2b-9c8d-7e6f5a4b3c2d'::uuid;  -- Custom namespace for complete_hold_purchase
    v_idempotency_key UUID := extensions.uuid_generate_v5(v_namespace_app, p_hold_id::TEXT || '_' || p_user_id::TEXT);
  BEGIN
    -- Create the order with promotional code support
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
      p_unit_price_cents,
      p_subtotal_cents,
      p_processing_fee_cents,
      p_total_cents,
      p_total_cents,
      p_processing_fee_cents,
      p_promotional_code_id,
      p_discount_amount_cents,
      'completed',
      'direct',
      v_idempotency_key
    )
    RETURNING id INTO v_order_id;

  EXCEPTION
    WHEN unique_violation THEN
      -- If idempotency key already exists, return the existing order
      SELECT id INTO v_order_id
      FROM orders
      WHERE idempotency_key = v_idempotency_key;
      
      IF v_order_id IS NULL THEN
        RAISE;
      END IF;
      
      -- Return early with existing order info
      RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'is_retry', true
      );
  END;

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
      (v_ticket->>'qr_token')::uuid,  -- Cast text to UUID
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
    -- Any error will trigger automatic rollback of the entire transaction
    -- No orphaned orders, holds, or tickets will be created
    RAISE;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION complete_hold_purchase(UUID, UUID, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, UUID, UUID, UUID, TEXT, TEXT, JSONB, UUID, INTEGER) IS 
'Atomically completes a hold purchase by creating an order, updating the hold, updating ticket tier inventory, and creating tickets.
If any step fails, the entire transaction is automatically rolled back.
Uses deterministic idempotency key (hold_id + user_id) to prevent duplicate orders on retries.
Supports promotional codes with discount_amount_cents parameter.
Returns JSONB with order_id and ticket_ids on success. Raises exceptions on failures which trigger automatic rollback.';

-- Set search_path for security
ALTER FUNCTION complete_hold_purchase(UUID, UUID, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, UUID, UUID, UUID, TEXT, TEXT, JSONB, UUID, INTEGER) SET search_path = public, pg_temp;

