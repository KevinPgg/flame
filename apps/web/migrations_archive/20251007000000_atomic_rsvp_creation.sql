-- Migration: Add atomic transaction function for creating RSVPs
-- This prevents race conditions where multiple concurrent RSVP requests
-- can exceed the available quantity for a ticket stage

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

    -- Count tickets reserved by pending/approved RSVPs for this tier
    SELECT COALESCE(SUM(requested_quantity), 0) INTO v_reserved_by_rsvps
    FROM rsvps
    WHERE ticket_tier_id = p_ticket_tier_id
      AND status IN ('pending', 'approved');

    v_total_sold_and_reserved := COALESCE(v_tier_record.quantity_sold, 0) + v_reserved_by_rsvps;

    -- If user requested a specific stage, validate that stage
    IF p_stage_id IS NOT NULL THEN
      -- Find and validate the requested stage
      v_cumulative_quantity := 0;
      v_current_stage_id := NULL;

      FOR v_stage_record IN 
        SELECT id, name, price_cents, quantity, sold_quantity, order_index
        FROM ticket_stages
        WHERE ticket_tier_id = p_ticket_tier_id
        ORDER BY order_index
        FOR UPDATE
      LOOP
        v_stage_start_quantity := v_cumulative_quantity;
        v_stage_end_quantity := v_cumulative_quantity + v_stage_record.quantity;

        -- Check if this is the requested stage
        IF v_stage_record.id = p_stage_id THEN
          v_current_stage_id := v_stage_record.id;
          v_current_stage_name := v_stage_record.name;
          v_current_stage_price := v_stage_record.price_cents;

          -- Check if the stage has opened
          IF v_total_sold_and_reserved < v_stage_start_quantity THEN
            RAISE EXCEPTION 'The "%" stage is not yet open for purchase.',
              v_stage_record.name
              USING ERRCODE = '23514',
                    HINT = 'STAGE_NOT_OPEN';
          END IF;

          -- Calculate availability for this specific stage (clamp to stage capacity)
          v_available_in_current_stage := GREATEST(0, LEAST(v_stage_end_quantity - v_total_sold_and_reserved, v_stage_end_quantity - v_stage_start_quantity));

          -- Check if requested stage is sold out
          IF v_available_in_current_stage <= 0 THEN
            RAISE EXCEPTION 'The "%" stage is sold out. Please select another ticket option.',
              v_current_stage_name
              USING ERRCODE = '23514',
                    HINT = 'SOLD_OUT';
          END IF;

          -- Check if enough tickets available in requested stage
          IF p_quantity > v_available_in_current_stage THEN
            RAISE EXCEPTION 'Only % ticket(s) available for the "%" stage. Please adjust your quantity or select another ticket option.',
              v_available_in_current_stage, v_current_stage_name
              USING ERRCODE = '23514',
                    HINT = 'INSUFFICIENT_QUANTITY';
          END IF;

          EXIT; -- Found and validated the requested stage
        END IF;

        v_cumulative_quantity := v_stage_end_quantity;
      END LOOP;

      -- If stage_id was provided but not found
      IF v_current_stage_id IS NULL THEN
        RAISE EXCEPTION 'The requested ticket stage is not found or no longer available.'
          USING ERRCODE = 'P0002';
      END IF;

    ELSE
      -- No specific stage requested - auto-assign to current active stage
      v_cumulative_quantity := 0;
      FOR v_stage_record IN 
        SELECT id, name, price_cents, quantity, sold_quantity, order_index
        FROM ticket_stages
        WHERE ticket_tier_id = p_ticket_tier_id
        ORDER BY order_index
        FOR UPDATE
      LOOP
        v_stage_end_quantity := v_cumulative_quantity + v_stage_record.quantity;

        IF v_total_sold_and_reserved < v_stage_end_quantity THEN
          -- This is the current active stage
          v_current_stage_id := v_stage_record.id;
          v_current_stage_name := v_stage_record.name;
          v_current_stage_price := v_stage_record.price_cents;
          v_available_in_current_stage := v_stage_end_quantity - v_total_sold_and_reserved;
          EXIT; -- Break out of loop
        END IF;

        v_cumulative_quantity := v_stage_end_quantity;
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

  -- All validations passed - create the RSVP with stage information
  INSERT INTO rsvps (
    user_id,
    event_id,
    ticket_tier_id,
    requested_quantity,
    status,
    requested_at,
    stage_id,
    stage_name,
    stage_price_cents
  ) VALUES (
    p_user_id,
    p_event_id,
    p_ticket_tier_id,
    p_quantity,
    'pending',
    NOW(),
    v_current_stage_id,
    v_current_stage_name,
    COALESCE(v_current_stage_price, v_tier_record.price_cents)
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
    'stage_price_cents', COALESCE(v_current_stage_price, v_tier_record.price_cents)
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Any error will trigger automatic rollback
    RAISE;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION create_rsvp_atomic(UUID, UUID, UUID, INTEGER, UUID) IS 
'Atomically creates an RSVP after validating availability against concurrent requests.
Uses row-level locking (FOR UPDATE) on ticket_tiers and ticket_stages to prevent race conditions.
Validates against both sold tickets and pending/approved RSVPs.
For staged tiers: if p_stage_id is provided, validates that specific stage has availability (prevents auto-assignment to different stages).
If p_stage_id is NULL, auto-assigns to the current active stage based on availability.
Captures stage information (id, name, price) at the time of RSVP creation for historical reference.
Returns JSONB with rsvp_id and stage info on success. Raises exceptions on validation failures which trigger automatic rollback.';

-- Set search_path for security
ALTER FUNCTION create_rsvp_atomic(UUID, UUID, UUID, INTEGER, UUID) SET search_path = public, pg_temp;
