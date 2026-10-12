-- Flame 2.0 · fix — enforce the organizer's manual "Sold out" on the server.
--
-- Bug (found 2026-10-08): ticket_tiers.is_manually_sold_out was only respected by the UI
-- (web EventDetail.tsx, mobile useEventDetails.ts). Neither the hold RPC nor the RSVP RPC
-- checked it, so a direct call to POST /api/holds/create or POST /api/rsvp could still
-- reserve — and then buy — tickets of a tier the organizer had closed.
--
-- Fix: both buyer entry points reject the tier with the same message the inventory check
-- already uses ("This ticket tier is sold out"). Free tickets go through holds, so they are
-- covered too. Organizer-side paths (send free tickets, bank-transfer orders) are NOT
-- blocked on purpose: the organizer may still issue tickets manually.
--
-- Both functions are copied verbatim from their latest definitions
-- (20260414222258 and 20260429153551) with only the sold-out check added.
--
-- Closing the two side doors that would let a caller skip the new check:
--
-- 1. atomic_create_hold_with_stage_validation is SECURITY DEFINER (bypasses RLS) and takes
--    p_user_id as a parameter, yet EXECUTE was granted to PUBLIC/anon/authenticated. Anyone
--    with the public anon key could call it through PostgREST for any user and any tier
--    (e.g. hold every ticket of an event for 30 minutes, over and over). Its only caller is
--    POST /api/holds/create, which uses the service role → EXECUTE is now service_role only.
--
-- 2. create_rsvp_atomic had two older overloads from the baseline, (5 args) and (7 args),
--    without the check. Nothing calls them (POST /api/rsvp passes the 9-arg signature by
--    name), and they make PostgREST calls with fewer args ambiguous (PGRST203). Dropped.

CREATE OR REPLACE FUNCTION atomic_create_hold_with_stage_validation(
  p_user_id UUID,
  p_event_id UUID,
  p_tier_id UUID,
  p_quantity INTEGER,
  p_stage_id UUID DEFAULT NULL,
  p_expires_minutes INTEGER DEFAULT 30,
  p_promoter_code VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_tier RECORD;
  v_stage RECORD;
  v_existing_orders INTEGER;
  v_cancelled_holds INTEGER;
  v_stage_name TEXT;
  v_stage_price_cents INTEGER;
  v_now TIMESTAMP WITH TIME ZONE;
  v_expires_at TIMESTAMP WITH TIME ZONE;
  v_sold_in_stage INTEGER;
  v_active_holds_in_stage INTEGER;
  v_available_in_stage INTEGER;
  v_hold_id UUID;
  v_result JSONB;
  v_fee_percentage NUMERIC(5,2) := 7.00;
  v_event_currency CHAR(3);
BEGIN
  v_now := NOW();
  v_expires_at := v_now + (p_expires_minutes || ' minutes')::INTERVAL;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ticket quantity must be at least 1');
  END IF;

  SELECT LOWER(currency)
  INTO v_event_currency
  FROM events
  WHERE id = p_event_id;

  IF NOT FOUND OR v_event_currency IS NULL OR v_event_currency = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Event currency is not configured. Cannot create hold.'
    );
  END IF;

  SELECT
    id,
    name,
    price_cents,
    quantity_total,
    quantity_sold,
    per_user_limit,
    sales_start,
    sales_end,
    event_id,
    fee_percentage,
    created_at,
    is_manually_sold_out
  INTO v_ticket_tier
  FROM ticket_tiers
  WHERE id = p_tier_id
    AND event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ticket tier not found');
  END IF;

  -- Organizer marked the tier as sold out (is_manually_sold_out). Until 2026-10 this was only
  -- enforced in the UI; a direct API call could still reserve and buy.
  IF v_ticket_tier.is_manually_sold_out THEN
    RETURN jsonb_build_object('success', false, 'error', 'This ticket tier is sold out');
  END IF;

  v_fee_percentage := COALESCE(
    v_ticket_tier.fee_percentage,
    CASE
      WHEN v_ticket_tier.created_at < '2025-11-08T00:00:00Z' THEN 10.00
      ELSE 7.00
    END
  );

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

  -- Cancel this user's existing active holds for the same tier.
  -- This prevents lockout when a user closes the app mid-checkout and retries.
  -- Other users' holds are not affected.
  DELETE FROM holds
  WHERE user_id = p_user_id
    AND tier_id = v_ticket_tier.id
    AND expires_at > v_now
    AND order_id IS NULL;

  GET DIAGNOSTICS v_cancelled_holds = ROW_COUNT;

  -- Per-user limit: only count completed orders (holds were just cancelled above)
  IF v_ticket_tier.per_user_limit IS NOT NULL THEN
    SELECT COALESCE(SUM(quantity), 0)
    INTO v_existing_orders
    FROM orders
    WHERE user_id = p_user_id
      AND ticket_tier_id = v_ticket_tier.id
      AND status IN ('paid', 'completed');

    IF p_quantity + v_existing_orders > v_ticket_tier.per_user_limit THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format(
          'Maximum %s %s per user for this tier',
          v_ticket_tier.per_user_limit,
          CASE WHEN v_ticket_tier.per_user_limit = 1 THEN 'ticket' ELSE 'tickets' END
        )
      );
    END IF;
  END IF;

  IF p_stage_id IS NOT NULL THEN
    SELECT
      id,
      name,
      price_cents,
      quantity,
      sold_quantity,
      order_index,
      fee_percentage
    INTO v_stage
    FROM ticket_stages
    WHERE id = p_stage_id
      AND ticket_tier_id = p_tier_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'The requested ticket stage is not found or no longer available'
      );
    END IF;

    v_fee_percentage := COALESCE(v_stage.fee_percentage, v_fee_percentage);
    v_stage_name := v_stage.name;
    v_stage_price_cents := v_stage.price_cents;
    v_sold_in_stage := COALESCE(v_stage.sold_quantity, 0);

    SELECT COALESCE(SUM(quantity), 0)
    INTO v_active_holds_in_stage
    FROM holds
    WHERE stage_id = p_stage_id
      AND expires_at > v_now
      AND order_id IS NULL;

    v_available_in_stage := v_stage.quantity - v_sold_in_stage - v_active_holds_in_stage;

    IF v_available_in_stage <= 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('The "%s" stage is sold out. Please select another ticket option.', v_stage_name)
      );
    END IF;

    IF p_quantity > v_available_in_stage THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Only %s ticket(s) available for the "%s" stage. Please adjust your quantity or select another ticket option.', v_available_in_stage, v_stage_name)
      );
    END IF;
  ELSE
    v_stage_name := NULL;
    v_stage_price_cents := v_ticket_tier.price_cents;

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

  INSERT INTO holds (
    user_id,
    event_id,
    tier_id,
    quantity,
    expires_at,
    stage_id,
    stage_name,
    stage_price_cents,
    promoter_code,
    fee_percentage,
    currency
  ) VALUES (
    p_user_id,
    p_event_id,
    p_tier_id,
    p_quantity,
    v_expires_at,
    p_stage_id,
    v_stage_name,
    v_stage_price_cents,
    p_promoter_code,
    v_fee_percentage,
    v_event_currency
  )
  RETURNING id INTO v_hold_id;

  v_result := jsonb_build_object(
    'success', true,
    'hold_id', v_hold_id,
    'expires_at', v_expires_at,
    'stage_name', v_stage_name,
    'stage_price_cents', v_stage_price_cents,
    'available_in_stage', v_available_in_stage,
    'promoter_code', p_promoter_code,
    'fee_percentage', v_fee_percentage
  );

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_rsvp_atomic(
  p_user_id uuid,
  p_event_id uuid,
  p_ticket_tier_id uuid,
  p_quantity integer,
  p_stage_id uuid DEFAULT NULL::uuid,
  p_promoter_code character varying DEFAULT NULL::character varying,
  p_promoter_user_id uuid DEFAULT NULL::uuid,
  p_promotional_code_id uuid DEFAULT NULL::uuid,
  p_discount_amount_cents integer DEFAULT 0
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

  -- Organizer marked the tier as sold out. Same message as the inventory check below so
  -- POST /api/rsvp maps it to its existing "sold out" 400 response.
  IF COALESCE(v_tier_record.is_manually_sold_out, false) THEN
    RAISE EXCEPTION 'This ticket tier is sold out';
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
    -- (approved RSVPs still hold inventory slots even though they allow re-apply)
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
    -- (approved RSVPs still hold inventory slots even though they allow re-apply)
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
    promoter_user_id,
    promotional_code_id,
    discount_amount_cents
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
    p_promoter_user_id,
    p_promotional_code_id,
    p_discount_amount_cents
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
    'promotional_code_id', p_promotional_code_id,
    'discount_amount_cents', p_discount_amount_cents
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Any error will trigger automatic rollback
    RAISE;
END;
$function$;

-- 1. Hold RPC: service role only (see header).
REVOKE EXECUTE ON FUNCTION public.atomic_create_hold_with_stage_validation(
  uuid, uuid, uuid, integer, uuid, integer, character varying
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_create_hold_with_stage_validation(
  uuid, uuid, uuid, integer, uuid, integer, character varying
) TO service_role;

-- 2. Unused RSVP overloads without the sold-out check.
DROP FUNCTION IF EXISTS public.create_rsvp_atomic(uuid, uuid, uuid, integer, uuid);
DROP FUNCTION IF EXISTS public.create_rsvp_atomic(uuid, uuid, uuid, integer, uuid, character varying, uuid);
