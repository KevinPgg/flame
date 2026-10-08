-- Migration: Fix quantity_total sync issue with ticket stages
-- This updates the update_ticket_stages function to automatically sync
-- the ticket_tier's quantity_total with the sum of all stage quantities

CREATE OR REPLACE FUNCTION update_ticket_stages(
  p_ticket_tier_id UUID,
  p_stages JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
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

-- Update comment for documentation
COMMENT ON FUNCTION update_ticket_stages(UUID, JSONB) IS 
'Atomically updates ticket stages for a ticket tier. Handles delete, update, and insert operations in a transaction. 
Automatically syncs the ticket_tier.quantity_total with the sum of all stage quantities to prevent data inconsistencies.
Returns JSONB with success status. Raises exceptions on validation failures which trigger automatic rollback.';

-- Set search_path for security (prevents SQL injection via search_path manipulation)
ALTER FUNCTION update_ticket_stages(UUID, JSONB) SET search_path = public, pg_temp;
