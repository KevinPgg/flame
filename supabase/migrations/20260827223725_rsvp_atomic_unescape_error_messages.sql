-- Fix: two display defects in create_rsvp_atomic user-facing error messages.
--
-- Both reach the buyer: apps/web/app/api/rsvp/route.ts returns
-- `rsvpError.message` verbatim in the JSON `error` field on the 23514 / P0002
-- branch, on web and mobile alike.
--
-- Problem 1 -- stray backslashes
-- ------------------------------
-- Nine RAISE EXCEPTION messages across the three create_rsvp_atomic overloads
-- escape their double quotes as \" -- a C-style escape that PostgreSQL does not
-- interpret, because standard_conforming_strings is on (verified against prod).
-- The backslash is therefore part of the literal, and the message renders as:
--
--   The \"Tier I\" stage is sold out. Please select another ticket option.
--
-- Problem 2 -- unformatted price
-- ------------------------------
-- The "insufficient quantity at the current price" message interpolates
-- (v_current_stage_price / 100.0). v_current_stage_price is an integer and
-- 100.0 is numeric, so integer/numeric division yields numeric with scale 16:
--
--   Only 3 ticket(s) available at the current "Tier II" price ($30.0000000000000000).
--
-- Wrapped in to_char(..., 'FM999999990.00') -> $30.00 / $12.50 / $0.00.
-- FM suppresses padding; the leading 0 keeps sub-dollar prices as $0.50 rather
-- than $.50. Three call sites, one per overload.
--
-- Fix
-- ---
-- CREATE OR REPLACE all three overloads. Nothing else changes: identical
-- control flow, identical ERRCODE/HINT values, and the W7-H4 manual sold-out
-- guard (migration 20260827211353) is carried through unchanged. Message text
-- is otherwise byte-identical, so the route's hint-missing regex fallbacks
-- (/\bsold out\b/, /\bavailable\b/) still match.
--
-- Display only -- no behavioural or availability change.
--
-- Deliberately NOT included: a p_quantity IS NULL / < 1 guard. rsvps
-- .requested_quantity is already NOT NULL with CHECK (requested_quantity > 0),
-- which rejects those on every path -- including a direct PostgREST RPC call,
-- since this function is SECURITY INVOKER with anon/authenticated EXECUTE. A
-- guard here would add no coverage and would make this migration behavioural.


-- ---------------------------------------------------------------------------
-- Overload 1/3: (user, event, tier, quantity, stage)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_rsvp_atomic(p_user_id uuid, p_event_id uuid, p_ticket_tier_id uuid, p_quantity integer, p_stage_id uuid DEFAULT NULL::uuid)
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

  -- W7-H4: organizer manual sold-out override. Checked inside the row lock so
  -- it cannot race a concurrent toggle. Mirrors isTierAvailable() on the client.
  IF v_tier_record.is_manually_sold_out = true THEN
    RAISE EXCEPTION 'This ticket tier is sold out'
      USING ERRCODE = '23514',
            HINT = 'SOLD_OUT';
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
          -- FIXED: Now correctly computes as stage_end - total_sold_and_reserved
          -- instead of incorrectly flooring to stage_start
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
          v_available_in_current_stage, v_current_stage_name, to_char(v_current_stage_price / 100.0, 'FM999999990.00')
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
$function$;


-- ---------------------------------------------------------------------------
-- Overload 2/3: + promoter code / promoter user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_rsvp_atomic(p_user_id uuid, p_event_id uuid, p_ticket_tier_id uuid, p_quantity integer, p_stage_id uuid DEFAULT NULL::uuid, p_promoter_code character varying DEFAULT NULL::character varying, p_promoter_user_id uuid DEFAULT NULL::uuid)
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

  -- W7-H4: organizer manual sold-out override. Checked inside the row lock so
  -- it cannot race a concurrent toggle. Mirrors isTierAvailable() on the client.
  IF v_tier_record.is_manually_sold_out = true THEN
    RAISE EXCEPTION 'This ticket tier is sold out'
      USING ERRCODE = '23514',
            HINT = 'SOLD_OUT';
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
          v_available_in_current_stage, v_current_stage_name, to_char(v_current_stage_price / 100.0, 'FM999999990.00')
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


-- ---------------------------------------------------------------------------
-- Overload 3/3: + promotional code / discount (current app entry point)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_rsvp_atomic(p_user_id uuid, p_event_id uuid, p_ticket_tier_id uuid, p_quantity integer, p_stage_id uuid DEFAULT NULL::uuid, p_promoter_code character varying DEFAULT NULL::character varying, p_promoter_user_id uuid DEFAULT NULL::uuid, p_promotional_code_id uuid DEFAULT NULL::uuid, p_discount_amount_cents integer DEFAULT 0)
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

  -- W7-H4: organizer manual sold-out override. Checked inside the row lock so
  -- it cannot race a concurrent toggle. Mirrors isTierAvailable() on the client.
  IF v_tier_record.is_manually_sold_out = true THEN
    RAISE EXCEPTION 'This ticket tier is sold out'
      USING ERRCODE = '23514',
            HINT = 'SOLD_OUT';
  END IF;

  -- Check if user already has a pending RSVP for this event.
  -- Only 'pending' blocks re-application; approved/purchased/rejected/expired
  -- users are allowed to submit a new request.
  SELECT COUNT(*) INTO v_existing_rsvp_count
  FROM rsvps
  WHERE user_id = p_user_id
    AND event_id = p_event_id
    AND status = 'pending';

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

    IF p_stage_id IS NOT NULL THEN
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

        IF v_stage_record.id = p_stage_id THEN
          v_current_stage_id := v_stage_record.id;
          v_current_stage_name := v_stage_record.name;
          v_current_stage_price := v_stage_record.price_cents;
          v_available_in_current_stage := GREATEST(0, v_stage_end_quantity - v_total_sold_and_reserved);
          
          IF v_available_in_current_stage <= 0 THEN
            RAISE EXCEPTION 'The "%" stage is sold out. Please select another ticket option.',
              v_current_stage_name
              USING ERRCODE = '23514',
              HINT = 'SOLD_OUT';
          END IF;
          
          IF p_quantity > v_available_in_current_stage THEN
            RAISE EXCEPTION 'Only % ticket(s) available for the "%" stage. Please adjust your quantity or select another ticket option.',
              v_available_in_current_stage, v_current_stage_name
              USING ERRCODE = '23514',
              HINT = 'INSUFFICIENT_QUANTITY';
          END IF;
          
          EXIT;
        END IF;

        v_cumulative_quantity := v_stage_end_quantity;
      END LOOP;

      IF v_current_stage_id IS NULL THEN
        RAISE EXCEPTION 'The requested ticket stage is not found or no longer available.'
          USING ERRCODE = 'P0002';
      END IF;

    ELSE
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
          v_current_stage_id := v_stage_record.id;
          v_current_stage_name := v_stage_record.name;
          v_current_stage_price := v_stage_record.price_cents;
          v_available_in_current_stage := v_stage_end_quantity - v_total_sold_and_reserved;
          EXIT;
        END IF;

        v_cumulative_quantity := v_stage_end_quantity;
      END LOOP;

      IF v_current_stage_id IS NULL OR v_available_in_current_stage <= 0 THEN
        RAISE EXCEPTION 'This ticket tier is sold out'
          USING ERRCODE = '23514',
          HINT = 'SOLD_OUT';
      END IF;

      IF p_quantity > v_available_in_current_stage THEN
        RAISE EXCEPTION 'Only % ticket(s) available at the current "%" price ($%). Please adjust your quantity.',
          v_available_in_current_stage, v_current_stage_name, to_char(v_current_stage_price / 100.0, 'FM999999990.00')
          USING ERRCODE = '23514',
          HINT = 'INSUFFICIENT_QUANTITY';
      END IF;
    END IF;

  ELSE
    -- No stages - validate against tier-level availability
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

  INSERT INTO rsvps (
    user_id, event_id, ticket_tier_id, requested_quantity, status, requested_at,
    stage_id, stage_name, stage_price_cents, promoter_code, promoter_user_id,
    promotional_code_id, discount_amount_cents
  ) VALUES (
    p_user_id, p_event_id, p_ticket_tier_id, p_quantity, 'pending', NOW(),
    v_current_stage_id, v_current_stage_name,
    COALESCE(v_current_stage_price, v_tier_record.price_cents),
    p_promoter_code, p_promoter_user_id, p_promotional_code_id, p_discount_amount_cents
  )
  RETURNING id, requested_at INTO v_rsvp_id, v_requested_at;

  RETURN jsonb_build_object(
    'success', true,
    'rsvp_id', v_rsvp_id,
    'status', 'pending',
    'requested_at', v_requested_at,
    'stage_id', v_current_stage_id,
    'stage_name', v_current_stage_name,
    'stage_price_cents', COALESCE(v_current_stage_price, v_tier_record.price_cents),
    'promotional_code_id', p_promotional_code_id,
    'discount_amount_cents', p_discount_amount_cents
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$function$;
