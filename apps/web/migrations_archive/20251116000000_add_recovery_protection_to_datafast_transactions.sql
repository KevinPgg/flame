-- Migration: Add recovery protection to datafast_transactions table
-- Description: Add recovery_in_progress column and RPC function for atomic locking
-- This prevents concurrent recovery workers from processing the same transactions

-- Add recovery_in_progress column
ALTER TABLE datafast_transactions 
ADD COLUMN IF NOT EXISTS recovery_in_progress BOOLEAN DEFAULT FALSE;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_datafast_transactions_recovery_in_progress 
ON datafast_transactions(recovery_in_progress) 
WHERE recovery_in_progress = TRUE;

-- Add comment for documentation
COMMENT ON COLUMN datafast_transactions.recovery_in_progress IS 
'Flag indicating transaction recovery is currently in progress. Prevents concurrent recovery workers from processing the same transaction.';

-- Create RPC function to atomically select and lock stuck transactions
-- Uses FOR UPDATE SKIP LOCKED to ensure only one worker processes each transaction
CREATE OR REPLACE FUNCTION lock_stuck_transactions_for_recovery(
  p_min_minutes INTEGER DEFAULT 10,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  datafast_transaction_id TEXT,
  merchant_transaction_id TEXT,
  status TEXT,
  result_code TEXT,
  amount DECIMAL,
  currency TEXT,
  user_id UUID,
  customer_email TEXT,
  hold_id UUID,
  order_id UUID,
  verified_at TIMESTAMPTZ,
  verification_response_data JSONB,
  checkout_request_data JSONB,
  auth_code TEXT,
  reference_no TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
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

-- Add comment for documentation
COMMENT ON FUNCTION lock_stuck_transactions_for_recovery IS 
'Atomically selects and locks stuck transactions for recovery. Uses FOR UPDATE SKIP LOCKED to prevent concurrent processing. Returns up to p_limit transactions that have been stuck for at least p_min_minutes.';

