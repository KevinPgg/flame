-- Migration: Add payment protection to holds table
-- Description: Prevent holds from expiring while payment is in progress
-- This fixes the race condition where holds expire before Datafast payment completes

-- Add payment tracking columns to holds
ALTER TABLE holds 
ADD COLUMN IF NOT EXISTS payment_in_progress BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS payment_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS datafast_checkout_id TEXT;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_holds_payment_in_progress 
ON holds(payment_in_progress) 
WHERE payment_in_progress = TRUE;

CREATE INDEX IF NOT EXISTS idx_holds_datafast_checkout 
ON holds(datafast_checkout_id) 
WHERE datafast_checkout_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN holds.payment_in_progress IS 
'Flag indicating payment is currently in progress. Prevents hold expiration during payment.';

COMMENT ON COLUMN holds.payment_started_at IS 
'Timestamp when Datafast checkout was created and payment process started.';

COMMENT ON COLUMN holds.datafast_checkout_id IS 
'Datafast checkout ID for this hold, used to link transaction to hold.';

-- Add constraint to ensure payment_started_at is set when payment_in_progress = TRUE
-- This prevents orphaned holds that can never be cleaned up
ALTER TABLE holds
DROP CONSTRAINT IF EXISTS holds_payment_started_at_required_when_in_progress;

ALTER TABLE holds
ADD CONSTRAINT holds_payment_started_at_required_when_in_progress
CHECK (
  payment_in_progress = FALSE 
  OR payment_in_progress IS NULL 
  OR (payment_in_progress = TRUE AND payment_started_at IS NOT NULL)
);

-- Update cleanup_expired_holds function to respect payment_in_progress flag
CREATE OR REPLACE FUNCTION cleanup_expired_holds()
RETURNS TABLE (
  deleted_count INTEGER,
  affected_tier_ids UUID[]
) 
LANGUAGE plpgsql
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

-- Add comment for the updated function
COMMENT ON FUNCTION cleanup_expired_holds IS 
'Cleans up expired holds that are not in use and do not have payment in progress. Protects holds with payment_in_progress=TRUE for 15 minutes from payment_started_at.';

-- Create a new function to handle payment timeout (called by monitoring/cron)
CREATE OR REPLACE FUNCTION cleanup_abandoned_payments()
RETURNS TABLE (
  cleared_count INTEGER,
  cleared_hold_ids UUID[]
)
LANGUAGE plpgsql
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

COMMENT ON FUNCTION cleanup_abandoned_payments IS 
'Clears payment_in_progress flag on holds where payment was started but abandoned for >20 minutes. Should be called periodically (e.g., every 10 minutes) by a monitoring service.';

-- Create function to safely start payment (called by create-checkout endpoint)
CREATE OR REPLACE FUNCTION mark_hold_payment_started(
  p_hold_id UUID,
  p_checkout_id TEXT,
  p_extend_minutes INTEGER DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
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

COMMENT ON FUNCTION mark_hold_payment_started IS 
'Marks a hold as having payment in progress and extends its expiration. Called by the create-checkout endpoint when Datafast checkout session is created. Prevents the hold from being cleaned up while payment is being processed.';

-- Add helpful views for monitoring
CREATE OR REPLACE VIEW holds_with_active_payments AS
SELECT 
  h.id,
  h.user_id,
  h.event_id,
  h.tier_id,
  h.quantity,
  h.expires_at,
  h.payment_started_at,
  h.datafast_checkout_id,
  EXTRACT(EPOCH FROM (NOW() - h.payment_started_at))/60 AS payment_age_minutes,
  e.name AS event_name,
  tt.name AS tier_name,
  u.email AS user_email
FROM holds h
JOIN events e ON h.event_id = e.id
JOIN ticket_tiers tt ON h.tier_id = tt.id
LEFT JOIN users u ON h.user_id = u.id
WHERE h.payment_in_progress = TRUE
  AND h.order_id IS NULL
ORDER BY h.payment_started_at ASC;

COMMENT ON VIEW holds_with_active_payments IS 
'Shows all holds that currently have payment in progress. Useful for monitoring payment flow and identifying stuck payments.';

CREATE OR REPLACE VIEW holds_at_risk_of_expiration AS
SELECT 
  h.id,
  h.user_id,
  h.event_id,
  h.quantity,
  h.expires_at,
  h.payment_started_at,
  h.payment_in_progress,
  EXTRACT(EPOCH FROM (h.expires_at - NOW()))/60 AS minutes_until_expiration,
  e.name AS event_name,
  tt.name AS tier_name
FROM holds h
JOIN events e ON h.event_id = e.id
JOIN ticket_tiers tt ON h.tier_id = tt.id
WHERE h.order_id IS NULL
  AND h.expires_at > NOW()
  AND h.expires_at < NOW() + INTERVAL '2 minutes'
ORDER BY h.expires_at ASC;

COMMENT ON VIEW holds_at_risk_of_expiration IS 
'Shows holds that will expire in the next 2 minutes. Useful for monitoring and alerting on holds that might need intervention.';

