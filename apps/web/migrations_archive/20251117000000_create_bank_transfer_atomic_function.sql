-- Migration: Create atomic function for bank transfer orders
-- This ensures orders, tickets, and inventory updates happen atomically

CREATE OR REPLACE FUNCTION create_bank_transfer_order_atomic(
  p_user_id UUID,
  p_organization_id UUID,
  p_event_id UUID,
  p_ticket_tier_id UUID,
  p_quantity INTEGER,
  p_unit_price_cents INTEGER,
  p_subtotal_cents INTEGER,
  p_fees_cents INTEGER,
  p_total_cents INTEGER,
  p_idempotency_key TEXT,
  p_tickets TEXT, -- JSON string of tickets array
  p_stage_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id UUID;
  v_ticket JSONB;
  v_tickets_array JSONB;
  v_created_tickets JSONB[] := '{}';
  v_inserted_ticket RECORD;
  v_new_sold INTEGER;
  v_current_sold INTEGER;
  v_total_capacity INTEGER;
  v_available_capacity INTEGER;
  v_stage_current_sold INTEGER;
  v_stage_capacity INTEGER;
  v_stage_available INTEGER;
BEGIN
  -- Input validation: Fail fast with clear error messages
  
  -- Validate required UUIDs are not null
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id cannot be null';
  END IF;
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id cannot be null';
  END IF;
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'event_id cannot be null';
  END IF;
  IF p_ticket_tier_id IS NULL THEN
    RAISE EXCEPTION 'ticket_tier_id cannot be null';
  END IF;
  
  -- Validate quantity
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'quantity must be greater than 0';
  END IF;
  IF p_quantity > 1000 THEN
    RAISE EXCEPTION 'quantity cannot exceed 1000';
  END IF;
  
  -- Validate monetary fields are non-negative
  IF p_unit_price_cents IS NULL OR p_unit_price_cents < 0 THEN
    RAISE EXCEPTION 'unit_price_cents must be non-negative';
  END IF;
  IF p_subtotal_cents IS NULL OR p_subtotal_cents < 0 THEN
    RAISE EXCEPTION 'subtotal_cents must be non-negative';
  END IF;
  IF p_fees_cents IS NULL OR p_fees_cents < 0 THEN
    RAISE EXCEPTION 'fees_cents must be non-negative';
  END IF;
  IF p_total_cents IS NULL OR p_total_cents < 0 THEN
    RAISE EXCEPTION 'total_cents must be non-negative';
  END IF;
  
  -- Validate monetary consistency (subtotal + fees = total)
  IF (p_subtotal_cents + p_fees_cents) != p_total_cents THEN
    RAISE EXCEPTION 'total_cents must equal subtotal_cents plus fees_cents';
  END IF;
  
  -- Validate subtotal matches unit_price * quantity
  -- Use BIGINT arithmetic to prevent integer overflow when multiplying
  IF p_subtotal_cents::BIGINT != (p_unit_price_cents::BIGINT * p_quantity::BIGINT) THEN
    RAISE EXCEPTION 'subtotal_cents must equal unit_price_cents multiplied by quantity';
  END IF;
  
  -- Validate idempotency key
  IF p_idempotency_key IS NULL OR LENGTH(TRIM(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key cannot be null or empty';
  END IF;
  
  -- Validate and parse tickets JSON
  BEGIN
    v_tickets_array := p_tickets::JSONB;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'tickets parameter must be valid JSON';
  END;
  
  IF jsonb_typeof(v_tickets_array) != 'array' THEN
    RAISE EXCEPTION 'tickets must be a JSON array';
  END IF;
  
  IF jsonb_array_length(v_tickets_array) = 0 THEN
    RAISE EXCEPTION 'tickets array cannot be empty';
  END IF;
  
  -- Validate tickets array length matches quantity
  IF jsonb_array_length(v_tickets_array) != p_quantity THEN
    RAISE EXCEPTION 'tickets array length must equal quantity';
  END IF;
  
  -- Start transaction (implicit in function)
  
  -- 1. Create order
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
    status,
    payment_provider,
    payment_method,
    idempotency_key,
    currency,
    created_at,
    updated_at
  ) VALUES (
    p_user_id,
    p_organization_id,
    p_event_id,
    p_ticket_tier_id,
    p_quantity,
    p_unit_price_cents,
    p_subtotal_cents,
    p_fees_cents,
    p_total_cents,
    p_total_cents, -- Also set total_amount_cents for consistency with rest of codebase
    'completed',
    'bank_transfer',
    'bank_transfer',
    p_idempotency_key::uuid,
    'USD',
    NOW(),
    NOW()
  )
  RETURNING id INTO v_order_id;

  -- 2. Create tickets and capture inserted rows
  -- Note: v_tickets_array was already parsed above, no need to re-parse
  FOR v_ticket IN SELECT * FROM jsonb_array_elements(v_tickets_array)
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
      metadata,
      created_at,
      updated_at
    ) VALUES (
      v_order_id,
      p_ticket_tier_id,
      p_user_id,
      p_event_id,
      v_ticket->>'attendee_name',
      v_ticket->>'attendee_email',
      v_ticket->>'status',
      (v_ticket->>'qr_token')::uuid,
      NULLIF(v_ticket->>'qr_code', 'null')::text, -- Allow null qr_code, will be updated later
      (v_ticket->'metadata')::JSONB,
      NOW(),
      NOW()
    )
    RETURNING * INTO v_inserted_ticket;
    
    -- Append the actual inserted row (with DB-assigned fields like id, timestamps) as JSONB
    v_created_tickets := array_append(
      v_created_tickets,
      to_jsonb(v_inserted_ticket)
    );
  END LOOP;

  -- 3. Lock ticket tier row and verify availability before updating
  -- This prevents race conditions where concurrent requests could oversell
  SELECT quantity_sold, quantity_total
  INTO v_current_sold, v_total_capacity
  FROM ticket_tiers
  WHERE id = p_ticket_tier_id
  FOR UPDATE;

  -- Check if we have enough tickets available
  IF v_total_capacity IS NOT NULL THEN
    v_available_capacity := v_total_capacity - v_current_sold;
    
    IF v_available_capacity < p_quantity THEN
      RAISE EXCEPTION 'Not enough tickets available. Requested: %, Available: %', 
        p_quantity, v_available_capacity;
    END IF;
  END IF;

  -- Now safely update the quantity_sold
  UPDATE ticket_tiers
  SET 
    quantity_sold = quantity_sold + p_quantity,
    updated_at = NOW()
  WHERE id = p_ticket_tier_id
  RETURNING quantity_sold INTO v_new_sold;

  -- 4. Lock and update ticket_stages sold_quantity if stage is specified
  IF p_stage_id IS NOT NULL THEN
    -- Lock the stage row and verify availability
    SELECT sold_quantity, quantity
    INTO v_stage_current_sold, v_stage_capacity
    FROM ticket_stages
    WHERE id = p_stage_id
    FOR UPDATE;
    
    -- Check stage capacity
    IF v_stage_capacity IS NOT NULL THEN
      v_stage_available := v_stage_capacity - v_stage_current_sold;
      
      IF v_stage_available < p_quantity THEN
        RAISE EXCEPTION 'Not enough tickets available in stage. Requested: %, Available: %', 
          p_quantity, v_stage_available;
      END IF;
    END IF;
    
    -- Now safely update the stage sold_quantity
    UPDATE ticket_stages
    SET 
      sold_quantity = sold_quantity + p_quantity,
      updated_at = NOW()
    WHERE id = p_stage_id;
  END IF;

  -- Return success with order and ticket info
  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'tickets', v_created_tickets,
    'new_quantity_sold', v_new_sold
  );

EXCEPTION
  -- Handle specific known errors with safe, generic messages
  WHEN unique_violation THEN
    RAISE LOG 'Unique constraint violation in create_bank_transfer_order_atomic: %', SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Duplicate order detected. Please try again with a different order.'
    );
  
  WHEN foreign_key_violation THEN
    RAISE LOG 'Foreign key violation in create_bank_transfer_order_atomic: %', SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid reference to user, event, or ticket tier. Please verify your data.'
    );
  
  WHEN check_violation THEN
    RAISE LOG 'Check constraint violation in create_bank_transfer_order_atomic: %', SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid data values. Please check your input and try again.'
    );
  
  WHEN not_null_violation THEN
    RAISE LOG 'Not null violation in create_bank_transfer_order_atomic: %', SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Required field is missing. Please provide all necessary information.'
    );
  
  -- For unexpected/critical errors, log and re-raise so they surface to operators
  WHEN OTHERS THEN
    RAISE WARNING 'Unexpected error in create_bank_transfer_order_atomic: SQLSTATE=%, SQLERRM=%', SQLSTATE, SQLERRM;
    -- Re-raise the exception to surface it to the caller/operator
    RAISE;
END;
$$;

-- Add comment
COMMENT ON FUNCTION create_bank_transfer_order_atomic IS 
  'Atomically creates a bank transfer order with tickets and updates inventory. Either all operations succeed or all fail.';

