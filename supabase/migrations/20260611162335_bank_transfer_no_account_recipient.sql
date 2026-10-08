-- W7-H2 (3b): allow bank-transfer orders to account-less recipients

-- 1) orders schema
ALTER TABLE orders ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name  text;

ALTER TABLE orders ADD CONSTRAINT orders_recipient_present_check
  CHECK (user_id IS NOT NULL OR customer_email IS NOT NULL);

-- 2) RPC: accept an account-less recipient (customer_email/name), drop the
--    hard user_id null-check, keep everything else (incl. W7-H3 custom price).
DROP FUNCTION IF EXISTS public.create_bank_transfer_order_atomic(
  uuid, uuid, uuid, uuid, integer, integer, integer, integer, integer, text, text, uuid);

CREATE OR REPLACE FUNCTION public.create_bank_transfer_order_atomic(
  p_user_id uuid,
  p_organization_id uuid,
  p_event_id uuid,
  p_ticket_tier_id uuid,
  p_quantity integer,
  p_unit_price_cents integer,
  p_subtotal_cents integer,
  p_fees_cents integer,
  p_total_cents integer,
  p_idempotency_key text,
  p_tickets text,
  p_stage_id uuid DEFAULT NULL::uuid,
  p_customer_email text DEFAULT NULL::text,
  p_customer_name text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
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
  v_needed_capacity INTEGER;
  v_stage_current_sold INTEGER;
  v_stage_capacity INTEGER;
  v_stage_available INTEGER;
  v_stage_needed_capacity INTEGER;
BEGIN
  -- Input validation: Fail fast with clear error messages

  -- W7-H2 (3b): require a recipient -- either an account or a customer email.
  IF p_user_id IS NULL AND (p_customer_email IS NULL OR LENGTH(TRIM(p_customer_email)) = 0) THEN
    RAISE EXCEPTION 'either user_id or customer_email is required';
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
  IF p_subtotal_cents::BIGINT != (p_unit_price_cents::BIGINT * p_quantity::BIGINT) THEN
    RAISE EXCEPTION 'subtotal_cents must equal unit_price_cents multiplied by quantity';
  END IF;

  -- Validate idempotency key
  IF p_idempotency_key IS NULL OR LENGTH(TRIM(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key cannot be null or empty';
  END IF;

  -- Validate idempotency_key is valid UUID format
  BEGIN
    PERFORM p_idempotency_key::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'idempotency_key must be a valid UUID format';
  END;

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

  IF jsonb_array_length(v_tickets_array) != p_quantity THEN
    RAISE EXCEPTION 'tickets array length must equal quantity';
  END IF;

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
    customer_email,
    customer_name,
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
    p_total_cents,
    'completed',
    'bank_transfer',
    'bank_transfer',
    p_idempotency_key::uuid,
    'USD',
    p_customer_email,
    p_customer_name,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_order_id;

  -- 2. Create tickets and capture inserted rows
  FOR v_ticket IN SELECT * FROM jsonb_array_elements(v_tickets_array)
  LOOP
    -- Validate qr_token is valid UUID format before insertion
    IF v_ticket->>'qr_token' IS NULL THEN
      RAISE EXCEPTION 'ticket qr_token cannot be null';
    END IF;

    BEGIN
      PERFORM (v_ticket->>'qr_token')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'ticket qr_token must be a valid UUID format: %', v_ticket->>'qr_token';
    END;

    -- Validate status is a valid value
    IF v_ticket->>'status' IS NULL OR v_ticket->>'status' NOT IN ('issued', 'used', 'cancelled', 'transferred') THEN
      RAISE EXCEPTION 'ticket status must be one of: issued, used, cancelled, transferred. Got: %', COALESCE(v_ticket->>'status', 'null');
    END IF;

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
      COALESCE(v_ticket->>'attendee_name', p_customer_name, p_customer_email),
      COALESCE(v_ticket->>'attendee_email', p_customer_email),
      v_ticket->>'status',
      (v_ticket->>'qr_token')::uuid,
      NULLIF(v_ticket->>'qr_code', 'null')::text,
      (v_ticket->'metadata')::JSONB,
      NOW(),
      NOW()
    )
    RETURNING * INTO v_inserted_ticket;

    v_created_tickets := array_append(
      v_created_tickets,
      to_jsonb(v_inserted_ticket)
    );
  END LOOP;

  -- 3. Lock ticket tier and AUTO-EXPAND capacity if needed
  SELECT quantity_sold, quantity_total
  INTO v_current_sold, v_total_capacity
  FROM ticket_tiers
  WHERE id = p_ticket_tier_id
  FOR UPDATE;

  IF v_total_capacity IS NOT NULL THEN
    v_available_capacity := v_total_capacity - v_current_sold;

    IF v_available_capacity < p_quantity THEN
      v_needed_capacity := p_quantity - v_available_capacity;

      UPDATE ticket_tiers
      SET
        quantity_total = quantity_total + v_needed_capacity,
        updated_at = NOW()
      WHERE id = p_ticket_tier_id;
    END IF;
  END IF;

  UPDATE ticket_tiers
  SET
    quantity_sold = quantity_sold + p_quantity,
    updated_at = NOW()
  WHERE id = p_ticket_tier_id
  RETURNING quantity_sold INTO v_new_sold;

  -- 4. Lock and update ticket_stages if stage is specified
  IF p_stage_id IS NOT NULL THEN
    SELECT sold_quantity, quantity
    INTO v_stage_current_sold, v_stage_capacity
    FROM ticket_stages
    WHERE id = p_stage_id
    FOR UPDATE;

    IF v_stage_capacity IS NOT NULL THEN
      v_stage_available := v_stage_capacity - v_stage_current_sold;

      IF v_stage_available < p_quantity THEN
        v_stage_needed_capacity := p_quantity - v_stage_available;

        UPDATE ticket_stages
        SET
          quantity = quantity + v_stage_needed_capacity,
          updated_at = NOW()
        WHERE id = p_stage_id;
      END IF;
    END IF;

    UPDATE ticket_stages
    SET
      sold_quantity = sold_quantity + p_quantity,
      updated_at = NOW()
    WHERE id = p_stage_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'tickets', v_created_tickets,
    'new_quantity_sold', v_new_sold
  );

EXCEPTION
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

  WHEN OTHERS THEN
    RAISE WARNING 'Unexpected error in create_bank_transfer_order_atomic: SQLSTATE=%, SQLERRM=%', SQLSTATE, SQLERRM;
    RAISE;
END;
$function$;
