-- Update per-user limit error message: "per person" → "per user" + singular/plural
-- See APRIL_2026_FIXES.md #50.

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
AS $$
DECLARE
  v_ticket_tier RECORD;
  v_stage RECORD;
  v_existing_count INTEGER;
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
    created_at
  INTO v_ticket_tier
  FROM ticket_tiers
  WHERE id = p_tier_id
    AND event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ticket tier not found');
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

  -- Per-user limit: include existing purchases (paid/completed) and active holds
  IF v_ticket_tier.per_user_limit IS NOT NULL THEN
    SELECT
      (SELECT COALESCE(SUM(quantity), 0)
       FROM orders
       WHERE user_id = p_user_id
         AND ticket_tier_id = v_ticket_tier.id
         AND status IN ('paid', 'completed'))
      + (SELECT COALESCE(SUM(quantity), 0)
         FROM holds
         WHERE user_id = p_user_id
           AND tier_id = v_ticket_tier.id
           AND expires_at > v_now
           AND order_id IS NULL)
    INTO v_existing_count;

    IF p_quantity + v_existing_count > v_ticket_tier.per_user_limit THEN
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
