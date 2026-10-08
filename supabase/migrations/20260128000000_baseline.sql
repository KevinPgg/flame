

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."orders_payment_status" AS ENUM (
    'authorized',
    'captured',
    'canceled',
    'failed'
);


ALTER TYPE "public"."orders_payment_status" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'user',
    'organizer',
    'admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."atomic_create_hold_with_stage_validation"("p_user_id" "uuid", "p_event_id" "uuid", "p_tier_id" "uuid", "p_quantity" integer, "p_stage_id" "uuid" DEFAULT NULL::"uuid", "p_expires_minutes" integer DEFAULT 5, "p_promoter_code" character varying DEFAULT NULL::character varying) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_ticket_tier RECORD;
  v_stage RECORD;
  v_stage_name TEXT;
  v_stage_price_cents INTEGER;
  v_now TIMESTAMP WITH TIME ZONE;
  v_expires_at TIMESTAMP WITH TIME ZONE;
  v_sold_in_stage INTEGER;
  v_active_holds_in_stage INTEGER;
  v_available_in_stage INTEGER;
  v_hold_id UUID;
  v_result JSONB;
  v_fee_percentage NUMERIC(5,2) := 7.00; -- Default to current rate
BEGIN
  v_now := NOW();
  v_expires_at := v_now + (p_expires_minutes || ' minutes')::INTERVAL;

  -- Basic sanity check: quantity must be a positive integer
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ticket quantity must be at least 1'
    );
  END IF;

  -- Lock the ticket tier for update to prevent concurrent modifications
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
    created_at
  INTO v_ticket_tier
  FROM ticket_tiers
  WHERE id = p_tier_id
    AND event_id = p_event_id
  FOR UPDATE;

  -- Verify tier exists
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

  -- Check sales window
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

  -- Check per-user limit
  IF p_quantity > v_ticket_tier.per_user_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Maximum %s tickets allowed per person', v_ticket_tier.per_user_limit)
    );
  END IF;

  -- If stage_id is provided, validate stage-level availability
  IF p_stage_id IS NOT NULL THEN
    -- Lock the stage for update
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

    -- Verify stage exists
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'The requested ticket stage is not found or no longer available'
      );
    END IF;

    -- Get fee_percentage from stage if available
    v_fee_percentage := COALESCE(
      v_stage.fee_percentage,
      v_fee_percentage
    );

    v_stage_name := v_stage.name;
    v_stage_price_cents := v_stage.price_cents;

    -- CORRECT LOGIC: Use explicit sold_quantity from stage record (Nov 20 fix)
    -- This correctly handles "holes" where earlier stages have availability despite higher total sales
    v_sold_in_stage := COALESCE(v_stage.sold_quantity, 0);

    -- Calculate active holds for this specific stage
    -- Only count non-expired holds that haven't been converted to orders
    SELECT COALESCE(SUM(quantity), 0)
    INTO v_active_holds_in_stage
    FROM holds
    WHERE stage_id = p_stage_id
      AND expires_at > v_now
      AND order_id IS NULL;

    -- Calculate available quantity accounting for both sold and held tickets
    v_available_in_stage := v_stage.quantity - v_sold_in_stage - v_active_holds_in_stage;

    -- Check if stage is sold out
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

  -- All validations passed - create the hold with promoter_code and fee_percentage
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
    p_promoter_code,
    v_fee_percentage
  )
  RETURNING id INTO v_hold_id;

  -- Build success response including promoter_code for logging
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


ALTER FUNCTION "public"."atomic_create_hold_with_stage_validation"("p_user_id" "uuid", "p_event_id" "uuid", "p_tier_id" "uuid", "p_quantity" integer, "p_stage_id" "uuid", "p_expires_minutes" integer, "p_promoter_code" character varying) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."atomic_create_hold_with_stage_validation"("p_user_id" "uuid", "p_event_id" "uuid", "p_tier_id" "uuid", "p_quantity" integer, "p_stage_id" "uuid", "p_expires_minutes" integer, "p_promoter_code" character varying) IS 'Atomically validates stage-level inventory (accounting for active holds) and creates a hold with promoter tracking. 
Prevents overbooking by locking tier and stage records and checking both sold and held quantities.
Uses explicit stage.sold_quantity to correctly handle "holes" in stage availability (Nov 20, 2024 fix).
Now includes promoter_code parameter for server-side tracking of promotional links.
Also captures fee_percentage from tier/stage to ensure correct fee calculation.';



CREATE OR REPLACE FUNCTION "public"."check_email_allowed"("email_to_check" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.allowed_users 
    WHERE email = email_to_check 
    AND (is_registered = FALSE OR auth_user_id IS NULL)
  );
END;
$$;


ALTER FUNCTION "public"."check_email_allowed"("email_to_check" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_abandoned_payments"() RETURNS TABLE("cleared_count" integer, "cleared_hold_ids" "uuid"[])
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_cleared_holds UUID[];
BEGIN
  -- Find holds where payment started but never completed
  -- Clear payment_in_progress flag after 20 minutes of inactivity
  -- This prevents holds from being stuck forever if payment is abandoned
  SELECT array_agg(id)
  INTO v_cleared_holds
  FROM holds
  WHERE payment_in_progress = TRUE
    AND payment_started_at < NOW() - INTERVAL '20 minutes'
    AND order_id IS NULL;

  -- Clear the payment flags on these holds
  -- They will then be subject to normal expiration rules
  IF v_cleared_holds IS NOT NULL THEN
    UPDATE holds
    SET payment_in_progress = FALSE,
        updated_at = NOW()
    WHERE id = ANY(v_cleared_holds);

    RAISE NOTICE 'Cleared payment_in_progress flag on % abandoned holds', 
      array_length(v_cleared_holds, 1);
  ELSE
    RAISE NOTICE 'No abandoned payments to clear';
    v_cleared_holds := '{}';
  END IF;

  -- Return summary
  RETURN QUERY SELECT 
    COALESCE(array_length(v_cleared_holds, 1), 0)::INTEGER,
    COALESCE(v_cleared_holds, '{}'::UUID[]);
END;
$$;


ALTER FUNCTION "public"."cleanup_abandoned_payments"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cleanup_abandoned_payments"() IS 'Clears payment_in_progress flag on holds where payment was started but abandoned for >20 minutes. Should be called periodically (e.g., every 10 minutes) by a monitoring service.';



CREATE OR REPLACE FUNCTION "public"."cleanup_all_ticket_data"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_purchase_tokens_count INTEGER := 0;
  v_checkins_count INTEGER := 0;
  v_tickets_count INTEGER := 0;
  v_order_items_count INTEGER := 0;
  v_rsvps_count INTEGER := 0;
  v_holds_count INTEGER := 0;
  v_datafast_transactions_count INTEGER := 0;
  v_orders_count INTEGER := 0;
  v_result JSONB;
BEGIN
  -- Delete in the correct order to respect foreign key constraints
  
  -- 1. Delete purchase tokens (references rsvps)
  DELETE FROM purchase_tokens
  WHERE id IS NOT NULL;  -- Delete all
  GET DIAGNOSTICS v_purchase_tokens_count = ROW_COUNT;
  
  RAISE NOTICE 'Deleted % purchase tokens', v_purchase_tokens_count;
  
  -- 2. Delete checkins (references tickets)
  DELETE FROM checkins
  WHERE id IS NOT NULL;
  GET DIAGNOSTICS v_checkins_count = ROW_COUNT;
  
  RAISE NOTICE 'Deleted % checkins', v_checkins_count;
  
  -- 3. Delete tickets (references orders)
  DELETE FROM tickets
  WHERE id IS NOT NULL;
  GET DIAGNOSTICS v_tickets_count = ROW_COUNT;
  
  RAISE NOTICE 'Deleted % tickets', v_tickets_count;
  
  -- 4. Delete order items (references orders)
  DELETE FROM order_items
  WHERE id IS NOT NULL;
  GET DIAGNOSTICS v_order_items_count = ROW_COUNT;
  
  RAISE NOTICE 'Deleted % order items', v_order_items_count;
  
  -- 5. Delete RSVPs (references users, events, ticket_tiers)
  DELETE FROM rsvps
  WHERE id IS NOT NULL;
  GET DIAGNOSTICS v_rsvps_count = ROW_COUNT;
  
  RAISE NOTICE 'Deleted % RSVPs', v_rsvps_count;
  
  -- 6. Delete holds
  DELETE FROM holds
  WHERE id IS NOT NULL;
  GET DIAGNOSTICS v_holds_count = ROW_COUNT;
  
  RAISE NOTICE 'Deleted % holds', v_holds_count;
  
  -- 7. Delete datafast_transactions (references orders)
  -- Must be deleted before orders due to foreign key constraint
  DELETE FROM datafast_transactions
  WHERE id IS NOT NULL;
  GET DIAGNOSTICS v_datafast_transactions_count = ROW_COUNT;
  
  RAISE NOTICE 'Deleted % datafast transactions', v_datafast_transactions_count;
  
  -- 8. Delete orders
  DELETE FROM orders
  WHERE id IS NOT NULL;
  GET DIAGNOSTICS v_orders_count = ROW_COUNT;
  
  RAISE NOTICE 'Deleted % orders', v_orders_count;
  
  -- Reset counters
  RAISE NOTICE 'Resetting counters...';
  
  -- Reset ticket_stages sold_quantity
  UPDATE ticket_stages
  SET sold_quantity = 0
  WHERE id IS NOT NULL;
  
  -- Reset ticket_tiers quantity_sold
  UPDATE ticket_tiers
  SET quantity_sold = 0
  WHERE id IS NOT NULL;
  
  -- Reset events total_rsvps
  UPDATE events
  SET total_rsvps = 0
  WHERE id IS NOT NULL;
  
  RAISE NOTICE 'All counters reset successfully';
  
  -- Build result JSON with deletion statistics
  v_result := jsonb_build_object(
    'success', true,
    'deletion_stats', jsonb_build_object(
      'purchase_tokens', v_purchase_tokens_count,
      'checkins', v_checkins_count,
      'tickets', v_tickets_count,
      'order_items', v_order_items_count,
      'rsvps', v_rsvps_count,
      'holds', v_holds_count,
      'datafast_transactions', v_datafast_transactions_count,
      'orders', v_orders_count
    ),
    'message', 'All ticket data cleaned up successfully'
  );
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error and return failure
    RAISE WARNING 'Error during cleanup: %', SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'error_detail', SQLSTATE
    );
END;
$$;


ALTER FUNCTION "public"."cleanup_all_ticket_data"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cleanup_all_ticket_data"() IS 'Atomically deletes all ticket-related data (tickets, orders, RSVPs, holds, purchase tokens, checkins, datafast_transactions) 
and resets all counters. This operation is irreversible and should only be called by administrators. 
All operations are performed in a single transaction to ensure consistency.';



CREATE OR REPLACE FUNCTION "public"."cleanup_expired_holds"() RETURNS TABLE("deleted_count" integer, "affected_tier_ids" "uuid"[])
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_deleted_holds UUID[];
  v_affected_tiers UUID[];
BEGIN
  -- Select expired holds that:
  -- 1. Have actually expired (expires_at <= NOW())
  -- 2. Haven't been used yet (order_id IS NULL)
  -- 3. Don't have payment in progress (payment_in_progress = FALSE OR NULL)
  -- 4. If payment started, give 15 minute grace period from payment start time
  --    Note: payment_in_progress = TRUE requires payment_started_at IS NOT NULL
  --    to prevent orphaned holds from never being cleaned
  SELECT array_agg(id), array_agg(DISTINCT tier_id)
  INTO v_deleted_holds, v_affected_tiers
  FROM holds
  WHERE order_id IS NULL
    AND expires_at <= NOW()
    AND (
      payment_in_progress = FALSE
      OR payment_in_progress IS NULL
      OR (
        payment_in_progress = TRUE
        AND payment_started_at IS NOT NULL
        AND payment_started_at < NOW() - INTERVAL '15 minutes'
      )
    );

  -- Delete the expired holds (if any found)
  IF v_deleted_holds IS NOT NULL THEN
    DELETE FROM holds
    WHERE id = ANY(v_deleted_holds);

    -- Log cleanup action
    RAISE NOTICE 'Cleaned up % expired holds affecting % tiers', 
      array_length(v_deleted_holds, 1), 
      COALESCE(array_length(v_affected_tiers, 1), 0);
  ELSE
    RAISE NOTICE 'No expired holds to clean up';
    v_deleted_holds := '{}';
    v_affected_tiers := '{}';
  END IF;

  -- Return summary
  RETURN QUERY SELECT 
    COALESCE(array_length(v_deleted_holds, 1), 0)::INTEGER,
    COALESCE(v_affected_tiers, '{}'::UUID[]);
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_holds"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cleanup_expired_holds"() IS 'Deletes all expired holds and returns count of deleted holds and affected tier IDs. Should be called periodically to free up inventory. SECURITY: Only callable by authenticated users or backend services (via service role). Anonymous access is explicitly denied to prevent unauthorized hold deletion.';



CREATE OR REPLACE FUNCTION "public"."cleanup_expired_pending_rsvps"() RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM rsvp_pending_requests
  WHERE expires_at < now();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Cleaned up % expired pending RSVP requests', deleted_count;
  
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_pending_rsvps"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cleanup_expired_pending_rsvps"() IS 'Deletes expired pending RSVP requests. Should be run periodically via pg_cron or external scheduler. Returns count of deleted records.';



CREATE OR REPLACE FUNCTION "public"."cleanup_expired_purchase_tokens"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  DELETE FROM purchase_tokens 
  WHERE expires_at < now() AND used_at IS NULL;
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_purchase_tokens"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_hold_purchase"("p_hold_id" "uuid", "p_user_id" "uuid", "p_quantity" integer, "p_unit_price_cents" integer, "p_subtotal_cents" integer, "p_processing_fee_cents" integer, "p_total_cents" integer, "p_organization_id" "uuid", "p_event_id" "uuid", "p_tier_id" "uuid", "p_attendee_name" "text", "p_attendee_email" "text", "p_ticket_data" "jsonb", "p_promotional_code_id" "uuid" DEFAULT NULL::"uuid", "p_discount_amount_cents" integer DEFAULT 0, "p_promoter_code" character varying DEFAULT NULL::character varying) RETURNS "jsonb"
    LANGUAGE "plpgsql"
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

    -- CRITICAL FIX: Use ROUND() instead of FLOOR() to match client-side Math.round()
    -- The validate-promo-code API and complete-hold route both use Math.round()
    -- Using FLOOR() causes 1-cent discrepancies when fractional cents are involved
    -- Example: (7564 * 15) / 100 = 1134.6 → ROUND=1135, FLOOR=1134 (mismatch!)
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


ALTER FUNCTION "public"."complete_hold_purchase"("p_hold_id" "uuid", "p_user_id" "uuid", "p_quantity" integer, "p_unit_price_cents" integer, "p_subtotal_cents" integer, "p_processing_fee_cents" integer, "p_total_cents" integer, "p_organization_id" "uuid", "p_event_id" "uuid", "p_tier_id" "uuid", "p_attendee_name" "text", "p_attendee_email" "text", "p_ticket_data" "jsonb", "p_promotional_code_id" "uuid", "p_discount_amount_cents" integer, "p_promoter_code" character varying) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."complete_hold_purchase"("p_hold_id" "uuid", "p_user_id" "uuid", "p_quantity" integer, "p_unit_price_cents" integer, "p_subtotal_cents" integer, "p_processing_fee_cents" integer, "p_total_cents" integer, "p_organization_id" "uuid", "p_event_id" "uuid", "p_tier_id" "uuid", "p_attendee_name" "text", "p_attendee_email" "text", "p_ticket_data" "jsonb", "p_promotional_code_id" "uuid", "p_discount_amount_cents" integer, "p_promoter_code" character varying) IS 'Atomically completes a hold-based purchase with promoter tracking. Uses ROUND() for discount calculation to match client-side Math.round() logic and prevent 1-cent rounding errors.';



CREATE OR REPLACE FUNCTION "public"."create_bank_transfer_order_atomic"("p_user_id" "uuid", "p_organization_id" "uuid", "p_event_id" "uuid", "p_ticket_tier_id" "uuid", "p_quantity" integer, "p_unit_price_cents" integer, "p_subtotal_cents" integer, "p_fees_cents" integer, "p_total_cents" integer, "p_idempotency_key" "text", "p_tickets" "text", "p_stage_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
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
  v_needed_capacity INTEGER;
  v_stage_current_sold INTEGER;
  v_stage_capacity INTEGER;
  v_stage_available INTEGER;
  v_stage_needed_capacity INTEGER;
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
      v_ticket->>'attendee_name',
      v_ticket->>'attendee_email',
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
$$;


ALTER FUNCTION "public"."create_bank_transfer_order_atomic"("p_user_id" "uuid", "p_organization_id" "uuid", "p_event_id" "uuid", "p_ticket_tier_id" "uuid", "p_quantity" integer, "p_unit_price_cents" integer, "p_subtotal_cents" integer, "p_fees_cents" integer, "p_total_cents" integer, "p_idempotency_key" "text", "p_tickets" "text", "p_stage_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_bank_transfer_order_atomic"("p_user_id" "uuid", "p_organization_id" "uuid", "p_event_id" "uuid", "p_ticket_tier_id" "uuid", "p_quantity" integer, "p_unit_price_cents" integer, "p_subtotal_cents" integer, "p_fees_cents" integer, "p_total_cents" integer, "p_idempotency_key" "text", "p_tickets" "text", "p_stage_id" "uuid") IS 'Atomically creates a bank transfer order with tickets and updates inventory. Auto-expands tier/stage capacity if needed to accommodate organizer bank transfers. Either all operations succeed or all fail.';



CREATE OR REPLACE FUNCTION "public"."create_rsvp_atomic"("p_user_id" "uuid", "p_event_id" "uuid", "p_ticket_tier_id" "uuid", "p_quantity" integer, "p_stage_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."create_rsvp_atomic"("p_user_id" "uuid", "p_event_id" "uuid", "p_ticket_tier_id" "uuid", "p_quantity" integer, "p_stage_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_rsvp_atomic"("p_user_id" "uuid", "p_event_id" "uuid", "p_ticket_tier_id" "uuid", "p_quantity" integer, "p_stage_id" "uuid") IS 'Atomically creates an RSVP after validating availability against concurrent requests.
Uses row-level locking (FOR UPDATE) on ticket_tiers and ticket_stages to prevent race conditions.
Validates against both sold tickets and pending/approved RSVPs.
For staged tiers: if p_stage_id is provided, validates that specific stage has availability (prevents auto-assignment to different stages).
If p_stage_id is NULL, auto-assigns to the current active stage based on availability.
Captures stage information (id, name, price) at the time of RSVP creation for historical reference.
Returns JSONB with rsvp_id and stage info on success. Raises exceptions on validation failures which trigger automatic rollback.
BUGFIX: Corrected availability calculation to use v_stage_end_quantity - v_total_sold_and_reserved instead of incorrectly flooring to stage_start.';



CREATE OR REPLACE FUNCTION "public"."create_rsvp_atomic"("p_user_id" "uuid", "p_event_id" "uuid", "p_ticket_tier_id" "uuid", "p_quantity" integer, "p_stage_id" "uuid" DEFAULT NULL::"uuid", "p_promoter_code" character varying DEFAULT NULL::character varying, "p_promoter_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."create_rsvp_atomic"("p_user_id" "uuid", "p_event_id" "uuid", "p_ticket_tier_id" "uuid", "p_quantity" integer, "p_stage_id" "uuid", "p_promoter_code" character varying, "p_promoter_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_rsvp_atomic"("p_user_id" "uuid", "p_event_id" "uuid", "p_ticket_tier_id" "uuid", "p_quantity" integer, "p_stage_id" "uuid" DEFAULT NULL::"uuid", "p_promoter_code" character varying DEFAULT NULL::character varying, "p_promoter_user_id" "uuid" DEFAULT NULL::"uuid", "p_promotional_code_id" "uuid" DEFAULT NULL::"uuid", "p_discount_amount_cents" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."create_rsvp_atomic"("p_user_id" "uuid", "p_event_id" "uuid", "p_ticket_tier_id" "uuid", "p_quantity" integer, "p_stage_id" "uuid", "p_promoter_code" character varying, "p_promoter_user_id" "uuid", "p_promotional_code_id" "uuid", "p_discount_amount_cents" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_ticket_tier_with_stages"("p_event_id" "uuid", "p_name" "text", "p_price_cents" integer, "p_quantity_total" integer, "p_per_user_limit" integer, "p_sales_start" timestamp with time zone, "p_sales_end" timestamp with time zone, "p_order_index" integer, "p_use_stages" boolean DEFAULT false, "p_stages" "jsonb" DEFAULT NULL::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_tier_id UUID;
  v_stage JSONB;
  v_result JSONB;
  v_total_stage_quantity INTEGER;
BEGIN
  -- Create the ticket tier
  INSERT INTO ticket_tiers (
    event_id,
    name,
    price_cents,
    quantity_total,
    per_user_limit,
    sales_start,
    sales_end,
    order_index
  ) VALUES (
    p_event_id,
    p_name,
    p_price_cents,
    p_quantity_total,
    p_per_user_limit,
    p_sales_start,
    p_sales_end,
    p_order_index
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

    -- Insert all stages
    FOR v_stage IN SELECT * FROM jsonb_array_elements(p_stages)
    LOOP
      INSERT INTO ticket_stages (
        ticket_tier_id,
        name,
        price_cents,
        currency,
        quantity,
        sold_quantity,
        order_index
      ) VALUES (
        v_tier_id,
        v_stage->>'name',
        (v_stage->>'price_cents')::INTEGER,
        'USD',
        (v_stage->>'quantity')::INTEGER,
        0,
        (v_stage->>'order_index')::INTEGER
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


ALTER FUNCTION "public"."create_ticket_tier_with_stages"("p_event_id" "uuid", "p_name" "text", "p_price_cents" integer, "p_quantity_total" integer, "p_per_user_limit" integer, "p_sales_start" timestamp with time zone, "p_sales_end" timestamp with time zone, "p_order_index" integer, "p_use_stages" boolean, "p_stages" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_ticket_tier_with_stages"("p_event_id" "uuid", "p_name" "text", "p_price_cents" integer, "p_quantity_total" integer, "p_per_user_limit" integer, "p_sales_start" timestamp with time zone, "p_sales_end" timestamp with time zone, "p_order_index" integer, "p_use_stages" boolean, "p_stages" "jsonb") IS 'Atomically creates a ticket tier and its stages in a single transaction. 
If stage creation fails, the tier creation is automatically rolled back, preventing orphaned tiers.
Validates that stage quantities sum to the tier total quantity.
Returns JSONB with tier_id on success. Raises exceptions on failures which trigger automatic rollback.';



CREATE OR REPLACE FUNCTION "public"."create_ticket_tier_with_stages"("p_event_id" "uuid", "p_name" "text", "p_price_cents" integer, "p_quantity_total" integer, "p_per_user_limit" integer, "p_sales_start" timestamp with time zone, "p_sales_end" timestamp with time zone, "p_order_index" integer, "p_use_stages" boolean DEFAULT false, "p_stages" "jsonb" DEFAULT NULL::"jsonb", "p_fee_percentage" numeric DEFAULT 7.00) RETURNS "jsonb"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."create_ticket_tier_with_stages"("p_event_id" "uuid", "p_name" "text", "p_price_cents" integer, "p_quantity_total" integer, "p_per_user_limit" integer, "p_sales_start" timestamp with time zone, "p_sales_end" timestamp with time zone, "p_order_index" integer, "p_use_stages" boolean, "p_stages" "jsonb", "p_fee_percentage" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_allowed_user_details"("email_to_check" "text") RETURNS TABLE("id_number" "text", "full_name" "text", "position" "text", "department" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY 
  SELECT 
    allowed_users.id_number,
    allowed_users.full_name,
    allowed_users."position",
    allowed_users.department
  FROM 
    public.allowed_users
  WHERE 
    allowed_users.email = email_to_check;
END;
$$;


ALTER FUNCTION "public"."get_allowed_user_details"("email_to_check" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_stage_availability"("p_stage_id" "uuid") RETURNS TABLE("stage_id" "uuid", "stage_name" "text", "stage_price_cents" integer, "total_quantity" integer, "sold_quantity" integer, "held_quantity" integer, "available_quantity" integer)
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_stage RECORD;
  v_held_quantity INTEGER;
  v_sold_in_stage INTEGER;
BEGIN
  -- Get stage details
  SELECT 
    ts.id,
    ts.name,
    ts.price_cents,
    ts.quantity,
    ts.sold_quantity,
    ts.order_index,
    ts.ticket_tier_id
  INTO v_stage
  FROM ticket_stages ts
  WHERE ts.id = p_stage_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stage not found: %', p_stage_id;
  END IF;

  -- NEW LOGIC: Use explicit sold_quantity
  v_sold_in_stage := COALESCE(v_stage.sold_quantity, 0);

  -- Count active holds for this specific stage (non-expired, not converted to orders)
  SELECT COALESCE(SUM(quantity), 0)
  INTO v_held_quantity
  FROM holds h
  WHERE h.stage_id = p_stage_id
    AND h.expires_at > NOW()
    AND h.order_id IS NULL;

  -- Return availability details
  -- Clamp available_quantity to zero to prevent negative values
  RETURN QUERY SELECT
    v_stage.id,
    v_stage.name::TEXT,
    v_stage.price_cents,
    v_stage.quantity,
    v_sold_in_stage,
    v_held_quantity,
    GREATEST(v_stage.quantity - v_sold_in_stage - v_held_quantity, 0)::INTEGER AS available_quantity;
END;
$$;


ALTER FUNCTION "public"."get_stage_availability"("p_stage_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_stage_availability"("p_stage_id" "uuid") IS 'Returns real-time availability for a stage including sold tickets, active holds, and available quantity (clamped to zero)';



CREATE OR REPLACE FUNCTION "public"."get_tier_stage_availability"("p_tier_id" "uuid") RETURNS TABLE("stage_id" "uuid", "stage_name" "text", "stage_price_cents" integer, "stage_order" integer, "total_quantity" integer, "sold_quantity" integer, "held_quantity" integer, "available_quantity" integer, "is_current_stage" boolean)
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_tier RECORD;
BEGIN
  -- Get tier details
  SELECT 
    id,
    quantity_total,
    quantity_sold
  INTO v_tier
  FROM ticket_tiers
  WHERE id = p_tier_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tier not found: %', p_tier_id;
  END IF;

  -- Return availability for all stages
  RETURN QUERY
  WITH stage_holds AS (
    -- Count active holds per stage
    SELECT 
      h.stage_id,
      COALESCE(SUM(h.quantity), 0) as held_qty
    FROM holds h
    WHERE h.tier_id = p_tier_id
      AND h.stage_id IS NOT NULL
      AND h.expires_at > NOW()
      AND h.order_id IS NULL
    GROUP BY h.stage_id
  ),
  stage_calcs AS (
    SELECT 
      ts.id,
      ts.name::TEXT,
      ts.price_cents,
      ts.order_index,
      ts.quantity as total_qty,
      COALESCE(ts.sold_quantity, 0) as sold_quantity,
      COALESCE(sh.held_qty, 0) as held_qty
      
    FROM ticket_stages ts
    LEFT JOIN stage_holds sh ON sh.stage_id = ts.id
    WHERE ts.ticket_tier_id = p_tier_id
    ORDER BY ts.order_index
  ),
  stage_availability AS (
    SELECT
      sc.id,
      sc.name,
      sc.price_cents,
      sc.order_index,
      sc.total_qty,
      
      -- NEW LOGIC: Use explicit sold_quantity
      sc.sold_quantity as sold_qty,
      
      sc.held_qty::INTEGER as held_qty,
      
      -- Available quantity (clamped to zero)
      GREATEST(
        0,
        sc.total_qty - sc.sold_quantity - sc.held_qty
      )::INTEGER as available_qty
      
    FROM stage_calcs sc
  )
  SELECT
    sa.id as stage_id,
    sa.name as stage_name,
    sa.price_cents as stage_price_cents,
    sa.order_index as stage_order,
    sa.total_qty as total_quantity,
    sa.sold_qty as sold_quantity,
    sa.held_qty as held_quantity,
    sa.available_qty as available_quantity,
    
    -- Is this the current stage?
    -- 1. It has availability
    -- 2. It's the FIRST stage (by order) that is not full
    (
      sa.available_qty > 0
      AND
      (
        sa.order_index = 0
        OR
        -- Check that all previous stages are full
        NOT EXISTS (
          SELECT 1
          FROM stage_availability sa_prev
          WHERE sa_prev.order_index < sa.order_index
            AND (sa_prev.sold_qty + sa_prev.held_qty) < sa_prev.total_qty
        )
      )
    ) as is_current_stage
    
  FROM stage_availability sa
  ORDER BY sa.order_index;
END;
$$;


ALTER FUNCTION "public"."get_tier_stage_availability"("p_tier_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_tier_stage_availability"("p_tier_id" "uuid") IS 'Returns real-time availability for all stages in a tier, including which stage is currently active (with clamped availability)';



CREATE OR REPLACE FUNCTION "public"."increment_stage_sold_quantity"("p_stage_id" "uuid", "p_increment" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_stage_record RECORD;
  v_new_sold INTEGER;
BEGIN
  -- Lock and get the stage record
  SELECT id, quantity, sold_quantity
  INTO v_stage_record
  FROM ticket_stages
  WHERE id = p_stage_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket stage % not found', p_stage_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Calculate new sold_quantity
  v_new_sold := v_stage_record.sold_quantity + p_increment;

  -- Validate bounds
  IF v_new_sold < 0 THEN
    RAISE EXCEPTION 'Cannot decrement stage sold_quantity below 0. Current: %, Decrement: %, Result would be: %',
      v_stage_record.sold_quantity, p_increment, v_new_sold
      USING ERRCODE = '23514', -- check_violation
            HINT = 'UNDERFLOW';
  END IF;

  IF v_new_sold > v_stage_record.quantity THEN
    RAISE EXCEPTION 'Cannot increment stage sold_quantity above capacity. Current: %, Capacity: %, Increment: %, Result would be: %',
      v_stage_record.sold_quantity, v_stage_record.quantity, p_increment, v_new_sold
      USING ERRCODE = '23514', -- check_violation
            HINT = 'OVERFLOW';
  END IF;

  -- Update with validated value
  UPDATE ticket_stages
  SET sold_quantity = v_new_sold,
      updated_at = NOW()
  WHERE id = p_stage_id;
END;
$$;


ALTER FUNCTION "public"."increment_stage_sold_quantity"("p_stage_id" "uuid", "p_increment" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_tier_quantity_sold"("p_tier_id" "uuid", "p_increment" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_tier_record RECORD;
  v_new_sold INTEGER;
BEGIN
  -- Lock and get the tier record
  SELECT id, quantity_total, quantity_sold
  INTO v_tier_record
  FROM ticket_tiers
  WHERE id = p_tier_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket tier % not found', p_tier_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Calculate new quantity_sold
  v_new_sold := v_tier_record.quantity_sold + p_increment;

  -- Validate bounds
  IF v_new_sold < 0 THEN
    RAISE EXCEPTION 'Cannot decrement tier quantity_sold below 0. Current: %, Decrement: %, Result would be: %',
      v_tier_record.quantity_sold, p_increment, v_new_sold
      USING ERRCODE = '23514', -- check_violation
            HINT = 'UNDERFLOW';
  END IF;

  IF v_new_sold > v_tier_record.quantity_total THEN
    RAISE EXCEPTION 'Cannot increment tier quantity_sold above capacity. Current: %, Capacity: %, Increment: %, Result would be: %',
      v_tier_record.quantity_sold, v_tier_record.quantity_total, p_increment, v_new_sold
      USING ERRCODE = '23514', -- check_violation
            HINT = 'OVERFLOW';
  END IF;

  -- Update with validated value
  UPDATE ticket_tiers
  SET quantity_sold = v_new_sold,
      updated_at = NOW()
  WHERE id = p_tier_id;
END;
$$;


ALTER FUNCTION "public"."increment_tier_quantity_sold"("p_tier_id" "uuid", "p_increment" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lock_stuck_transactions_for_recovery"("p_min_minutes" integer DEFAULT 10, "p_limit" integer DEFAULT 100) RETURNS TABLE("id" "uuid", "datafast_transaction_id" "text", "merchant_transaction_id" "text", "status" "text", "result_code" "text", "amount" numeric, "currency" "text", "user_id" "uuid", "customer_email" "text", "hold_id" "uuid", "order_id" "uuid", "verified_at" timestamp with time zone, "verification_response_data" "jsonb", "checkout_request_data" "jsonb", "auth_code" "text", "reference_no" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_cutoff_time TIMESTAMPTZ;
BEGIN
  v_cutoff_time := NOW() - (p_min_minutes || ' minutes')::INTERVAL;
  
  -- Atomically update and return rows using FOR UPDATE SKIP LOCKED
  -- This ensures only one worker can lock each row
  -- Use CTE to properly handle FOR UPDATE SKIP LOCKED
  RETURN QUERY
  WITH locked_rows AS (
    SELECT dt.id
    FROM datafast_transactions dt
    WHERE dt.status = 'processing'
      AND dt.result_code = '000.000.000'
      AND dt.order_id IS NULL
      AND dt.recovery_in_progress = FALSE
      AND dt.verified_at < v_cutoff_time
    ORDER BY dt.verified_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE datafast_transactions
  SET recovery_in_progress = TRUE,
      updated_at = NOW()
  FROM locked_rows
  WHERE datafast_transactions.id = locked_rows.id
  RETURNING 
    datafast_transactions.id,
    datafast_transactions.datafast_transaction_id,
    datafast_transactions.merchant_transaction_id,
    datafast_transactions.status,
    datafast_transactions.result_code,
    datafast_transactions.amount,
    datafast_transactions.currency,
    datafast_transactions.user_id,
    datafast_transactions.customer_email,
    datafast_transactions.hold_id,
    datafast_transactions.order_id,
    datafast_transactions.verified_at,
    datafast_transactions.verification_response_data,
    datafast_transactions.checkout_request_data,
    datafast_transactions.auth_code,
    datafast_transactions.reference_no,
    datafast_transactions.created_at,
    datafast_transactions.updated_at;
END;
$$;


ALTER FUNCTION "public"."lock_stuck_transactions_for_recovery"("p_min_minutes" integer, "p_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."lock_stuck_transactions_for_recovery"("p_min_minutes" integer, "p_limit" integer) IS 'Atomically selects and locks stuck transactions for recovery. Uses FOR UPDATE SKIP LOCKED to prevent concurrent processing. Returns up to p_limit transactions that have been stuck for at least p_min_minutes.';



CREATE OR REPLACE FUNCTION "public"."mark_hold_payment_started"("p_hold_id" "uuid", "p_checkout_id" "text", "p_extend_minutes" integer DEFAULT 10) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_hold RECORD;
  v_new_expiration TIMESTAMPTZ;
BEGIN
  -- Get and lock the hold
  SELECT * INTO v_hold
  FROM holds
  WHERE id = p_hold_id
  FOR UPDATE;

  -- Verify hold exists and is valid
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Hold not found'
    );
  END IF;

  -- Verify hold hasn't been used
  IF v_hold.order_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Hold already used'
    );
  END IF;

  -- Verify hold hasn't expired
  IF v_hold.expires_at <= NOW() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Hold has expired'
    );
  END IF;

  -- Calculate new expiration (original expiration + p_extend_minutes, or NOW + p_extend_minutes if original already passed)
  v_new_expiration := GREATEST(
    v_hold.expires_at,
    NOW()
  ) + (p_extend_minutes || ' minutes')::INTERVAL;

  -- Mark payment as started and extend expiration
  UPDATE holds
  SET payment_in_progress = TRUE,
      payment_started_at = NOW(),
      datafast_checkout_id = p_checkout_id,
      expires_at = v_new_expiration,
      updated_at = NOW()
  WHERE id = p_hold_id;

  RETURN jsonb_build_object(
    'success', true,
    'old_expiration', v_hold.expires_at,
    'new_expiration', v_new_expiration,
    'extended_by_minutes', p_extend_minutes
  );
END;
$$;


ALTER FUNCTION "public"."mark_hold_payment_started"("p_hold_id" "uuid", "p_checkout_id" "text", "p_extend_minutes" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."mark_hold_payment_started"("p_hold_id" "uuid", "p_checkout_id" "text", "p_extend_minutes" integer) IS 'Marks a hold as having payment in progress and extends its expiration. Called by the create-checkout endpoint when Datafast checkout session is created. Prevents the hold from being cleaned up while payment is being processed.';



CREATE OR REPLACE FUNCTION "public"."set_featured_event"("event_id_param" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- First, unfeature all events
  UPDATE events 
  SET is_featured = false, updated_at = NOW()
  WHERE is_featured = true;
  
  -- Then, feature the specified event
  UPDATE events 
  SET is_featured = true, updated_at = NOW()
  WHERE id = event_id_param;
  
  -- Check if the event exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event with id % not found', event_id_param;
  END IF;
END;
$$;


ALTER FUNCTION "public"."set_featured_event"("event_id_param" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_featured_event"("event_id_param" "uuid") IS 'Safely sets a featured event by first unfeaturing all events, then featuring the specified event. This ensures only one event is featured at a time.';



CREATE OR REPLACE FUNCTION "public"."try_advisory_lock"("lock_key" bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- pg_try_advisory_xact_lock returns true if lock acquired, false otherwise
    -- The lock is automatically released at end of transaction
    RETURN pg_try_advisory_xact_lock(lock_key);
END;
$$;


ALTER FUNCTION "public"."try_advisory_lock"("lock_key" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."try_advisory_lock"("lock_key" bigint) IS 'Acquires a transaction-scoped advisory lock. Returns true if lock acquired, false if already held by another session.';



CREATE OR REPLACE FUNCTION "public"."unfeature_all_events"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE events 
  SET is_featured = false, updated_at = NOW()
  WHERE is_featured = true;
END;
$$;


ALTER FUNCTION "public"."unfeature_all_events"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."unfeature_all_events"() IS 'Unfeatures all currently featured events.';



CREATE OR REPLACE FUNCTION "public"."update_datafast_transactions_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_datafast_transactions_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_holds_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_holds_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_ticket_stages"("p_ticket_tier_id" "uuid", "p_stages" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_stage JSONB;
  v_stage_id UUID;
  v_sold_quantity INTEGER;
  v_new_quantity INTEGER;
  v_existing_stage_ids UUID[];
  v_provided_stage_ids UUID[];
  v_stages_to_delete UUID[];
  v_total_stage_quantity INTEGER;
  v_stage_count INTEGER;
  v_result JSONB;
BEGIN
  -- Get all existing stage IDs for this tier
  SELECT ARRAY_AGG(id) INTO v_existing_stage_ids
  FROM ticket_stages
  WHERE ticket_tier_id = p_ticket_tier_id;

  -- Extract provided stage IDs from JSON
  SELECT ARRAY_AGG((stage->>'id')::UUID)
  INTO v_provided_stage_ids
  FROM jsonb_array_elements(p_stages) AS stage
  WHERE stage->>'id' IS NOT NULL;

  -- Handle NULL arrays
  v_existing_stage_ids := COALESCE(v_existing_stage_ids, ARRAY[]::UUID[]);
  v_provided_stage_ids := COALESCE(v_provided_stage_ids, ARRAY[]::UUID[]);

  -- CRITICAL: Validate quantities before any updates
  FOR v_stage IN SELECT * FROM jsonb_array_elements(p_stages)
  LOOP
    v_stage_id := (v_stage->>'id')::UUID;
    
    IF v_stage_id IS NOT NULL THEN
      -- Get current sold quantity
      SELECT sold_quantity INTO v_sold_quantity
      FROM ticket_stages
      WHERE id = v_stage_id;
      
      IF FOUND THEN
        v_new_quantity := (v_stage->>'quantity')::INTEGER;
        
        -- Validate new quantity is not less than sold quantity
        IF v_new_quantity < v_sold_quantity THEN
          RAISE EXCEPTION 'Cannot reduce stage "%" quantity to %. % tickets have already been sold from this stage.',
            v_stage->>'name', v_new_quantity, v_sold_quantity
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- Find stages to delete (existing but not in provided list)
  SELECT ARRAY(
    SELECT unnest(v_existing_stage_ids)
    EXCEPT
    SELECT unnest(v_provided_stage_ids)
  ) INTO v_stages_to_delete;

  -- CRITICAL: Prevent deletion of stages with sold tickets
  IF array_length(v_stages_to_delete, 1) > 0 THEN
    -- Check if any stages to delete have sold tickets
    IF EXISTS (
      SELECT 1
      FROM ticket_stages
      WHERE id = ANY(v_stages_to_delete)
      AND sold_quantity > 0
    ) THEN
      RAISE EXCEPTION 'Cannot remove stages that have sold tickets. Please keep all stages with sold tickets or contact support.'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Safe to delete stages with no sales
    DELETE FROM ticket_stages
    WHERE id = ANY(v_stages_to_delete);
  END IF;

  -- Update or create stages
  FOR v_stage IN SELECT * FROM jsonb_array_elements(p_stages)
  LOOP
    v_stage_id := (v_stage->>'id')::UUID;
    
    IF v_stage_id IS NOT NULL AND v_stage_id = ANY(v_existing_stage_ids) THEN
      -- Update existing stage
      UPDATE ticket_stages
      SET
        name = v_stage->>'name',
        price_cents = (v_stage->>'price_cents')::INTEGER,
        quantity = (v_stage->>'quantity')::INTEGER,
        order_index = (v_stage->>'order_index')::INTEGER,
        updated_at = NOW()
      WHERE id = v_stage_id
      -- Ensure quantity >= sold_quantity (database constraint will also enforce this)
      AND sold_quantity <= (v_stage->>'quantity')::INTEGER;
      
      -- Check if update succeeded
      IF NOT FOUND THEN
        -- This means the optimistic lock failed - someone sold tickets during our operation
        RAISE EXCEPTION 'Cannot update stage "%": tickets were sold during the update. Please refresh and try again.',
          v_stage->>'name'
          USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      -- Create new stage
      INSERT INTO ticket_stages (
        ticket_tier_id,
        name,
        price_cents,
        currency,
        quantity,
        sold_quantity,
        order_index
      ) VALUES (
        p_ticket_tier_id,
        v_stage->>'name',
        (v_stage->>'price_cents')::INTEGER,
        'USD',
        (v_stage->>'quantity')::INTEGER,
        0,
        (v_stage->>'order_index')::INTEGER
      );
    END IF;
  END LOOP;

  -- CRITICAL FIX: Sync the ticket_tier's quantity_total with the sum of all stage quantities
  -- This ensures the tier's total always matches the sum of its stages, preventing data inconsistencies
  -- ONLY update when there are stages present to preserve manual quantity_total when all stages are removed
  SELECT 
    COUNT(*) AS stage_count,
    COALESCE(SUM(quantity), 0) AS total_quantity
  INTO v_stage_count, v_total_stage_quantity
  FROM ticket_stages
  WHERE ticket_tier_id = p_ticket_tier_id;

  -- Only update quantity_total if there are stages (preserves manual tier capacity when all stages removed)
  IF v_stage_count > 0 THEN
    UPDATE ticket_tiers
    SET 
      quantity_total = v_total_stage_quantity,
      updated_at = NOW()
    WHERE id = p_ticket_tier_id;
  END IF;

  -- Return success result
  v_result := jsonb_build_object(
    'success', true,
    'message', 'Ticket stages updated successfully',
    'synced_quantity_total', v_total_stage_quantity
  );
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Re-raise the exception to trigger rollback
    RAISE;
END;
$$;


ALTER FUNCTION "public"."update_ticket_stages"("p_ticket_tier_id" "uuid", "p_stages" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_ticket_stages"("p_ticket_tier_id" "uuid", "p_stages" "jsonb") IS 'Atomically updates ticket stages for a ticket tier. Handles delete, update, and insert operations in a transaction. 
Automatically syncs the ticket_tier.quantity_total with the sum of all stage quantities when stages exist.
Preserves manual quantity_total when all stages are removed to maintain tier capacity settings.
Returns JSONB with success status. Raises exceptions on validation failures which trigger automatic rollback.';



CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."checkins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "device_id" character varying(255) NOT NULL,
    "successful" boolean NOT NULL,
    "failure_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."checkins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contact_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "message" "text" NOT NULL,
    "ip_address" "text",
    "status" "text" DEFAULT 'new'::"text",
    "submitted_at" timestamp with time zone DEFAULT "now"(),
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "contact_submissions_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'in_progress'::"text", 'resolved'::"text", 'spam'::"text"])))
);


ALTER TABLE "public"."contact_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."datafast_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "datafast_checkout_id" "text",
    "datafast_transaction_id" "text",
    "merchant_transaction_id" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "transaction_type" "text" NOT NULL,
    "result_code" "text",
    "result_description" "text",
    "amount" numeric(10,2),
    "currency" "text" DEFAULT 'USD'::"text",
    "payment_type" "text" DEFAULT 'DB'::"text",
    "payment_brand" "text",
    "auth_code" "text",
    "reference_no" "text",
    "batch_no" "text",
    "acquirer_code" "text",
    "card_type" "text",
    "acquirer_response" "text",
    "extended_description" "text",
    "clearing_institute_name" "text",
    "card_bin" "text",
    "card_last4" "text",
    "card_holder" "text",
    "card_expiry_month" "text",
    "card_expiry_year" "text",
    "card_bin_country" "text",
    "user_id" "uuid",
    "customer_email" "text",
    "customer_ip" "text",
    "risk_score" "text",
    "risk_status_code" "text",
    "risk_fraud_status_code" "text",
    "order_id" "uuid",
    "hold_id" "uuid",
    "checkout_request_data" "jsonb",
    "checkout_response_data" "jsonb",
    "verification_request_data" "jsonb",
    "verification_response_data" "jsonb",
    "error_code" "text",
    "error_message" "text",
    "error_details" "jsonb",
    "checkout_created_at" timestamp with time zone,
    "payment_attempted_at" timestamp with time zone,
    "verified_at" timestamp with time zone,
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "customer_first_name" "text",
    "customer_last_name" "text",
    "promotional_code_id" "uuid",
    "reference_nbr" "text",
    "recovery_in_progress" boolean DEFAULT false
);


ALTER TABLE "public"."datafast_transactions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."datafast_transactions"."customer_first_name" IS 'Customer first name at time of transaction for easier auditing';



COMMENT ON COLUMN "public"."datafast_transactions"."customer_last_name" IS 'Customer last name at time of transaction for easier auditing';



COMMENT ON COLUMN "public"."datafast_transactions"."promotional_code_id" IS 'Promotional code ID used in this transaction (if any)';



COMMENT ON COLUMN "public"."datafast_transactions"."reference_nbr" IS 'Full reference number from Datafast in format YYMMDD_NNNNNN (e.g., 251028_000063). Corresponds to ReferenceNbr in Datafast response.';



COMMENT ON COLUMN "public"."datafast_transactions"."recovery_in_progress" IS 'Flag indicating transaction recovery is currently in progress. Prevents concurrent recovery workers from processing the same transaction.';



CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "status" character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    "name" character varying(255) NOT NULL,
    "slug" character varying(255) NOT NULL,
    "city" character varying(100) NOT NULL,
    "venue" character varying(255) NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "description" "text",
    "image_url" "text",
    "featured" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "max_attendees" integer DEFAULT 1000,
    "total_rsvps" integer DEFAULT 0,
    "is_featured" boolean DEFAULT false NOT NULL,
    "requires_rsvp" boolean DEFAULT true NOT NULL,
    "registration_form_config" "jsonb",
    "qr_scanner_code" "text",
    "markup_percent" numeric DEFAULT 12.5 NOT NULL,
    "markup_fixed_cents" integer DEFAULT 30 NOT NULL,
    CONSTRAINT "events_check" CHECK (("ends_at" > "starts_at")),
    CONSTRAINT "events_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['draft'::character varying, 'published'::character varying, 'cancelled'::character varying])::"text"[])))
);


ALTER TABLE "public"."events" OWNER TO "postgres";


COMMENT ON COLUMN "public"."events"."requires_rsvp" IS 'Whether the event requires RSVP approval before purchase. If false, users can purchase tickets directly without organizer approval.';



COMMENT ON COLUMN "public"."events"."markup_percent" IS 'Percentage markup added to base ticket prices (default 12.5%). This represents the total platform markup including: Platform Profit (~7%) + Stripe Processing (~2.9%) + International Fees (~1.5%) + Currency Conversion (~1%) + Rounding Buffer (~0.1%). Adjustable per event to modify platform profitability.';



COMMENT ON COLUMN "public"."events"."markup_fixed_cents" IS 'Fixed fee in cents added to each ticket purchase (default 30 cents / $0.30). This represents the Stripe fixed transaction fee. Combined with markup_percent to calculate total customer charge.';



CREATE TABLE IF NOT EXISTS "public"."holds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tier_id" "uuid" NOT NULL,
    "quantity" integer NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "order_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "stage_id" "uuid",
    "stage_name" "text",
    "stage_price_cents" integer,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "fee_percentage" numeric(5,2),
    "payment_in_progress" boolean DEFAULT false,
    "payment_started_at" timestamp with time zone,
    "datafast_checkout_id" "text",
    "promoter_code" character varying(50),
    CONSTRAINT "holds_payment_started_at_required_when_in_progress" CHECK ((("payment_in_progress" = false) OR ("payment_in_progress" IS NULL) OR (("payment_in_progress" = true) AND ("payment_started_at" IS NOT NULL)))),
    CONSTRAINT "holds_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."holds" OWNER TO "postgres";


COMMENT ON COLUMN "public"."holds"."stage_id" IS 'The ticket stage ID at the time of hold creation (null for tiers without stages)';



COMMENT ON COLUMN "public"."holds"."stage_name" IS 'The ticket stage name at the time of hold creation for historical reference';



COMMENT ON COLUMN "public"."holds"."stage_price_cents" IS 'The price in cents at the time of hold creation (from either stage or tier)';



COMMENT ON COLUMN "public"."holds"."updated_at" IS 'Timestamp when the hold was last updated. Automatically set when order_id is assigned or other modifications occur.';



COMMENT ON COLUMN "public"."holds"."fee_percentage" IS 'Service fee percentage used when calculating the hold price (e.g., 7.00 for 7%, 10.00 for 10%). Stored at hold creation time.';



COMMENT ON COLUMN "public"."holds"."payment_in_progress" IS 'Flag indicating payment is currently in progress. Prevents hold expiration during payment.';



COMMENT ON COLUMN "public"."holds"."payment_started_at" IS 'Timestamp when Datafast checkout was created and payment process started.';



COMMENT ON COLUMN "public"."holds"."datafast_checkout_id" IS 'Datafast checkout ID for this hold, used to link transaction to hold.';



COMMENT ON COLUMN "public"."holds"."promoter_code" IS 'Tracks which promoter link was used when creating this hold. Stored server-side to survive redirects and prevent multi-tab conflicts.';



CREATE TABLE IF NOT EXISTS "public"."ticket_tiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "name" character varying(100) NOT NULL,
    "price_cents" integer NOT NULL,
    "currency" character varying(3) DEFAULT 'USD'::character varying,
    "quantity_total" integer NOT NULL,
    "quantity_sold" integer DEFAULT 0,
    "per_user_limit" integer DEFAULT 10,
    "sales_start" timestamp with time zone NOT NULL,
    "sales_end" timestamp with time zone NOT NULL,
    "order_index" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "description" "text",
    "fee_percentage" numeric(5,2),
    "secret_code" "text",
    "registration_form_fields" "text"[],
    CONSTRAINT "quantity_total_gte_quantity_sold" CHECK (("quantity_total" >= "quantity_sold")),
    CONSTRAINT "ticket_tiers_check" CHECK (("sales_end" > "sales_start")),
    CONSTRAINT "ticket_tiers_check1" CHECK (("quantity_sold" <= "quantity_total")),
    CONSTRAINT "ticket_tiers_per_user_limit_check" CHECK (("per_user_limit" > 0)),
    CONSTRAINT "ticket_tiers_price_cents_check" CHECK (("price_cents" >= 0)),
    CONSTRAINT "ticket_tiers_quantity_sold_check" CHECK (("quantity_sold" >= 0)),
    CONSTRAINT "ticket_tiers_quantity_total_check" CHECK (("quantity_total" >= 0)),
    CONSTRAINT "ticket_tiers_secret_code_check" CHECK ((("secret_code" IS NULL) OR ("length"(TRIM(BOTH FROM "secret_code")) >= 3)))
);


ALTER TABLE "public"."ticket_tiers" OWNER TO "postgres";


COMMENT ON COLUMN "public"."ticket_tiers"."price_cents" IS 'Base ticket price in cents (net amount organizer receives). Platform markup (from events.markup_percent and events.markup_fixed_cents) is calculated and added during checkout.';



COMMENT ON COLUMN "public"."ticket_tiers"."fee_percentage" IS 'Service fee percentage used when calculating the ticket price (e.g., 7.00 for 7%, 10.00 for 10%). Stored at tier creation time.';



COMMENT ON COLUMN "public"."ticket_tiers"."secret_code" IS 'Secret code required to purchase this tier. If null, no code is required.';



COMMENT ON COLUMN "public"."ticket_tiers"."registration_form_fields" IS 'Optional array of form field IDs from the event''s registration_form_config that should be shown for this tier. 
If NULL, all form fields from the event are shown. 
If set, only the specified fields (by their "id" property) are displayed and validated.
Example: {''nombre_completo'', ''cedula'', ''fecha_nacimiento'', ''email''}';



COMMENT ON CONSTRAINT "ticket_tiers_secret_code_check" ON "public"."ticket_tiers" IS 'Ensures secret_code is either NULL or has at least 3 characters when provided';



CREATE OR REPLACE VIEW "public"."holds_at_risk_of_expiration" AS
 SELECT "h"."id",
    "h"."user_id",
    "h"."event_id",
    "h"."quantity",
    "h"."expires_at",
    "h"."payment_started_at",
    "h"."payment_in_progress",
    (EXTRACT(epoch FROM ("h"."expires_at" - "now"())) / (60)::numeric) AS "minutes_until_expiration",
    "e"."name" AS "event_name",
    "tt"."name" AS "tier_name"
   FROM (("public"."holds" "h"
     JOIN "public"."events" "e" ON (("h"."event_id" = "e"."id")))
     JOIN "public"."ticket_tiers" "tt" ON (("h"."tier_id" = "tt"."id")))
  WHERE (("h"."order_id" IS NULL) AND ("h"."expires_at" > "now"()) AND ("h"."expires_at" < ("now"() + '00:02:00'::interval)))
  ORDER BY "h"."expires_at";


ALTER VIEW "public"."holds_at_risk_of_expiration" OWNER TO "postgres";


COMMENT ON VIEW "public"."holds_at_risk_of_expiration" IS 'Shows holds that will expire in the next 2 minutes. Useful for monitoring and alerting on holds that might need intervention.';



CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" character varying(255) NOT NULL,
    "clerk_id" character varying(255) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "first_name" character varying(255),
    "last_name" character varying(255),
    "role" "public"."user_role" DEFAULT 'user'::"public"."user_role" NOT NULL,
    "phone" character varying(25),
    "document_id" character varying(10),
    "billing_address" "text",
    "billing_country" character(2) DEFAULT 'EC'::"bpchar",
    "billing_city" character varying(50),
    "document_type" character varying(20) DEFAULT 'IDCARD'::character varying,
    "ip_address" character varying(255),
    "date_of_birth" character varying(10)
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."users"."phone" IS 'Customer phone number (7-25 characters) - required for Datafast';



COMMENT ON COLUMN "public"."users"."document_id" IS 'Document identification number (max 10 characters) - required for Datafast';



COMMENT ON COLUMN "public"."users"."billing_address" IS 'Customer billing address (1-100 characters) - required for Datafast';



COMMENT ON COLUMN "public"."users"."billing_country" IS 'Customer billing country ISO code (default EC for Ecuador)';



COMMENT ON COLUMN "public"."users"."billing_city" IS 'Customer billing city - required for Datafast';



COMMENT ON COLUMN "public"."users"."document_type" IS 'Document type (IDCARD, PASSPORT) - required for Datafast';



COMMENT ON COLUMN "public"."users"."ip_address" IS 'Last known IP address for transaction tracking';



COMMENT ON COLUMN "public"."users"."date_of_birth" IS 'User date of birth in YYYY-MM-DD format (ISO 8601). Required when making a purchase, nullable for existing users. Used for purchase exports and compliance tracking.';



CREATE OR REPLACE VIEW "public"."holds_with_active_payments" AS
 SELECT "h"."id",
    "h"."user_id",
    "h"."event_id",
    "h"."tier_id",
    "h"."quantity",
    "h"."expires_at",
    "h"."payment_started_at",
    "h"."datafast_checkout_id",
    (EXTRACT(epoch FROM ("now"() - "h"."payment_started_at")) / (60)::numeric) AS "payment_age_minutes",
    "e"."name" AS "event_name",
    "tt"."name" AS "tier_name",
    "u"."email" AS "user_email"
   FROM ((("public"."holds" "h"
     JOIN "public"."events" "e" ON (("h"."event_id" = "e"."id")))
     JOIN "public"."ticket_tiers" "tt" ON (("h"."tier_id" = "tt"."id")))
     LEFT JOIN "public"."users" "u" ON (("h"."user_id" = "u"."id")))
  WHERE (("h"."payment_in_progress" = true) AND ("h"."order_id" IS NULL))
  ORDER BY "h"."payment_started_at";


ALTER VIEW "public"."holds_with_active_payments" OWNER TO "postgres";


COMMENT ON VIEW "public"."holds_with_active_payments" IS 'Shows all holds that currently have payment in progress. Useful for monitoring payment flow and identifying stuck payments.';



CREATE TABLE IF NOT EXISTS "public"."order_errors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid",
    "error_type" character varying(100) NOT NULL,
    "error_message" "text" NOT NULL,
    "error_details" "jsonb",
    "severity" character varying(20) DEFAULT 'high'::character varying NOT NULL,
    "resolved" boolean DEFAULT false NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "resolution_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "order_errors_severity_check" CHECK ((("severity")::"text" = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'critical'::character varying])::"text"[])))
);


ALTER TABLE "public"."order_errors" OWNER TO "postgres";


COMMENT ON TABLE "public"."order_errors" IS 'Tracks critical order processing failures for manual reconciliation. Used when payment succeeds but order/ticket creation fails.';



CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "ticket_tier_id" "uuid" NOT NULL,
    "quantity" integer NOT NULL,
    "unit_price_cents" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb",
    CONSTRAINT "order_items_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "order_items_unit_price_cents_check" CHECK (("unit_price_cents" >= 0))
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "event_id" "uuid" NOT NULL,
    "status" character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    "subtotal_cents" integer NOT NULL,
    "fees_cents" integer NOT NULL,
    "total_cents" integer NOT NULL,
    "currency" character varying(3) DEFAULT 'USD'::character varying,
    "stripe_checkout_session_id" character varying(255),
    "idempotency_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "ticket_tier_id" "uuid",
    "quantity" integer,
    "unit_price_cents" integer,
    "total_amount_cents" integer,
    "processing_fee_cents" integer,
    "payment_method" character varying(50),
    "datafast_checkout_id" "text",
    "datafast_transaction_id" "text",
    "datafast_auth_code" "text",
    "datafast_reference_no" "text",
    "payment_provider" "text" DEFAULT 'direct'::"text",
    "merchant_transaction_id" "text",
    "promotional_code_id" "uuid",
    "discount_amount_cents" integer,
    "fee_percentage" numeric(5,2),
    "promoter_code" character varying(50),
    "promoter_user_id" "uuid",
    "original_purchaser_user_id" "uuid",
    "platform_fee_cents" integer DEFAULT 0,
    "stripe_payment_intent_id" "text",
    "source" "text",
    "base_price_cents" integer,
    "markup_percent" numeric,
    "markup_fixed_cents" integer,
    "total_paid_cents" integer,
    "stripe_transfer_id" "text",
    "stripe_fee_cents" integer,
    "organizer_account_id" "text",
    "payment_status" "public"."orders_payment_status",
    "authorized_at" timestamp with time zone,
    "captured_at" timestamp with time zone,
    "canceled_at" timestamp with time zone,
    CONSTRAINT "orders_check" CHECK (("total_cents" = ((("subtotal_cents" + "fees_cents") + COALESCE("platform_fee_cents", 0)) - COALESCE("discount_amount_cents", 0)))),
    CONSTRAINT "orders_discount_amount_cents_check" CHECK (("discount_amount_cents" >= 0)),
    CONSTRAINT "orders_fees_cents_check" CHECK (("fees_cents" >= 0)),
    CONSTRAINT "orders_processing_fee_cents_check" CHECK (("processing_fee_cents" >= 0)),
    CONSTRAINT "orders_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "orders_source_check" CHECK (("source" = ANY (ARRAY['rsvp'::"text", 'hold'::"text", 'direct'::"text"]))),
    CONSTRAINT "orders_status_check" CHECK ((("status")::"text" = ANY (ARRAY[('pending'::character varying)::"text", ('paid'::character varying)::"text", ('failed'::character varying)::"text", ('canceled'::character varying)::"text", ('refunded'::character varying)::"text", ('completed'::character varying)::"text", ('requires_manual_review'::character varying)::"text"]))),
    CONSTRAINT "orders_subtotal_cents_check" CHECK (("subtotal_cents" >= 0)),
    CONSTRAINT "orders_total_amount_cents_check" CHECK (("total_amount_cents" >= 0)),
    CONSTRAINT "orders_total_cents_check" CHECK (("total_cents" >= 0)),
    CONSTRAINT "orders_unit_price_cents_check" CHECK (("unit_price_cents" >= 0))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


COMMENT ON COLUMN "public"."orders"."datafast_checkout_id" IS 'Datafast CheckoutId from initial payment request';



COMMENT ON COLUMN "public"."orders"."datafast_transaction_id" IS 'Datafast payment ID from transaction response';



COMMENT ON COLUMN "public"."orders"."datafast_auth_code" IS 'Authorization code from approved transaction';



COMMENT ON COLUMN "public"."orders"."datafast_reference_no" IS 'Reference number from Datafast transaction';



COMMENT ON COLUMN "public"."orders"."payment_provider" IS 'Payment provider used: datafast or direct';



COMMENT ON COLUMN "public"."orders"."merchant_transaction_id" IS 'Unique merchant transaction ID sent to Datafast';



COMMENT ON COLUMN "public"."orders"."fee_percentage" IS 'Service fee percentage used when calculating the order price (e.g., 7.00 for 7%, 10.00 for 10%). Stored at order creation time.';



COMMENT ON COLUMN "public"."orders"."promoter_code" IS 'Tracks which promoter link was used for this purchase';



COMMENT ON COLUMN "public"."orders"."promoter_user_id" IS 'Optional: Links promoter code to a specific user account';



COMMENT ON COLUMN "public"."orders"."original_purchaser_user_id" IS 'User ID of the original purchaser. Used when tickets are transferred to track who originally bought them. If NULL, user_id is the original purchaser.';



COMMENT ON COLUMN "public"."orders"."source" IS 'Tracks the source/channel of the order (e.g., "rsvp", "hold", "direct")';



CREATE TABLE IF NOT EXISTS "public"."organization_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" character varying(50) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "organization_members_role_check" CHECK ((("role")::"text" = ANY ((ARRAY['owner'::character varying, 'admin'::character varying, 'organizer'::character varying, 'viewer'::character varying])::"text"[])))
);


ALTER TABLE "public"."organization_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "slug" character varying(100) NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "approved" boolean DEFAULT false NOT NULL,
    "stripe_account_id" "text",
    "stripe_charges_enabled" boolean DEFAULT false,
    "stripe_payouts_enabled" boolean DEFAULT false,
    "platform_fee_percent" numeric(5,2) DEFAULT 7.00
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."organizations"."updated_at" IS 'Timestamp when the organization was last updated. Updated when approval status changes.';



COMMENT ON COLUMN "public"."organizations"."approved" IS 'Whether the organization has been approved by admin to create events. Default false - requires manual approval.';



CREATE TABLE IF NOT EXISTS "public"."payout_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stripe_payout_id" "text" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "amount" integer NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "arrival_date" timestamp with time zone,
    "created_at" timestamp with time zone NOT NULL,
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payout_logs_amount_check" CHECK (("amount" > 0)),
    CONSTRAINT "payout_logs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'failed'::"text", 'canceled'::"text", 'in_transit'::"text"])))
);


ALTER TABLE "public"."payout_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."payout_logs" IS 'Audit trail of all payout requests and their outcomes. Tracks who requested payouts, when, and the results.';



COMMENT ON COLUMN "public"."payout_logs"."stripe_payout_id" IS 'Stripe payout ID (po_xxx) for reconciliation with Stripe dashboard';



COMMENT ON COLUMN "public"."payout_logs"."requested_by" IS 'User ID of the admin/owner who initiated the payout request';



COMMENT ON COLUMN "public"."payout_logs"."status" IS 'Current payout status from Stripe (pending, paid, failed, canceled, in_transit)';



COMMENT ON COLUMN "public"."payout_logs"."arrival_date" IS 'Expected arrival date of funds in bank account (from Stripe)';



COMMENT ON COLUMN "public"."payout_logs"."created_at" IS 'Timestamp when payout was created in Stripe';



COMMENT ON COLUMN "public"."payout_logs"."recorded_at" IS 'Timestamp when payout was recorded in our database';



CREATE TABLE IF NOT EXISTS "public"."promoter_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "promoter_code" character varying(50) NOT NULL,
    "promoter_name" character varying(255),
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."promoter_links" OWNER TO "postgres";


COMMENT ON TABLE "public"."promoter_links" IS 'Tracks promoter links created by organizers for events';



CREATE TABLE IF NOT EXISTS "public"."promotional_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "code" character varying(50) NOT NULL,
    "discount_percentage" integer NOT NULL,
    "usage_limit" integer NOT NULL,
    "usage_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "promotional_codes_discount_percentage_check" CHECK ((("discount_percentage" >= 5) AND ("discount_percentage" <= 100) AND (("discount_percentage" % 5) = 0))),
    CONSTRAINT "promotional_codes_usage_count_check" CHECK (("usage_count" >= 0)),
    CONSTRAINT "promotional_codes_usage_limit_check" CHECK (("usage_limit" > 0)),
    CONSTRAINT "usage_not_exceed_limit" CHECK (("usage_count" <= "usage_limit"))
);


ALTER TABLE "public"."promotional_codes" OWNER TO "postgres";


COMMENT ON TABLE "public"."promotional_codes" IS 'Stores promotional discount codes for events with usage limits';



COMMENT ON CONSTRAINT "usage_not_exceed_limit" ON "public"."promotional_codes" IS 'Ensures promotional code usage_count cannot exceed usage_limit, preventing oversubscription at the database level';



CREATE TABLE IF NOT EXISTS "public"."promotional_tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "ticket_tier_id" "uuid" NOT NULL,
    "email" character varying(255) NOT NULL,
    "customer_name" character varying(255) NOT NULL,
    "qr_token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status" character varying(50) DEFAULT 'issued'::character varying NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "checked_in_at" timestamp with time zone,
    "checked_in_device_id" character varying(255),
    "metadata" "jsonb",
    CONSTRAINT "promotional_tickets_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['issued'::character varying, 'void'::character varying, 'checked_in'::character varying])::"text"[])))
);


ALTER TABLE "public"."promotional_tickets" OWNER TO "postgres";


COMMENT ON TABLE "public"."promotional_tickets" IS 'Stores free promotional tickets sent by organizers to promoters/VIPs';



CREATE TABLE IF NOT EXISTS "public"."purchase_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rsvp_id" "uuid" NOT NULL,
    "token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."purchase_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rsvp_pending_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '02:00:00'::interval) NOT NULL,
    "clerk_user_id" "text" NOT NULL,
    "event_id" "uuid" NOT NULL,
    "ticket_tier_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "stage_id" "uuid",
    "secret_code" "text",
    "promoter_code" "text",
    "registration_data" "jsonb"
);


ALTER TABLE "public"."rsvp_pending_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rsvps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "requested_quantity" integer NOT NULL,
    "status" character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    "approved_expires_at" timestamp with time zone,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "ticket_tier_id" "uuid",
    "requested_at" timestamp with time zone DEFAULT "now"(),
    "approved_at" timestamp with time zone,
    "approved_by" "uuid",
    "rejected_at" timestamp with time zone,
    "rejected_by" "uuid",
    "stage_id" "uuid",
    "stage_name" "text",
    "stage_price_cents" integer,
    "fee_percentage" numeric(5,2),
    "registration_data" "jsonb",
    "promoter_code" character varying(50),
    "promoter_user_id" "uuid",
    "stripe_payment_intent_id" "text",
    "payment_requires_follow_up" boolean DEFAULT false,
    "last_notified_at" timestamp with time zone,
    "payment_attempt" integer DEFAULT 0,
    "base_price_cents" integer,
    "markup_percent" numeric,
    "markup_fixed_cents" integer,
    "total_amount_cents" integer,
    "purchased_at" timestamp with time zone,
    "promotional_code_id" "uuid",
    "discount_amount_cents" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "rsvps_discount_amount_cents_nonnegative" CHECK (("discount_amount_cents" >= 0)),
    CONSTRAINT "rsvps_requested_quantity_check" CHECK (("requested_quantity" > 0)),
    CONSTRAINT "rsvps_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'expired'::character varying, 'purchased'::character varying])::"text"[])))
);


ALTER TABLE "public"."rsvps" OWNER TO "postgres";


COMMENT ON COLUMN "public"."rsvps"."stage_id" IS 'The ticket stage ID at the time of RSVP creation (null for tiers without stages)';



COMMENT ON COLUMN "public"."rsvps"."stage_name" IS 'The ticket stage name at the time of RSVP creation for historical reference';



COMMENT ON COLUMN "public"."rsvps"."stage_price_cents" IS 'The price in cents at the time of RSVP creation (from either stage or tier)';



COMMENT ON COLUMN "public"."rsvps"."fee_percentage" IS 'Service fee percentage used when calculating the RSVP price (e.g., 7.00 for 7%, 10.00 for 10%). Stored at RSVP creation time.';



COMMENT ON COLUMN "public"."rsvps"."promoter_code" IS 'Tracks which promoter link was used for this RSVP';



COMMENT ON COLUMN "public"."rsvps"."promoter_user_id" IS 'Optional: Links promoter code to a specific user account';



COMMENT ON COLUMN "public"."rsvps"."last_notified_at" IS 'Timestamp of the last payment authorization expiry notification sent to the organizer. Used by the monitor-payment-authorizations cron job to prevent duplicate notifications.';



CREATE TABLE IF NOT EXISTS "public"."stripe_payment_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stripe_payment_intent_id" "text" NOT NULL,
    "stripe_event_id" "text" NOT NULL,
    "stripe_event_type" "text" NOT NULL,
    "amount_cents" integer NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text" NOT NULL,
    "status" "text" NOT NULL,
    "capture_method" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "hold_id" "uuid",
    "rsvp_id" "uuid",
    "order_id" "uuid",
    "user_id" "uuid",
    "event_id" "uuid",
    "organization_id" "uuid",
    "base_price_cents" integer,
    "platform_fee_cents" integer,
    "markup_percent" numeric(5,2),
    "markup_fixed_cents" integer,
    "transfer_destination" "text",
    "transfer_amount_cents" integer,
    "last_payment_error" "text",
    "cancellation_reason" "text",
    "stripe_created_at" timestamp with time zone NOT NULL,
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "raw_event_data" "jsonb",
    CONSTRAINT "stripe_payment_audit_status_check" CHECK (("status" = ANY (ARRAY['requires_payment_method'::"text", 'requires_confirmation'::"text", 'requires_action'::"text", 'processing'::"text", 'requires_capture'::"text", 'canceled'::"text", 'succeeded'::"text"])))
);


ALTER TABLE "public"."stripe_payment_audit" OWNER TO "postgres";


COMMENT ON TABLE "public"."stripe_payment_audit" IS 'Complete audit trail of all Stripe payment intent events for reconciliation, troubleshooting, and compliance. Records every webhook event received from Stripe.';



COMMENT ON COLUMN "public"."stripe_payment_audit"."stripe_event_id" IS 'Unique Stripe webhook event ID (evt_xxx) - ensures we can track duplicate webhook deliveries';



COMMENT ON COLUMN "public"."stripe_payment_audit"."metadata" IS 'Complete metadata object from PaymentIntent - includes holdId, rsvpId, pricing breakdown, etc.';



COMMENT ON COLUMN "public"."stripe_payment_audit"."raw_event_data" IS 'Complete webhook event payload for debugging - stored as JSONB for queryability';



CREATE TABLE IF NOT EXISTS "public"."ticket_stages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_tier_id" "uuid" NOT NULL,
    "name" character varying NOT NULL,
    "price_cents" integer NOT NULL,
    "currency" character varying DEFAULT 'USD'::character varying,
    "quantity" integer NOT NULL,
    "sold_quantity" integer DEFAULT 0,
    "order_index" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "fee_percentage" numeric(5,2),
    CONSTRAINT "quantity_gte_sold_quantity" CHECK (("quantity" >= "sold_quantity")),
    CONSTRAINT "ticket_stages_price_cents_check" CHECK (("price_cents" >= 0)),
    CONSTRAINT "ticket_stages_quantity_check" CHECK (("quantity" >= 0)),
    CONSTRAINT "ticket_stages_sold_quantity_check" CHECK (("sold_quantity" >= 0))
);


ALTER TABLE "public"."ticket_stages" OWNER TO "postgres";


COMMENT ON TABLE "public"."ticket_stages" IS 'Table storing staged pricing for ticket tiers. RLS policies ensure users can view stages for published events, and organizers can manage stages for their events.';



COMMENT ON COLUMN "public"."ticket_stages"."price_cents" IS 'Base ticket price in cents (net amount organizer receives). Platform markup (from events.markup_percent and events.markup_fixed_cents) is calculated and added during checkout.';



COMMENT ON COLUMN "public"."ticket_stages"."fee_percentage" IS 'Service fee percentage used when calculating the stage price (e.g., 7.00 for 7%, 10.00 for 10%). Stored at stage creation time.';



CREATE TABLE IF NOT EXISTS "public"."ticket_stages_price_backup" (
    "id" "uuid",
    "price_cents" integer,
    "fee_percentage" numeric(5,2),
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."ticket_stages_price_backup" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_tiers_price_backup" (
    "id" "uuid",
    "price_cents" integer,
    "fee_percentage" numeric(5,2),
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."ticket_tiers_price_backup" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "ticket_tier_id" "uuid" NOT NULL,
    "attendee_name" character varying(255) NOT NULL,
    "attendee_email" character varying(255) NOT NULL,
    "status" character varying(20) DEFAULT 'issued'::character varying NOT NULL,
    "qr_token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "checked_in_at" timestamp with time zone,
    "checked_in_device_id" character varying(255),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "qr_code" "text",
    "user_id" "uuid",
    "event_id" "uuid",
    "metadata" "jsonb",
    CONSTRAINT "tickets_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['issued'::character varying, 'void'::character varying, 'checked_in'::character varying, 'refunded'::character varying])::"text"[])))
);


ALTER TABLE "public"."tickets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_sync_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clerk_id" character varying NOT NULL,
    "email" character varying NOT NULL,
    "first_name" character varying,
    "last_name" character varying,
    "event_type" character varying NOT NULL,
    "processed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "processed_at" timestamp with time zone
);


ALTER TABLE "public"."user_sync_queue" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_active_holds_by_stage" AS
 SELECT "h"."tier_id",
    "h"."stage_id",
    "ts"."name" AS "stage_name",
    "count"(*) AS "hold_count",
    "sum"("h"."quantity") AS "total_held_quantity",
    "min"("h"."expires_at") AS "earliest_expiration",
    "max"("h"."expires_at") AS "latest_expiration",
    "tt"."name" AS "tier_name",
    "e"."name" AS "event_name",
    "e"."slug" AS "event_slug"
   FROM ((("public"."holds" "h"
     JOIN "public"."ticket_tiers" "tt" ON (("tt"."id" = "h"."tier_id")))
     JOIN "public"."events" "e" ON (("e"."id" = "h"."event_id")))
     LEFT JOIN "public"."ticket_stages" "ts" ON (("ts"."id" = "h"."stage_id")))
  WHERE (("h"."expires_at" > "now"()) AND ("h"."order_id" IS NULL))
  GROUP BY "h"."tier_id", "h"."stage_id", "ts"."name", "tt"."name", "e"."name", "e"."slug"
  ORDER BY ("min"("h"."expires_at"));


ALTER VIEW "public"."v_active_holds_by_stage" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_active_holds_by_stage" IS 'Shows all currently active holds grouped by stage for monitoring and debugging';



CREATE TABLE IF NOT EXISTS "public"."webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" character varying(50) NOT NULL,
    "event_id_external" character varying(255) NOT NULL,
    "event_type" character varying(100) NOT NULL,
    "payload" "jsonb" NOT NULL,
    "signature" character varying(500),
    "processed_at" timestamp with time zone,
    "status" character varying(20) DEFAULT 'pending'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "webhook_events_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['pending'::character varying, 'processed'::character varying, 'failed'::character varying])::"text"[])))
);


ALTER TABLE "public"."webhook_events" OWNER TO "postgres";


ALTER TABLE ONLY "public"."checkins"
    ADD CONSTRAINT "checkins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_submissions"
    ADD CONSTRAINT "contact_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."datafast_transactions"
    ADD CONSTRAINT "datafast_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_organization_id_slug_key" UNIQUE ("organization_id", "slug");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_qr_scanner_code_key" UNIQUE ("qr_scanner_code");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_qr_scanner_code_unique" UNIQUE ("qr_scanner_code");



ALTER TABLE ONLY "public"."holds"
    ADD CONSTRAINT "holds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_errors"
    ADD CONSTRAINT "order_errors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_ticket_tier_id_key" UNIQUE ("order_id", "ticket_tier_id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_user_id_key" UNIQUE ("organization_id", "user_id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."payout_logs"
    ADD CONSTRAINT "payout_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promoter_links"
    ADD CONSTRAINT "promoter_links_event_id_promoter_code_key" UNIQUE ("event_id", "promoter_code");



ALTER TABLE ONLY "public"."promoter_links"
    ADD CONSTRAINT "promoter_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promotional_codes"
    ADD CONSTRAINT "promotional_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promotional_tickets"
    ADD CONSTRAINT "promotional_tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promotional_tickets"
    ADD CONSTRAINT "promotional_tickets_qr_token_key" UNIQUE ("qr_token");



ALTER TABLE ONLY "public"."purchase_tokens"
    ADD CONSTRAINT "purchase_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rsvp_pending_requests"
    ADD CONSTRAINT "rsvp_pending_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rsvps"
    ADD CONSTRAINT "rsvps_event_id_user_id_key" UNIQUE ("event_id", "user_id");



ALTER TABLE ONLY "public"."rsvps"
    ADD CONSTRAINT "rsvps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_payment_audit"
    ADD CONSTRAINT "stripe_payment_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_stages"
    ADD CONSTRAINT "ticket_stages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_tiers"
    ADD CONSTRAINT "ticket_tiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_qr_token_key" UNIQUE ("qr_token");



ALTER TABLE ONLY "public"."user_sync_queue"
    ADD CONSTRAINT "user_sync_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_clerk_id_key" UNIQUE ("clerk_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_provider_event_id_external_key" UNIQUE ("provider", "event_id_external");



CREATE INDEX "idx_checkins_created_at" ON "public"."checkins" USING "btree" ("created_at");



CREATE INDEX "idx_checkins_device_id" ON "public"."checkins" USING "btree" ("device_id");



CREATE INDEX "idx_checkins_ticket_id" ON "public"."checkins" USING "btree" ("ticket_id");



CREATE INDEX "idx_contact_submissions_status" ON "public"."contact_submissions" USING "btree" ("status");



CREATE INDEX "idx_contact_submissions_submitted_at" ON "public"."contact_submissions" USING "btree" ("submitted_at" DESC);



CREATE INDEX "idx_datafast_transactions_checkout_id" ON "public"."datafast_transactions" USING "btree" ("datafast_checkout_id");



CREATE INDEX "idx_datafast_transactions_created_at" ON "public"."datafast_transactions" USING "btree" ("created_at");



CREATE INDEX "idx_datafast_transactions_merchant_id" ON "public"."datafast_transactions" USING "btree" ("merchant_transaction_id");



CREATE INDEX "idx_datafast_transactions_order_id" ON "public"."datafast_transactions" USING "btree" ("order_id");



CREATE INDEX "idx_datafast_transactions_promotional_code_id" ON "public"."datafast_transactions" USING "btree" ("promotional_code_id");



CREATE INDEX "idx_datafast_transactions_recovery_in_progress" ON "public"."datafast_transactions" USING "btree" ("recovery_in_progress") WHERE ("recovery_in_progress" = true);



CREATE INDEX "idx_datafast_transactions_result_code" ON "public"."datafast_transactions" USING "btree" ("result_code");



CREATE INDEX "idx_datafast_transactions_status" ON "public"."datafast_transactions" USING "btree" ("status");



CREATE INDEX "idx_datafast_transactions_transaction_id" ON "public"."datafast_transactions" USING "btree" ("datafast_transaction_id");



CREATE INDEX "idx_datafast_transactions_unprocessed" ON "public"."datafast_transactions" USING "btree" ("status") WHERE ("status" = ANY (ARRAY['pending'::"text", 'processing'::"text"]));



CREATE INDEX "idx_datafast_transactions_user_id" ON "public"."datafast_transactions" USING "btree" ("user_id");



CREATE INDEX "idx_events_city" ON "public"."events" USING "btree" ("city");



CREATE INDEX "idx_events_featured" ON "public"."events" USING "btree" ("featured") WHERE ("featured" = true);



CREATE INDEX "idx_events_organization_id" ON "public"."events" USING "btree" ("organization_id");



CREATE INDEX "idx_events_requires_rsvp" ON "public"."events" USING "btree" ("requires_rsvp");



CREATE INDEX "idx_events_slug" ON "public"."events" USING "btree" ("slug");



CREATE INDEX "idx_events_starts_at" ON "public"."events" USING "btree" ("starts_at");



CREATE INDEX "idx_events_status" ON "public"."events" USING "btree" ("status");



CREATE INDEX "idx_holds_datafast_checkout" ON "public"."holds" USING "btree" ("datafast_checkout_id") WHERE ("datafast_checkout_id" IS NOT NULL);



CREATE INDEX "idx_holds_event_id" ON "public"."holds" USING "btree" ("event_id");



CREATE INDEX "idx_holds_expires_at" ON "public"."holds" USING "btree" ("expires_at");



CREATE INDEX "idx_holds_fee_percentage" ON "public"."holds" USING "btree" ("fee_percentage");



CREATE INDEX "idx_holds_order_id" ON "public"."holds" USING "btree" ("order_id");



CREATE INDEX "idx_holds_payment_in_progress" ON "public"."holds" USING "btree" ("payment_in_progress") WHERE ("payment_in_progress" = true);



CREATE INDEX "idx_holds_promoter_code" ON "public"."holds" USING "btree" ("promoter_code");



CREATE INDEX "idx_holds_stage_id" ON "public"."holds" USING "btree" ("stage_id");



CREATE INDEX "idx_holds_tier_id" ON "public"."holds" USING "btree" ("tier_id");



CREATE INDEX "idx_holds_updated_at" ON "public"."holds" USING "btree" ("updated_at");



CREATE INDEX "idx_holds_user_id" ON "public"."holds" USING "btree" ("user_id");



CREATE INDEX "idx_order_errors_order_id" ON "public"."order_errors" USING "btree" ("order_id");



CREATE INDEX "idx_order_errors_unresolved" ON "public"."order_errors" USING "btree" ("resolved", "severity", "created_at" DESC) WHERE (NOT "resolved");



CREATE INDEX "idx_order_items_order_id" ON "public"."order_items" USING "btree" ("order_id");



CREATE INDEX "idx_order_items_ticket_tier_id" ON "public"."order_items" USING "btree" ("ticket_tier_id");



CREATE INDEX "idx_orders_created_at" ON "public"."orders" USING "btree" ("created_at");



CREATE INDEX "idx_orders_datafast_checkout_id" ON "public"."orders" USING "btree" ("datafast_checkout_id");



CREATE INDEX "idx_orders_datafast_transaction_id" ON "public"."orders" USING "btree" ("datafast_transaction_id");



CREATE INDEX "idx_orders_event_id" ON "public"."orders" USING "btree" ("event_id");



CREATE INDEX "idx_orders_fee_percentage" ON "public"."orders" USING "btree" ("fee_percentage");



CREATE INDEX "idx_orders_idempotency_key" ON "public"."orders" USING "btree" ("idempotency_key");



CREATE INDEX "idx_orders_merchant_transaction_id" ON "public"."orders" USING "btree" ("merchant_transaction_id");



CREATE INDEX "idx_orders_organization_id" ON "public"."orders" USING "btree" ("organization_id");



CREATE INDEX "idx_orders_organizer_account_id" ON "public"."orders" USING "btree" ("organizer_account_id") WHERE ("organizer_account_id" IS NOT NULL);



COMMENT ON INDEX "public"."idx_orders_organizer_account_id" IS 'Partial index for organizer lookups, excludes NULL values for efficiency';



CREATE INDEX "idx_orders_original_purchaser_user_id" ON "public"."orders" USING "btree" ("original_purchaser_user_id");



CREATE INDEX "idx_orders_payment_provider" ON "public"."orders" USING "btree" ("payment_provider");



CREATE INDEX "idx_orders_promoter_code" ON "public"."orders" USING "btree" ("promoter_code");



CREATE INDEX "idx_orders_promoter_user_id" ON "public"."orders" USING "btree" ("promoter_user_id");



CREATE INDEX "idx_orders_promotional_code_id" ON "public"."orders" USING "btree" ("promotional_code_id");



CREATE INDEX "idx_orders_source" ON "public"."orders" USING "btree" ("source");



CREATE INDEX "idx_orders_status" ON "public"."orders" USING "btree" ("status");



CREATE INDEX "idx_orders_stripe_payment_intent_id" ON "public"."orders" USING "btree" ("stripe_payment_intent_id");



CREATE INDEX "idx_orders_stripe_session_id" ON "public"."orders" USING "btree" ("stripe_checkout_session_id");



CREATE INDEX "idx_orders_stripe_transfer_id" ON "public"."orders" USING "btree" ("stripe_transfer_id") WHERE ("stripe_transfer_id" IS NOT NULL);



CREATE INDEX "idx_orders_user_id" ON "public"."orders" USING "btree" ("user_id");



CREATE INDEX "idx_organization_members_organization_id" ON "public"."organization_members" USING "btree" ("organization_id");



CREATE INDEX "idx_organization_members_role" ON "public"."organization_members" USING "btree" ("role");



CREATE INDEX "idx_organization_members_user_id" ON "public"."organization_members" USING "btree" ("user_id");



CREATE INDEX "idx_organizations_approved" ON "public"."organizations" USING "btree" ("approved");



CREATE INDEX "idx_organizations_owner_user_id" ON "public"."organizations" USING "btree" ("owner_user_id");



CREATE INDEX "idx_organizations_slug" ON "public"."organizations" USING "btree" ("slug");



CREATE INDEX "idx_organizations_stripe_account_id" ON "public"."organizations" USING "btree" ("stripe_account_id");



CREATE INDEX "idx_payout_logs_organization_id" ON "public"."payout_logs" USING "btree" ("organization_id");



CREATE INDEX "idx_payout_logs_requested_by" ON "public"."payout_logs" USING "btree" ("requested_by");



CREATE INDEX "idx_payout_logs_stripe_payout_id" ON "public"."payout_logs" USING "btree" ("stripe_payout_id");



CREATE INDEX "idx_promoter_links_code" ON "public"."promoter_links" USING "btree" ("promoter_code");



CREATE INDEX "idx_promoter_links_event_id" ON "public"."promoter_links" USING "btree" ("event_id");



CREATE INDEX "idx_promotional_codes_code" ON "public"."promotional_codes" USING "btree" ("code");



CREATE INDEX "idx_promotional_codes_created_by" ON "public"."promotional_codes" USING "btree" ("created_by");



CREATE INDEX "idx_promotional_codes_event_id" ON "public"."promotional_codes" USING "btree" ("event_id");



CREATE UNIQUE INDEX "idx_promotional_codes_unique_event_code" ON "public"."promotional_codes" USING "btree" ("event_id", "lower"(("code")::"text"));



CREATE INDEX "idx_promotional_tickets_created_by" ON "public"."promotional_tickets" USING "btree" ("created_by");



CREATE INDEX "idx_promotional_tickets_event_email" ON "public"."promotional_tickets" USING "btree" ("event_id", "lower"(("email")::"text"));



CREATE INDEX "idx_promotional_tickets_event_id" ON "public"."promotional_tickets" USING "btree" ("event_id");



CREATE INDEX "idx_promotional_tickets_qr_token" ON "public"."promotional_tickets" USING "btree" ("qr_token");



CREATE INDEX "idx_promotional_tickets_status" ON "public"."promotional_tickets" USING "btree" ("status");



CREATE INDEX "idx_purchase_tokens_expires_at" ON "public"."purchase_tokens" USING "btree" ("expires_at");



CREATE UNIQUE INDEX "idx_purchase_tokens_one_unused_per_rsvp" ON "public"."purchase_tokens" USING "btree" ("rsvp_id") WHERE ("used_at" IS NULL);



COMMENT ON INDEX "public"."idx_purchase_tokens_one_unused_per_rsvp" IS 'Ensures only one unused purchase token exists per RSVP. Multiple used tokens are allowed for history tracking.';



CREATE INDEX "idx_purchase_tokens_rsvp_id" ON "public"."purchase_tokens" USING "btree" ("rsvp_id");



CREATE UNIQUE INDEX "idx_purchase_tokens_token" ON "public"."purchase_tokens" USING "btree" ("token");



CREATE INDEX "idx_rsvp_pending_requests_clerk_user_id" ON "public"."rsvp_pending_requests" USING "btree" ("clerk_user_id");



CREATE INDEX "idx_rsvp_pending_requests_expires_at" ON "public"."rsvp_pending_requests" USING "btree" ("expires_at");



CREATE UNIQUE INDEX "idx_rsvp_pending_requests_user_event" ON "public"."rsvp_pending_requests" USING "btree" ("clerk_user_id", "event_id");



COMMENT ON INDEX "public"."idx_rsvp_pending_requests_user_event" IS 'Unique index enforcing one pending RSVP per user per event and optimizing lookups';



CREATE INDEX "idx_rsvps_approved_expires_at" ON "public"."rsvps" USING "btree" ("approved_expires_at") WHERE (("status")::"text" = 'approved'::"text");



CREATE INDEX "idx_rsvps_event_id" ON "public"."rsvps" USING "btree" ("event_id");



CREATE INDEX "idx_rsvps_fee_percentage" ON "public"."rsvps" USING "btree" ("fee_percentage");



CREATE INDEX "idx_rsvps_last_notified_at" ON "public"."rsvps" USING "btree" ("last_notified_at") WHERE ((("status")::"text" = 'pending'::"text") AND ("stripe_payment_intent_id" IS NOT NULL));



CREATE INDEX "idx_rsvps_payment_monitoring" ON "public"."rsvps" USING "btree" ("status", "stripe_payment_intent_id", "created_at") WHERE ((("status")::"text" = 'pending'::"text") AND ("stripe_payment_intent_id" IS NOT NULL));



CREATE INDEX "idx_rsvps_promoter_code" ON "public"."rsvps" USING "btree" ("promoter_code");



CREATE INDEX "idx_rsvps_promoter_user_id" ON "public"."rsvps" USING "btree" ("promoter_user_id");



CREATE INDEX "idx_rsvps_promotional_code_id" ON "public"."rsvps" USING "btree" ("promotional_code_id");



CREATE INDEX "idx_rsvps_stage_id" ON "public"."rsvps" USING "btree" ("stage_id");



CREATE INDEX "idx_rsvps_status" ON "public"."rsvps" USING "btree" ("status");



CREATE INDEX "idx_rsvps_stripe_payment_intent_id" ON "public"."rsvps" USING "btree" ("stripe_payment_intent_id");



CREATE INDEX "idx_rsvps_user_id" ON "public"."rsvps" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_single_featured_event" ON "public"."events" USING "btree" ("is_featured") WHERE ("is_featured" = true);



COMMENT ON INDEX "public"."idx_single_featured_event" IS 'Ensures only one event can have is_featured = true at any given time. This is a partial unique index that only applies when is_featured is true.';



CREATE INDEX "idx_stripe_payment_audit_event_id" ON "public"."stripe_payment_audit" USING "btree" ("stripe_event_id");



CREATE INDEX "idx_stripe_payment_audit_event_type" ON "public"."stripe_payment_audit" USING "btree" ("stripe_event_type");



CREATE INDEX "idx_stripe_payment_audit_order_id" ON "public"."stripe_payment_audit" USING "btree" ("order_id") WHERE ("order_id" IS NOT NULL);



CREATE INDEX "idx_stripe_payment_audit_organization_id" ON "public"."stripe_payment_audit" USING "btree" ("organization_id") WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "idx_stripe_payment_audit_pi_id" ON "public"."stripe_payment_audit" USING "btree" ("stripe_payment_intent_id");



CREATE INDEX "idx_stripe_payment_audit_pi_recorded" ON "public"."stripe_payment_audit" USING "btree" ("stripe_payment_intent_id", "recorded_at" DESC);



CREATE INDEX "idx_stripe_payment_audit_recorded_at" ON "public"."stripe_payment_audit" USING "btree" ("recorded_at" DESC);



CREATE INDEX "idx_stripe_payment_audit_status" ON "public"."stripe_payment_audit" USING "btree" ("status");



CREATE INDEX "idx_stripe_payment_audit_user_id" ON "public"."stripe_payment_audit" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_ticket_stages_fee_percentage" ON "public"."ticket_stages" USING "btree" ("fee_percentage");



CREATE INDEX "idx_ticket_stages_order_index" ON "public"."ticket_stages" USING "btree" ("ticket_tier_id", "order_index");



CREATE INDEX "idx_ticket_stages_tier_id" ON "public"."ticket_stages" USING "btree" ("ticket_tier_id");



CREATE INDEX "idx_ticket_tiers_event_id" ON "public"."ticket_tiers" USING "btree" ("event_id");



CREATE INDEX "idx_ticket_tiers_fee_percentage" ON "public"."ticket_tiers" USING "btree" ("fee_percentage");



CREATE INDEX "idx_ticket_tiers_order_index" ON "public"."ticket_tiers" USING "btree" ("order_index");



CREATE INDEX "idx_ticket_tiers_sales_window" ON "public"."ticket_tiers" USING "btree" ("sales_start", "sales_end");



CREATE INDEX "idx_tickets_attendee_email" ON "public"."tickets" USING "btree" ("attendee_email");



CREATE INDEX "idx_tickets_order_id" ON "public"."tickets" USING "btree" ("order_id");



CREATE INDEX "idx_tickets_qr_token" ON "public"."tickets" USING "btree" ("qr_token");



CREATE INDEX "idx_tickets_status" ON "public"."tickets" USING "btree" ("status");



CREATE INDEX "idx_tickets_ticket_tier_id" ON "public"."tickets" USING "btree" ("ticket_tier_id");



CREATE UNIQUE INDEX "idx_tickets_unique_checkin" ON "public"."tickets" USING "btree" ("qr_token") WHERE (("status")::"text" = 'checked_in'::"text");



CREATE INDEX "idx_user_sync_queue_processed" ON "public"."user_sync_queue" USING "btree" ("processed", "created_at");



CREATE INDEX "idx_users_clerk_id" ON "public"."users" USING "btree" ("clerk_id");



CREATE INDEX "idx_users_email" ON "public"."users" USING "btree" ("email");



CREATE INDEX "idx_users_identification_doc_id" ON "public"."users" USING "btree" ("document_id");



CREATE INDEX "idx_users_role" ON "public"."users" USING "btree" ("role");



CREATE INDEX "idx_webhook_events_created_at" ON "public"."webhook_events" USING "btree" ("created_at");



CREATE INDEX "idx_webhook_events_event_type" ON "public"."webhook_events" USING "btree" ("event_type");



CREATE INDEX "idx_webhook_events_provider" ON "public"."webhook_events" USING "btree" ("provider");



CREATE INDEX "idx_webhook_events_status" ON "public"."webhook_events" USING "btree" ("status");



CREATE UNIQUE INDEX "orders_stripe_payment_intent_id_key" ON "public"."orders" USING "btree" ("stripe_payment_intent_id") WHERE ("stripe_payment_intent_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "set_datafast_transactions_updated_at" BEFORE UPDATE ON "public"."datafast_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."update_datafast_transactions_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_update_holds_updated_at" BEFORE UPDATE ON "public"."holds" FOR EACH ROW EXECUTE FUNCTION "public"."update_holds_updated_at"();



ALTER TABLE ONLY "public"."checkins"
    ADD CONSTRAINT "checkins_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_submissions"
    ADD CONSTRAINT "contact_submissions_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



COMMENT ON CONSTRAINT "contact_submissions_resolved_by_fkey" ON "public"."contact_submissions" IS 'Set null: Preserve contact submission history when admin user is deleted';



ALTER TABLE ONLY "public"."datafast_transactions"
    ADD CONSTRAINT "datafast_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."datafast_transactions"
    ADD CONSTRAINT "datafast_transactions_promotional_code_id_fkey" FOREIGN KEY ("promotional_code_id") REFERENCES "public"."promotional_codes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."datafast_transactions"
    ADD CONSTRAINT "datafast_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rsvp_pending_requests"
    ADD CONSTRAINT "fk_rsvp_pending_event" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rsvp_pending_requests"
    ADD CONSTRAINT "fk_rsvp_pending_stage" FOREIGN KEY ("stage_id") REFERENCES "public"."ticket_stages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rsvp_pending_requests"
    ADD CONSTRAINT "fk_rsvp_pending_tier" FOREIGN KEY ("ticket_tier_id") REFERENCES "public"."ticket_tiers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."holds"
    ADD CONSTRAINT "holds_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;



COMMENT ON CONSTRAINT "holds_event_id_fkey" ON "public"."holds" IS 'ON DELETE SET NULL: Allows holds to remain for audit/expiration even if event is deleted';



ALTER TABLE ONLY "public"."holds"
    ADD CONSTRAINT "holds_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "public"."ticket_stages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."holds"
    ADD CONSTRAINT "holds_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "public"."ticket_tiers"("id") ON DELETE SET NULL;



COMMENT ON CONSTRAINT "holds_tier_id_fkey" ON "public"."holds" IS 'ON DELETE SET NULL: Allows holds to remain for audit/expiration even if tier is deleted';



ALTER TABLE ONLY "public"."holds"
    ADD CONSTRAINT "holds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_errors"
    ADD CONSTRAINT "order_errors_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_errors"
    ADD CONSTRAINT "order_errors_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_ticket_tier_id_fkey" FOREIGN KEY ("ticket_tier_id") REFERENCES "public"."ticket_tiers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_original_purchaser_user_id_fkey" FOREIGN KEY ("original_purchaser_user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_promoter_user_id_fkey" FOREIGN KEY ("promoter_user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_promotional_code_id_fkey" FOREIGN KEY ("promotional_code_id") REFERENCES "public"."promotional_codes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_ticket_tier_id_fkey" FOREIGN KEY ("ticket_tier_id") REFERENCES "public"."ticket_tiers"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



COMMENT ON CONSTRAINT "organizations_owner_user_id_fkey" ON "public"."organizations" IS 'Cascade delete: When user is deleted, their organizations are deleted';



ALTER TABLE ONLY "public"."payout_logs"
    ADD CONSTRAINT "payout_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payout_logs"
    ADD CONSTRAINT "payout_logs_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."promoter_links"
    ADD CONSTRAINT "promoter_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."promoter_links"
    ADD CONSTRAINT "promoter_links_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotional_codes"
    ADD CONSTRAINT "promotional_codes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."promotional_codes"
    ADD CONSTRAINT "promotional_codes_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotional_tickets"
    ADD CONSTRAINT "promotional_tickets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."promotional_tickets"
    ADD CONSTRAINT "promotional_tickets_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotional_tickets"
    ADD CONSTRAINT "promotional_tickets_ticket_tier_id_fkey" FOREIGN KEY ("ticket_tier_id") REFERENCES "public"."ticket_tiers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_tokens"
    ADD CONSTRAINT "purchase_tokens_rsvp_id_fkey" FOREIGN KEY ("rsvp_id") REFERENCES "public"."rsvps"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rsvps"
    ADD CONSTRAINT "rsvps_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



COMMENT ON CONSTRAINT "rsvps_approved_by_fkey" ON "public"."rsvps" IS 'Set null: Preserve RSVP approval history when admin user is deleted';



ALTER TABLE ONLY "public"."rsvps"
    ADD CONSTRAINT "rsvps_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rsvps"
    ADD CONSTRAINT "rsvps_promoter_user_id_fkey" FOREIGN KEY ("promoter_user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."rsvps"
    ADD CONSTRAINT "rsvps_promotional_code_id_fkey" FOREIGN KEY ("promotional_code_id") REFERENCES "public"."promotional_codes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rsvps"
    ADD CONSTRAINT "rsvps_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



COMMENT ON CONSTRAINT "rsvps_rejected_by_fkey" ON "public"."rsvps" IS 'Set null: Preserve RSVP rejection history when admin user is deleted';



ALTER TABLE ONLY "public"."rsvps"
    ADD CONSTRAINT "rsvps_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "public"."ticket_stages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rsvps"
    ADD CONSTRAINT "rsvps_ticket_tier_id_fkey" FOREIGN KEY ("ticket_tier_id") REFERENCES "public"."ticket_tiers"("id");



ALTER TABLE ONLY "public"."rsvps"
    ADD CONSTRAINT "rsvps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stripe_payment_audit"
    ADD CONSTRAINT "stripe_payment_audit_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stripe_payment_audit"
    ADD CONSTRAINT "stripe_payment_audit_hold_id_fkey" FOREIGN KEY ("hold_id") REFERENCES "public"."holds"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stripe_payment_audit"
    ADD CONSTRAINT "stripe_payment_audit_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stripe_payment_audit"
    ADD CONSTRAINT "stripe_payment_audit_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stripe_payment_audit"
    ADD CONSTRAINT "stripe_payment_audit_rsvp_id_fkey" FOREIGN KEY ("rsvp_id") REFERENCES "public"."rsvps"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stripe_payment_audit"
    ADD CONSTRAINT "stripe_payment_audit_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ticket_stages"
    ADD CONSTRAINT "ticket_stages_ticket_tier_id_fkey" FOREIGN KEY ("ticket_tier_id") REFERENCES "public"."ticket_tiers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_tiers"
    ADD CONSTRAINT "ticket_tiers_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_ticket_tier_id_fkey" FOREIGN KEY ("ticket_tier_id") REFERENCES "public"."ticket_tiers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



COMMENT ON CONSTRAINT "tickets_user_id_fkey" ON "public"."tickets" IS 'Set null: Preserve ticket records for events when user is deleted';



CREATE POLICY "Admins can manage order errors" ON "public"."order_errors" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"public"."user_role")))));



CREATE POLICY "Admins can read all stripe payment audit logs" ON "public"."stripe_payment_audit" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."organizations"
  WHERE (("organizations"."id" = "stripe_payment_audit"."organization_id") AND ("organizations"."owner_user_id" = "auth"."uid"())))) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "Anyone can view published events" ON "public"."events" FOR SELECT USING ((("status")::"text" = 'published'::"text"));



CREATE POLICY "Anyone can view ticket stages for published events" ON "public"."ticket_stages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."ticket_tiers" "tt"
     JOIN "public"."events" "e" ON (("e"."id" = "tt"."event_id")))
  WHERE (("tt"."id" = "ticket_stages"."ticket_tier_id") AND (("e"."status")::"text" = 'published'::"text")))));



CREATE POLICY "Anyone can view ticket tiers for published events" ON "public"."ticket_tiers" FOR SELECT USING (("event_id" IN ( SELECT "events"."id"
   FROM "public"."events"
  WHERE (("events"."status")::"text" = 'published'::"text"))));



CREATE POLICY "Authenticated users can view promotional codes for published ev" ON "public"."promotional_codes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "promotional_codes"."event_id") AND (("e"."status")::"text" = 'published'::"text")))));



COMMENT ON POLICY "Authenticated users can view promotional codes for published ev" ON "public"."promotional_codes" IS 'Allows authenticated users to view promotional codes for published events during purchase validation';



CREATE POLICY "Organization members can create events" ON "public"."events" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" IN ( SELECT "users"."id"
           FROM "public"."users"
          WHERE (("users"."clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")))))));



CREATE POLICY "Organization members can manage ticket stages" ON "public"."ticket_stages" USING ((EXISTS ( SELECT 1
   FROM (("public"."ticket_tiers" "tt"
     JOIN "public"."events" "e" ON (("tt"."event_id" = "e"."id")))
     JOIN "public"."organization_members" "om" ON (("e"."organization_id" = "om"."organization_id")))
  WHERE (("tt"."id" = "ticket_stages"."ticket_tier_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Organization members can manage ticket tiers" ON "public"."ticket_tiers" USING (("event_id" IN ( SELECT "e"."id"
   FROM ("public"."events" "e"
     JOIN "public"."organization_members" "om" ON (("e"."organization_id" = "om"."organization_id")))
  WHERE ("om"."user_id" IN ( SELECT "users"."id"
           FROM "public"."users"
          WHERE (("users"."clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")))))));



CREATE POLICY "Organization members can update RSVPs for their events" ON "public"."rsvps" FOR UPDATE USING (("event_id" IN ( SELECT "e"."id"
   FROM ("public"."events" "e"
     JOIN "public"."organization_members" "om" ON (("e"."organization_id" = "om"."organization_id")))
  WHERE ("om"."user_id" IN ( SELECT "users"."id"
           FROM "public"."users"
          WHERE (("users"."clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")))))));



CREATE POLICY "Organization members can update their events" ON "public"."events" FOR UPDATE USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" IN ( SELECT "users"."id"
           FROM "public"."users"
          WHERE (("users"."clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")))))));



CREATE POLICY "Organization members can update ticket status" ON "public"."tickets" FOR UPDATE USING (("order_id" IN ( SELECT "o"."id"
   FROM ("public"."orders" "o"
     JOIN "public"."organization_members" "om" ON (("o"."organization_id" = "om"."organization_id")))
  WHERE ("om"."user_id" IN ( SELECT "users"."id"
           FROM "public"."users"
          WHERE (("users"."clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")))))));



CREATE POLICY "Organization members can view RSVPs for their events" ON "public"."rsvps" FOR SELECT USING (("event_id" IN ( SELECT "e"."id"
   FROM ("public"."events" "e"
     JOIN "public"."organization_members" "om" ON (("e"."organization_id" = "om"."organization_id")))
  WHERE ("om"."user_id" IN ( SELECT "users"."id"
           FROM "public"."users"
          WHERE (("users"."clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")))))));



CREATE POLICY "Organization members can view order items for their events" ON "public"."order_items" FOR SELECT USING (("order_id" IN ( SELECT "o"."id"
   FROM ("public"."orders" "o"
     JOIN "public"."organization_members" "om" ON (("o"."organization_id" = "om"."organization_id")))
  WHERE ("om"."user_id" IN ( SELECT "users"."id"
           FROM "public"."users"
          WHERE (("users"."clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")))))));



CREATE POLICY "Organization members can view orders for their events" ON "public"."orders" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" IN ( SELECT "users"."id"
           FROM "public"."users"
          WHERE (("users"."clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")))))));



CREATE POLICY "Organization members can view their events" ON "public"."events" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" IN ( SELECT "users"."id"
           FROM "public"."users"
          WHERE (("users"."clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")))))));



CREATE POLICY "Organization members can view tickets for their events" ON "public"."tickets" FOR SELECT USING (("order_id" IN ( SELECT "o"."id"
   FROM ("public"."orders" "o"
     JOIN "public"."organization_members" "om" ON (("o"."organization_id" = "om"."organization_id")))
  WHERE ("om"."user_id" IN ( SELECT "users"."id"
           FROM "public"."users"
          WHERE (("users"."clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")))))));



CREATE POLICY "Organization owners can manage memberships" ON "public"."organization_members" USING (("organization_id" IN ( SELECT "organizations"."id"
   FROM "public"."organizations"
  WHERE ("organizations"."owner_user_id" IN ( SELECT "users"."id"
           FROM "public"."users"
          WHERE (("users"."clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")))))));



CREATE POLICY "Organization owners can update their organization" ON "public"."organizations" FOR UPDATE USING (("owner_user_id" IN ( SELECT "users"."id"
   FROM "public"."users"
  WHERE (("users"."clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")))));



CREATE POLICY "Organizers can create promotional codes for their events" ON "public"."promotional_codes" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."events" "e"
     JOIN "public"."organization_members" "om" ON (("om"."organization_id" = "e"."organization_id")))
  WHERE (("e"."id" = "promotional_codes"."event_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Organizers can create promotional tickets for their events" ON "public"."promotional_tickets" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."events" "e"
     JOIN "public"."organization_members" "om" ON (("om"."organization_id" = "e"."organization_id")))
  WHERE (("e"."id" = "promotional_tickets"."event_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Organizers can delete promotional codes for their events" ON "public"."promotional_codes" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."events" "e"
     JOIN "public"."organization_members" "om" ON (("om"."organization_id" = "e"."organization_id")))
  WHERE (("e"."id" = "promotional_codes"."event_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Organizers can delete ticket stages for their events" ON "public"."ticket_stages" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ((("public"."ticket_tiers" "tt"
     JOIN "public"."events" "e" ON (("e"."id" = "tt"."event_id")))
     JOIN "public"."organization_members" "om" ON (("om"."organization_id" = "e"."organization_id")))
     JOIN "public"."users" "u" ON (("u"."id" = "om"."user_id")))
  WHERE (("tt"."id" = "ticket_stages"."ticket_tier_id") AND (("u"."clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")) AND (("om"."role")::"text" = ANY ((ARRAY['owner'::character varying, 'admin'::character varying, 'organizer'::character varying])::"text"[]))))));



CREATE POLICY "Organizers can insert ticket stages for their events" ON "public"."ticket_stages" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ((("public"."ticket_tiers" "tt"
     JOIN "public"."events" "e" ON (("e"."id" = "tt"."event_id")))
     JOIN "public"."organization_members" "om" ON (("om"."organization_id" = "e"."organization_id")))
     JOIN "public"."users" "u" ON (("u"."id" = "om"."user_id")))
  WHERE (("tt"."id" = "ticket_stages"."ticket_tier_id") AND (("u"."clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")) AND (("om"."role")::"text" = ANY ((ARRAY['owner'::character varying, 'admin'::character varying, 'organizer'::character varying])::"text"[]))))));



CREATE POLICY "Organizers can update promotional codes for their events" ON "public"."promotional_codes" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."events" "e"
     JOIN "public"."organization_members" "om" ON (("om"."organization_id" = "e"."organization_id")))
  WHERE (("e"."id" = "promotional_codes"."event_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Organizers can update promotional tickets for their events" ON "public"."promotional_tickets" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."events" "e"
     JOIN "public"."organization_members" "om" ON (("om"."organization_id" = "e"."organization_id")))
  WHERE (("e"."id" = "promotional_tickets"."event_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Organizers can update ticket stages for their events" ON "public"."ticket_stages" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ((("public"."ticket_tiers" "tt"
     JOIN "public"."events" "e" ON (("e"."id" = "tt"."event_id")))
     JOIN "public"."organization_members" "om" ON (("om"."organization_id" = "e"."organization_id")))
     JOIN "public"."users" "u" ON (("u"."id" = "om"."user_id")))
  WHERE (("tt"."id" = "ticket_stages"."ticket_tier_id") AND (("u"."clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")) AND (("om"."role")::"text" = ANY ((ARRAY['owner'::character varying, 'admin'::character varying, 'organizer'::character varying])::"text"[]))))));



CREATE POLICY "Organizers can view promotional codes for their events" ON "public"."promotional_codes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."events" "e"
     JOIN "public"."organization_members" "om" ON (("om"."organization_id" = "e"."organization_id")))
  WHERE (("e"."id" = "promotional_codes"."event_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Organizers can view promotional tickets for their events" ON "public"."promotional_tickets" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."events" "e"
     JOIN "public"."organization_members" "om" ON (("om"."organization_id" = "e"."organization_id")))
  WHERE (("e"."id" = "promotional_tickets"."event_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Service role can manage contact submissions" ON "public"."contact_submissions" USING (true);



CREATE POLICY "Service role has full access" ON "public"."datafast_transactions" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role has full access to ticket stages" ON "public"."ticket_stages" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "System can insert stripe payment audit logs" ON "public"."stripe_payment_audit" FOR INSERT WITH CHECK (true);



CREATE POLICY "Users can create RSVPs" ON "public"."rsvps" FOR INSERT WITH CHECK (("user_id" IN ( SELECT "users"."id"
   FROM "public"."users"
  WHERE (("users"."clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")))));



CREATE POLICY "Users can create organizations" ON "public"."organizations" FOR INSERT WITH CHECK (("owner_user_id" IN ( SELECT "users"."id"
   FROM "public"."users"
  WHERE (("users"."clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")))));



CREATE POLICY "Users can create their own profile" ON "public"."users" FOR INSERT WITH CHECK ((("clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")));



CREATE POLICY "Users can update their own profile" ON "public"."users" FOR UPDATE USING ((("clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")));



CREATE POLICY "Users can view organization memberships" ON "public"."organization_members" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members_1"."organization_id"
   FROM "public"."organization_members" "organization_members_1"
  WHERE ("organization_members_1"."user_id" IN ( SELECT "users"."id"
           FROM "public"."users"
          WHERE (("users"."clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")))))));



CREATE POLICY "Users can view organizations they belong to" ON "public"."organizations" FOR SELECT USING (("id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" IN ( SELECT "users"."id"
           FROM "public"."users"
          WHERE (("users"."clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")))))));



CREATE POLICY "Users can view own transactions" ON "public"."datafast_transactions" FOR SELECT USING (("user_id" IN ( SELECT "users"."id"
   FROM "public"."users"
  WHERE (("users"."clerk_id")::"text" = ("auth"."uid"())::"text"))));



CREATE POLICY "Users can view their own RSVPs" ON "public"."rsvps" FOR SELECT USING (("user_id" IN ( SELECT "users"."id"
   FROM "public"."users"
  WHERE (("users"."clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")))));



CREATE POLICY "Users can view their own order items" ON "public"."order_items" FOR SELECT USING (("order_id" IN ( SELECT "orders"."id"
   FROM "public"."orders"
  WHERE ("orders"."user_id" IN ( SELECT "users"."id"
           FROM "public"."users"
          WHERE (("users"."clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")))))));



CREATE POLICY "Users can view their own orders" ON "public"."orders" FOR SELECT USING (("user_id" IN ( SELECT "users"."id"
   FROM "public"."users"
  WHERE (("users"."clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")))));



CREATE POLICY "Users can view their own profile" ON "public"."users" FOR SELECT USING ((("clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")));



CREATE POLICY "Users can view their own promotional tickets by email" ON "public"."promotional_tickets" FOR SELECT TO "authenticated" USING ((("email")::"text" = (( SELECT "users"."email"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text"));



CREATE POLICY "Users can view their own purchase tokens" ON "public"."purchase_tokens" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."rsvps" "r"
     JOIN "public"."users" "u" ON (("r"."user_id" = "u"."id")))
  WHERE (("r"."id" = "purchase_tokens"."rsvp_id") AND (("u"."clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text"))))));



CREATE POLICY "Users can view their own tickets" ON "public"."tickets" FOR SELECT USING (("order_id" IN ( SELECT "orders"."id"
   FROM "public"."orders"
  WHERE ("orders"."user_id" IN ( SELECT "users"."id"
           FROM "public"."users"
          WHERE (("users"."clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")))))));



CREATE POLICY "Users can view ticket stages for accessible events" ON "public"."ticket_stages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (("public"."ticket_tiers" "tt"
     JOIN "public"."events" "e" ON (("tt"."event_id" = "e"."id")))
     JOIN "public"."organization_members" "om" ON (("e"."organization_id" = "om"."organization_id")))
  WHERE (("tt"."id" = "ticket_stages"."ticket_tier_id") AND (("om"."user_id" = "auth"."uid"()) OR (("e"."status")::"text" = 'published'::"text"))))));



ALTER TABLE "public"."checkins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."datafast_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."holds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_errors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organizers_view_event_holds" ON "public"."holds" FOR SELECT TO "authenticated" USING (("event_id" IN ( SELECT "e"."id"
   FROM ((("public"."events" "e"
     JOIN "public"."organizations" "o" ON (("e"."organization_id" = "o"."id")))
     JOIN "public"."organization_members" "om" ON (("o"."id" = "om"."organization_id")))
     JOIN "public"."users" "u" ON (("om"."user_id" = "u"."id")))
  WHERE ((("u"."clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")) AND (("om"."role")::"text" = ANY ((ARRAY['owner'::character varying, 'admin'::character varying, 'organizer'::character varying])::"text"[]))))));



COMMENT ON POLICY "organizers_view_event_holds" ON "public"."holds" IS 'Event organizers can view holds for events they manage';



ALTER TABLE "public"."payout_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payout_logs_insert_policy" ON "public"."payout_logs" FOR INSERT WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "payout_logs_view_policy" ON "public"."payout_logs" FOR SELECT USING (("organization_id" IN ( SELECT "om"."organization_id"
   FROM ("public"."organization_members" "om"
     JOIN "public"."users" "u" ON (("u"."id" = "om"."user_id")))
  WHERE ((("u"."clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")) AND (("om"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'owner'::character varying])::"text"[]))))));



ALTER TABLE "public"."promotional_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promotional_tickets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rsvps" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_role_all_holds" ON "public"."holds" TO "service_role" USING (true) WITH CHECK (true);



COMMENT ON POLICY "service_role_all_holds" ON "public"."holds" IS 'Service role (backend) can perform all operations on holds for atomic transactions';



ALTER TABLE "public"."stripe_payment_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ticket_stages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ticket_tiers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tickets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_create_own_holds" ON "public"."holds" FOR INSERT TO "authenticated" WITH CHECK (("user_id" IN ( SELECT "users"."id"
   FROM "public"."users"
  WHERE (("users"."clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")))));



COMMENT ON POLICY "users_create_own_holds" ON "public"."holds" IS 'Users can create holds for themselves';



CREATE POLICY "users_update_own_holds" ON "public"."holds" FOR UPDATE TO "authenticated" USING (("user_id" IN ( SELECT "users"."id"
   FROM "public"."users"
  WHERE (("users"."clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")))));



COMMENT ON POLICY "users_update_own_holds" ON "public"."holds" IS 'Users can update their own holds';



CREATE POLICY "users_view_own_holds" ON "public"."holds" FOR SELECT TO "authenticated" USING (("user_id" IN ( SELECT "users"."id"
   FROM "public"."users"
  WHERE (("users"."clerk_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")))));



COMMENT ON POLICY "users_view_own_holds" ON "public"."holds" IS 'Users can view holds they created';



ALTER TABLE "public"."webhook_events" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."atomic_create_hold_with_stage_validation"("p_user_id" "uuid", "p_event_id" "uuid", "p_tier_id" "uuid", "p_quantity" integer, "p_stage_id" "uuid", "p_expires_minutes" integer, "p_promoter_code" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."atomic_create_hold_with_stage_validation"("p_user_id" "uuid", "p_event_id" "uuid", "p_tier_id" "uuid", "p_quantity" integer, "p_stage_id" "uuid", "p_expires_minutes" integer, "p_promoter_code" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."atomic_create_hold_with_stage_validation"("p_user_id" "uuid", "p_event_id" "uuid", "p_tier_id" "uuid", "p_quantity" integer, "p_stage_id" "uuid", "p_expires_minutes" integer, "p_promoter_code" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."check_email_allowed"("email_to_check" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_email_allowed"("email_to_check" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_email_allowed"("email_to_check" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_abandoned_payments"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_abandoned_payments"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_abandoned_payments"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_all_ticket_data"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_all_ticket_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_all_ticket_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_all_ticket_data"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_expired_holds"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_expired_holds"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_holds"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_pending_rsvps"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_pending_rsvps"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_pending_rsvps"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_purchase_tokens"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_purchase_tokens"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_purchase_tokens"() TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_hold_purchase"("p_hold_id" "uuid", "p_user_id" "uuid", "p_quantity" integer, "p_unit_price_cents" integer, "p_subtotal_cents" integer, "p_processing_fee_cents" integer, "p_total_cents" integer, "p_organization_id" "uuid", "p_event_id" "uuid", "p_tier_id" "uuid", "p_attendee_name" "text", "p_attendee_email" "text", "p_ticket_data" "jsonb", "p_promotional_code_id" "uuid", "p_discount_amount_cents" integer, "p_promoter_code" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."complete_hold_purchase"("p_hold_id" "uuid", "p_user_id" "uuid", "p_quantity" integer, "p_unit_price_cents" integer, "p_subtotal_cents" integer, "p_processing_fee_cents" integer, "p_total_cents" integer, "p_organization_id" "uuid", "p_event_id" "uuid", "p_tier_id" "uuid", "p_attendee_name" "text", "p_attendee_email" "text", "p_ticket_data" "jsonb", "p_promotional_code_id" "uuid", "p_discount_amount_cents" integer, "p_promoter_code" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_hold_purchase"("p_hold_id" "uuid", "p_user_id" "uuid", "p_quantity" integer, "p_unit_price_cents" integer, "p_subtotal_cents" integer, "p_processing_fee_cents" integer, "p_total_cents" integer, "p_organization_id" "uuid", "p_event_id" "uuid", "p_tier_id" "uuid", "p_attendee_name" "text", "p_attendee_email" "text", "p_ticket_data" "jsonb", "p_promotional_code_id" "uuid", "p_discount_amount_cents" integer, "p_promoter_code" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_bank_transfer_order_atomic"("p_user_id" "uuid", "p_organization_id" "uuid", "p_event_id" "uuid", "p_ticket_tier_id" "uuid", "p_quantity" integer, "p_unit_price_cents" integer, "p_subtotal_cents" integer, "p_fees_cents" integer, "p_total_cents" integer, "p_idempotency_key" "text", "p_tickets" "text", "p_stage_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_bank_transfer_order_atomic"("p_user_id" "uuid", "p_organization_id" "uuid", "p_event_id" "uuid", "p_ticket_tier_id" "uuid", "p_quantity" integer, "p_unit_price_cents" integer, "p_subtotal_cents" integer, "p_fees_cents" integer, "p_total_cents" integer, "p_idempotency_key" "text", "p_tickets" "text", "p_stage_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_bank_transfer_order_atomic"("p_user_id" "uuid", "p_organization_id" "uuid", "p_event_id" "uuid", "p_ticket_tier_id" "uuid", "p_quantity" integer, "p_unit_price_cents" integer, "p_subtotal_cents" integer, "p_fees_cents" integer, "p_total_cents" integer, "p_idempotency_key" "text", "p_tickets" "text", "p_stage_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_rsvp_atomic"("p_user_id" "uuid", "p_event_id" "uuid", "p_ticket_tier_id" "uuid", "p_quantity" integer, "p_stage_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_rsvp_atomic"("p_user_id" "uuid", "p_event_id" "uuid", "p_ticket_tier_id" "uuid", "p_quantity" integer, "p_stage_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_rsvp_atomic"("p_user_id" "uuid", "p_event_id" "uuid", "p_ticket_tier_id" "uuid", "p_quantity" integer, "p_stage_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_rsvp_atomic"("p_user_id" "uuid", "p_event_id" "uuid", "p_ticket_tier_id" "uuid", "p_quantity" integer, "p_stage_id" "uuid", "p_promoter_code" character varying, "p_promoter_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_rsvp_atomic"("p_user_id" "uuid", "p_event_id" "uuid", "p_ticket_tier_id" "uuid", "p_quantity" integer, "p_stage_id" "uuid", "p_promoter_code" character varying, "p_promoter_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_rsvp_atomic"("p_user_id" "uuid", "p_event_id" "uuid", "p_ticket_tier_id" "uuid", "p_quantity" integer, "p_stage_id" "uuid", "p_promoter_code" character varying, "p_promoter_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_rsvp_atomic"("p_user_id" "uuid", "p_event_id" "uuid", "p_ticket_tier_id" "uuid", "p_quantity" integer, "p_stage_id" "uuid", "p_promoter_code" character varying, "p_promoter_user_id" "uuid", "p_promotional_code_id" "uuid", "p_discount_amount_cents" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."create_rsvp_atomic"("p_user_id" "uuid", "p_event_id" "uuid", "p_ticket_tier_id" "uuid", "p_quantity" integer, "p_stage_id" "uuid", "p_promoter_code" character varying, "p_promoter_user_id" "uuid", "p_promotional_code_id" "uuid", "p_discount_amount_cents" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_rsvp_atomic"("p_user_id" "uuid", "p_event_id" "uuid", "p_ticket_tier_id" "uuid", "p_quantity" integer, "p_stage_id" "uuid", "p_promoter_code" character varying, "p_promoter_user_id" "uuid", "p_promotional_code_id" "uuid", "p_discount_amount_cents" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_ticket_tier_with_stages"("p_event_id" "uuid", "p_name" "text", "p_price_cents" integer, "p_quantity_total" integer, "p_per_user_limit" integer, "p_sales_start" timestamp with time zone, "p_sales_end" timestamp with time zone, "p_order_index" integer, "p_use_stages" boolean, "p_stages" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_ticket_tier_with_stages"("p_event_id" "uuid", "p_name" "text", "p_price_cents" integer, "p_quantity_total" integer, "p_per_user_limit" integer, "p_sales_start" timestamp with time zone, "p_sales_end" timestamp with time zone, "p_order_index" integer, "p_use_stages" boolean, "p_stages" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_ticket_tier_with_stages"("p_event_id" "uuid", "p_name" "text", "p_price_cents" integer, "p_quantity_total" integer, "p_per_user_limit" integer, "p_sales_start" timestamp with time zone, "p_sales_end" timestamp with time zone, "p_order_index" integer, "p_use_stages" boolean, "p_stages" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_ticket_tier_with_stages"("p_event_id" "uuid", "p_name" "text", "p_price_cents" integer, "p_quantity_total" integer, "p_per_user_limit" integer, "p_sales_start" timestamp with time zone, "p_sales_end" timestamp with time zone, "p_order_index" integer, "p_use_stages" boolean, "p_stages" "jsonb", "p_fee_percentage" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."create_ticket_tier_with_stages"("p_event_id" "uuid", "p_name" "text", "p_price_cents" integer, "p_quantity_total" integer, "p_per_user_limit" integer, "p_sales_start" timestamp with time zone, "p_sales_end" timestamp with time zone, "p_order_index" integer, "p_use_stages" boolean, "p_stages" "jsonb", "p_fee_percentage" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_ticket_tier_with_stages"("p_event_id" "uuid", "p_name" "text", "p_price_cents" integer, "p_quantity_total" integer, "p_per_user_limit" integer, "p_sales_start" timestamp with time zone, "p_sales_end" timestamp with time zone, "p_order_index" integer, "p_use_stages" boolean, "p_stages" "jsonb", "p_fee_percentage" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_allowed_user_details"("email_to_check" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_allowed_user_details"("email_to_check" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_allowed_user_details"("email_to_check" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_stage_availability"("p_stage_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_stage_availability"("p_stage_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_stage_availability"("p_stage_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_tier_stage_availability"("p_tier_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_tier_stage_availability"("p_tier_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tier_stage_availability"("p_tier_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_stage_sold_quantity"("p_stage_id" "uuid", "p_increment" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_stage_sold_quantity"("p_stage_id" "uuid", "p_increment" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_stage_sold_quantity"("p_stage_id" "uuid", "p_increment" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_tier_quantity_sold"("p_tier_id" "uuid", "p_increment" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_tier_quantity_sold"("p_tier_id" "uuid", "p_increment" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_tier_quantity_sold"("p_tier_id" "uuid", "p_increment" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."lock_stuck_transactions_for_recovery"("p_min_minutes" integer, "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."lock_stuck_transactions_for_recovery"("p_min_minutes" integer, "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."lock_stuck_transactions_for_recovery"("p_min_minutes" integer, "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_hold_payment_started"("p_hold_id" "uuid", "p_checkout_id" "text", "p_extend_minutes" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."mark_hold_payment_started"("p_hold_id" "uuid", "p_checkout_id" "text", "p_extend_minutes" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_hold_payment_started"("p_hold_id" "uuid", "p_checkout_id" "text", "p_extend_minutes" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_featured_event"("event_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_featured_event"("event_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_featured_event"("event_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."try_advisory_lock"("lock_key" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."try_advisory_lock"("lock_key" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."try_advisory_lock"("lock_key" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."unfeature_all_events"() TO "anon";
GRANT ALL ON FUNCTION "public"."unfeature_all_events"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."unfeature_all_events"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_datafast_transactions_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_datafast_transactions_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_datafast_transactions_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_holds_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_holds_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_holds_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_ticket_stages"("p_ticket_tier_id" "uuid", "p_stages" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."update_ticket_stages"("p_ticket_tier_id" "uuid", "p_stages" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_ticket_stages"("p_ticket_tier_id" "uuid", "p_stages" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















GRANT ALL ON TABLE "public"."checkins" TO "anon";
GRANT ALL ON TABLE "public"."checkins" TO "authenticated";
GRANT ALL ON TABLE "public"."checkins" TO "service_role";



GRANT ALL ON TABLE "public"."contact_submissions" TO "anon";
GRANT ALL ON TABLE "public"."contact_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."datafast_transactions" TO "anon";
GRANT ALL ON TABLE "public"."datafast_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."datafast_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON TABLE "public"."holds" TO "anon";
GRANT ALL ON TABLE "public"."holds" TO "authenticated";
GRANT ALL ON TABLE "public"."holds" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_tiers" TO "anon";
GRANT ALL ON TABLE "public"."ticket_tiers" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_tiers" TO "service_role";



GRANT ALL ON TABLE "public"."holds_at_risk_of_expiration" TO "anon";
GRANT ALL ON TABLE "public"."holds_at_risk_of_expiration" TO "authenticated";
GRANT ALL ON TABLE "public"."holds_at_risk_of_expiration" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."holds_with_active_payments" TO "anon";
GRANT ALL ON TABLE "public"."holds_with_active_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."holds_with_active_payments" TO "service_role";



GRANT ALL ON TABLE "public"."order_errors" TO "anon";
GRANT ALL ON TABLE "public"."order_errors" TO "authenticated";
GRANT ALL ON TABLE "public"."order_errors" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."organization_members" TO "anon";
GRANT ALL ON TABLE "public"."organization_members" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_members" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."payout_logs" TO "anon";
GRANT ALL ON TABLE "public"."payout_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."payout_logs" TO "service_role";



GRANT ALL ON TABLE "public"."promoter_links" TO "anon";
GRANT ALL ON TABLE "public"."promoter_links" TO "authenticated";
GRANT ALL ON TABLE "public"."promoter_links" TO "service_role";



GRANT ALL ON TABLE "public"."promotional_codes" TO "anon";
GRANT ALL ON TABLE "public"."promotional_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."promotional_codes" TO "service_role";



GRANT ALL ON TABLE "public"."promotional_tickets" TO "anon";
GRANT ALL ON TABLE "public"."promotional_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."promotional_tickets" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_tokens" TO "anon";
GRANT ALL ON TABLE "public"."purchase_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."rsvp_pending_requests" TO "anon";
GRANT ALL ON TABLE "public"."rsvp_pending_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."rsvp_pending_requests" TO "service_role";



GRANT ALL ON TABLE "public"."rsvps" TO "anon";
GRANT ALL ON TABLE "public"."rsvps" TO "authenticated";
GRANT ALL ON TABLE "public"."rsvps" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_payment_audit" TO "anon";
GRANT ALL ON TABLE "public"."stripe_payment_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_payment_audit" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_stages" TO "anon";
GRANT ALL ON TABLE "public"."ticket_stages" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_stages" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_stages_price_backup" TO "anon";
GRANT ALL ON TABLE "public"."ticket_stages_price_backup" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_stages_price_backup" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_tiers_price_backup" TO "anon";
GRANT ALL ON TABLE "public"."ticket_tiers_price_backup" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_tiers_price_backup" TO "service_role";



GRANT ALL ON TABLE "public"."tickets" TO "anon";
GRANT ALL ON TABLE "public"."tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."tickets" TO "service_role";



GRANT ALL ON TABLE "public"."user_sync_queue" TO "anon";
GRANT ALL ON TABLE "public"."user_sync_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."user_sync_queue" TO "service_role";



GRANT ALL ON TABLE "public"."v_active_holds_by_stage" TO "anon";
GRANT ALL ON TABLE "public"."v_active_holds_by_stage" TO "authenticated";
GRANT ALL ON TABLE "public"."v_active_holds_by_stage" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_events" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






























