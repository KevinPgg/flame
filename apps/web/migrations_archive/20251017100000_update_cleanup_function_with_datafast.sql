-- Migration: Update cleanup function to include datafast_transactions
-- The cleanup function needs to delete datafast_transactions before orders
-- to respect the foreign key constraint

CREATE OR REPLACE FUNCTION cleanup_all_ticket_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER  -- Run with elevated privileges to access all tables
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

-- Ensure proper permissions
REVOKE ALL ON FUNCTION cleanup_all_ticket_data FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_all_ticket_data TO authenticated;

COMMENT ON FUNCTION cleanup_all_ticket_data IS 
'Atomically deletes all ticket-related data (tickets, orders, RSVPs, holds, purchase tokens, checkins, datafast_transactions) 
and resets all counters. This operation is irreversible and should only be called by administrators. 
All operations are performed in a single transaction to ensure consistency.';

