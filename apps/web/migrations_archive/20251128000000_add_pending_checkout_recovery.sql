-- Migration: add_pending_checkout_recovery.sql
-- Description: Function to find pending checkouts for recovery

-- Create index to support the query
CREATE INDEX IF NOT EXISTS idx_datafast_transactions_pending_checkout_recovery 
ON datafast_transactions (status, transaction_type, checkout_created_at)
WHERE recovery_in_progress = false;

CREATE OR REPLACE FUNCTION check_pending_checkouts_for_recovery(
  p_min_minutes INTEGER DEFAULT 15,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  datafast_checkout_id TEXT,
  merchant_transaction_id TEXT,
  hold_id UUID,
  user_id UUID,
  amount NUMERIC,
  checkout_created_at TIMESTAMPTZ
) AS $$
DECLARE
  v_locked_ids UUID[];
BEGIN
  -- Step 1: Select and lock rows atomically
  WITH locked_rows AS (
    SELECT id
    FROM datafast_transactions dt
    WHERE dt.status = 'pending'
      AND dt.transaction_type = 'checkout_created'
      AND dt.datafast_checkout_id IS NOT NULL
      AND dt.datafast_transaction_id IS NULL  -- Never verified
      AND dt.checkout_created_at < NOW() - (p_min_minutes || ' minutes')::INTERVAL
      AND dt.recovery_in_progress = false
    ORDER BY dt.checkout_created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  SELECT array_agg(id) INTO v_locked_ids FROM locked_rows;

  -- If no rows found, return early
  IF v_locked_ids IS NULL THEN
    RETURN;
  END IF;

  -- Step 2: Mark them as recovery in progress
  UPDATE datafast_transactions
  SET recovery_in_progress = true
  WHERE id = ANY(v_locked_ids);

  -- Step 3: Return the data
  RETURN QUERY
  SELECT
    dt.id,
    dt.datafast_checkout_id,
    dt.merchant_transaction_id,
    dt.hold_id,
    dt.user_id,
    dt.amount,
    dt.checkout_created_at
  FROM datafast_transactions dt
  WHERE dt.id = ANY(v_locked_ids);
END;
$$ LANGUAGE plpgsql;

-- Add comment for documentation
COMMENT ON FUNCTION check_pending_checkouts_for_recovery IS 
'Finds pending Datafast checkouts that are older than p_min_minutes and have not been verified. Used to recover "ghost payments" where callback failed.';

