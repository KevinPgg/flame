-- Migration: Drop pending checkout recovery function and index
-- Description: Removes the check_pending_checkouts_for_recovery function and associated index
-- This functionality is being deprecated as we move away from automatic pending checkout recovery

DROP FUNCTION IF EXISTS check_pending_checkouts_for_recovery(integer, integer);
DROP INDEX IF EXISTS idx_datafast_transactions_pending_checkout_recovery;

