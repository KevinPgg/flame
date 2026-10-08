-- Migration: Add inventory increment functions for RSVP purchase completion
-- These functions atomically update ticket tier and stage inventory

-- Function to increment/decrement ticket tier quantity_sold
CREATE OR REPLACE FUNCTION increment_tier_quantity_sold(
  p_tier_id UUID,
  p_increment INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
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

-- Add comment for documentation
COMMENT ON FUNCTION increment_tier_quantity_sold(UUID, INTEGER) IS 
'Atomically increments (or decrements if negative) the quantity_sold for a ticket tier.
Uses SELECT ... FOR UPDATE to lock the row and validate bounds before updating.
Prevents underflow (quantity_sold < 0) and overflow (quantity_sold > quantity_total).
Raises exceptions with specific error codes:
- P0002: Tier not found
- 23514 (UNDERFLOW): Would result in negative quantity_sold
- 23514 (OVERFLOW): Would exceed tier capacity
Used by RSVP purchase completion and rollback operations.';

-- Set search_path for security
ALTER FUNCTION increment_tier_quantity_sold(UUID, INTEGER) SET search_path = public, pg_temp;

-- Function to increment/decrement ticket stage sold_quantity
CREATE OR REPLACE FUNCTION increment_stage_sold_quantity(
  p_stage_id UUID,
  p_increment INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
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

-- Add comment for documentation
COMMENT ON FUNCTION increment_stage_sold_quantity(UUID, INTEGER) IS 
'Atomically increments (or decrements if negative) the sold_quantity for a ticket stage.
Uses SELECT ... FOR UPDATE to lock the row and validate bounds before updating.
Prevents underflow (sold_quantity < 0) and overflow (sold_quantity > stage.quantity).
Raises exceptions with specific error codes:
- P0002: Stage not found
- 23514 (UNDERFLOW): Would result in negative sold_quantity
- 23514 (OVERFLOW): Would exceed stage capacity
Used by RSVP purchase completion and rollback operations.';

-- Set search_path for security
ALTER FUNCTION increment_stage_sold_quantity(UUID, INTEGER) SET search_path = public, pg_temp;

