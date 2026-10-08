-- Fix ambiguous column reference in check_pending_checkouts_for_recovery function
-- This function atomically finds pending transactions and locks them for recovery processing

-- Drop first to allow return type changes if needed
DROP FUNCTION IF EXISTS check_pending_checkouts_for_recovery(integer, integer);

CREATE OR REPLACE FUNCTION check_pending_checkouts_for_recovery(p_min_minutes integer, p_limit integer)
 RETURNS TABLE(id uuid, datafast_checkout_id text, amount integer, hold_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH to_lock AS MATERIALIZED (
    SELECT t2.id
    FROM datafast_transactions t2
    WHERE t2.status = 'pending'
      AND t2.datafast_checkout_id IS NOT NULL
      AND t2.created_at < (now() - (p_min_minutes || ' minutes')::interval)
      AND (t2.recovery_in_progress IS FALSE OR t2.recovery_in_progress IS NULL)
    ORDER BY t2.created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE datafast_transactions t
  SET recovery_in_progress = TRUE
  FROM to_lock
  WHERE t.id = to_lock.id
  RETURNING t.id, t.datafast_checkout_id, t.amount, t.hold_id;
END;
$function$;

