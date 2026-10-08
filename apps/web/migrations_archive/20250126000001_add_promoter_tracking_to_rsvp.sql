-- Add promoter tracking to RSVPs
ALTER TABLE rsvps 
ADD COLUMN IF NOT EXISTS promoter_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS promoter_user_id UUID REFERENCES users(id);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_rsvps_promoter_code ON rsvps(promoter_code);
CREATE INDEX IF NOT EXISTS idx_rsvps_promoter_user_id ON rsvps(promoter_user_id);

COMMENT ON COLUMN rsvps.promoter_code IS 'Tracks which promoter link was used for this RSVP';
COMMENT ON COLUMN rsvps.promoter_user_id IS 'Optional: Links promoter code to a specific user account';

-- Update the atomic RSVP creation function to include promoter tracking
CREATE OR REPLACE FUNCTION public.create_rsvp_atomic(
  p_user_id uuid, 
  p_event_id uuid, 
  p_ticket_tier_id uuid, 
  p_quantity integer, 
  p_stage_id uuid DEFAULT NULL::uuid,
  p_promoter_code varchar DEFAULT NULL,
  p_promoter_user_id uuid DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
          
          -- Calculate availability for this specific stage
          v_available_in_current_stage := GREATEST(0, v_stage_end_quantity - v_total_sold_and_reserved);
          
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
    stage_price_cents,
    promoter_code,
    promoter_user_id
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
    p_promoter_code,
    p_promoter_user_id
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
$function$;

