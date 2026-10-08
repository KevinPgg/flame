-- Fix return type mismatch in check_pending_checkouts_for_recovery function
-- The amount column is numeric(10,2), but the function was defined to return integer

DROP FUNCTION IF EXISTS check_pending_checkouts_for_recovery(integer, integer);

CREATE OR REPLACE FUNCTION check_pending_checkouts_for_recovery(p_min_minutes integer, p_limit integer)
 RETURNS TABLE(id uuid, datafast_checkout_id text, amount numeric, hold_id uuid, user_id uuid, merchant_transaction_id text, checkout_created_at timestamptz)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  UPDATE datafast_transactions t
  SET recovery_in_progress = TRUE
  WHERE t.id IN (
    SELECT t2.id
    FROM datafast_transactions t2
    WHERE t2.status = 'pending'
    AND t2.transaction_type = 'checkout_created'
    AND t2.datafast_checkout_id IS NOT NULL
    AND t2.datafast_transaction_id IS NULL
    AND t2.checkout_created_at < (now() - (p_min_minutes || ' minutes')::interval)
    AND (t2.recovery_in_progress IS FALSE OR t2.recovery_in_progress IS NULL)
    ORDER BY t2.checkout_created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING t.id, t.datafast_checkout_id, t.amount, t.hold_id, t.user_id, t.merchant_transaction_id, t.checkout_created_at;
END;
$function$;

