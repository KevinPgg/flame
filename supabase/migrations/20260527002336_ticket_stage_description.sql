-- W4-C2 (May 2026): organizer-authored description for individual ticket stages.
-- ticket_tiers.description already exists from baseline. This migration adds the
-- ticket_stages counterpart and extends the two RPCs that mutate stages
-- (create_ticket_tier_with_stages, update_ticket_stages) so the field round-trips.
--
-- Length is enforced client-side (120 chars) and via the API Zod schemas; no DB
-- check constraint is added so historical content (e.g. legacy imports) cannot
-- accidentally break.

ALTER TABLE public.ticket_stages
  ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN public.ticket_stages.description IS
  'Optional organizer description for this stage. When set on the currently active stage, attendee surfaces render it in place of the tier-level description so the active offer can communicate stage-specific terms (e.g. "Includes free drink"). 120-char cap enforced at the API layer.';


-- Re-create create_ticket_tier_with_stages (V2 with p_fee_percentage) so it
-- forwards the new `description` field from the stages JSON into the inserted
-- ticket_stages row.
CREATE OR REPLACE FUNCTION public.create_ticket_tier_with_stages(
  p_event_id uuid,
  p_name text,
  p_price_cents integer,
  p_quantity_total integer,
  p_per_user_limit integer,
  p_sales_start timestamp with time zone,
  p_sales_end timestamp with time zone,
  p_order_index integer,
  p_use_stages boolean DEFAULT false,
  p_stages jsonb DEFAULT NULL,
  p_fee_percentage numeric DEFAULT 7.00
) RETURNS jsonb
  LANGUAGE plpgsql
AS $$
DECLARE
  v_tier_id UUID;
  v_stage JSONB;
  v_result JSONB;
  v_total_stage_quantity INTEGER;
BEGIN
  INSERT INTO ticket_tiers (
    event_id, name, price_cents, quantity_total, per_user_limit,
    sales_start, sales_end, order_index, fee_percentage
  ) VALUES (
    p_event_id, p_name, p_price_cents, p_quantity_total, p_per_user_limit,
    p_sales_start, p_sales_end, p_order_index, p_fee_percentage
  )
  RETURNING id INTO v_tier_id;

  IF p_use_stages AND p_stages IS NOT NULL THEN
    SELECT COALESCE(SUM((stage->>'quantity')::INTEGER), 0)
    INTO v_total_stage_quantity
    FROM jsonb_array_elements(p_stages) AS stage;

    IF v_total_stage_quantity != p_quantity_total THEN
      RAISE EXCEPTION 'Stage quantities (%) must sum to tier total quantity (%)',
        v_total_stage_quantity, p_quantity_total
        USING ERRCODE = 'check_violation';
    END IF;

    FOR v_stage IN SELECT * FROM jsonb_array_elements(p_stages)
    LOOP
      INSERT INTO ticket_stages (
        ticket_tier_id, name, price_cents, currency, quantity, sold_quantity,
        order_index, fee_percentage, description
      ) VALUES (
        v_tier_id,
        v_stage->>'name',
        (v_stage->>'price_cents')::INTEGER,
        'USD',
        (v_stage->>'quantity')::INTEGER,
        0,
        (v_stage->>'order_index')::INTEGER,
        p_fee_percentage,
        NULLIF(v_stage->>'description', '')
      );
    END LOOP;
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'tier_id', v_tier_id,
    'message', 'Ticket tier created successfully'
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;


-- Re-create update_ticket_stages so the stages UPSERT forwards the new
-- `description` field. Behavior is otherwise unchanged.
CREATE OR REPLACE FUNCTION public.update_ticket_stages(
  p_ticket_tier_id uuid,
  p_stages jsonb
) RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
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
  SELECT ARRAY_AGG(id) INTO v_existing_stage_ids
  FROM ticket_stages
  WHERE ticket_tier_id = p_ticket_tier_id;

  SELECT ARRAY_AGG((stage->>'id')::UUID)
  INTO v_provided_stage_ids
  FROM jsonb_array_elements(p_stages) AS stage
  WHERE stage->>'id' IS NOT NULL;

  v_existing_stage_ids := COALESCE(v_existing_stage_ids, ARRAY[]::UUID[]);
  v_provided_stage_ids := COALESCE(v_provided_stage_ids, ARRAY[]::UUID[]);

  FOR v_stage IN SELECT * FROM jsonb_array_elements(p_stages)
  LOOP
    v_stage_id := (v_stage->>'id')::UUID;

    IF v_stage_id IS NOT NULL THEN
      SELECT sold_quantity INTO v_sold_quantity
      FROM ticket_stages
      WHERE id = v_stage_id;

      IF FOUND THEN
        v_new_quantity := (v_stage->>'quantity')::INTEGER;

        IF v_new_quantity < v_sold_quantity THEN
          RAISE EXCEPTION 'Cannot reduce stage "%" quantity to %. % tickets have already been sold from this stage.',
            v_stage->>'name', v_new_quantity, v_sold_quantity
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;
    END IF;
  END LOOP;

  SELECT ARRAY(
    SELECT unnest(v_existing_stage_ids)
    EXCEPT
    SELECT unnest(v_provided_stage_ids)
  ) INTO v_stages_to_delete;

  IF array_length(v_stages_to_delete, 1) > 0 THEN
    IF EXISTS (
      SELECT 1
      FROM ticket_stages
      WHERE id = ANY(v_stages_to_delete)
      AND sold_quantity > 0
    ) THEN
      RAISE EXCEPTION 'Cannot remove stages that have sold tickets. Please keep all stages with sold tickets or contact support.'
        USING ERRCODE = 'check_violation';
    END IF;

    DELETE FROM ticket_stages
    WHERE id = ANY(v_stages_to_delete);
  END IF;

  FOR v_stage IN SELECT * FROM jsonb_array_elements(p_stages)
  LOOP
    v_stage_id := (v_stage->>'id')::UUID;

    IF v_stage_id IS NOT NULL AND v_stage_id = ANY(v_existing_stage_ids) THEN
      UPDATE ticket_stages
      SET
        name = v_stage->>'name',
        price_cents = (v_stage->>'price_cents')::INTEGER,
        quantity = (v_stage->>'quantity')::INTEGER,
        order_index = (v_stage->>'order_index')::INTEGER,
        description = NULLIF(v_stage->>'description', ''),
        updated_at = NOW()
      WHERE id = v_stage_id
      AND sold_quantity <= (v_stage->>'quantity')::INTEGER;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Cannot update stage "%": tickets were sold during the update. Please refresh and try again.',
          v_stage->>'name'
          USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      INSERT INTO ticket_stages (
        ticket_tier_id, name, price_cents, currency, quantity, sold_quantity,
        order_index, description
      ) VALUES (
        p_ticket_tier_id,
        v_stage->>'name',
        (v_stage->>'price_cents')::INTEGER,
        'USD',
        (v_stage->>'quantity')::INTEGER,
        0,
        (v_stage->>'order_index')::INTEGER,
        NULLIF(v_stage->>'description', '')
      );
    END IF;
  END LOOP;

  SELECT
    COUNT(*) AS stage_count,
    COALESCE(SUM(quantity), 0) AS total_quantity
  INTO v_stage_count, v_total_stage_quantity
  FROM ticket_stages
  WHERE ticket_tier_id = p_ticket_tier_id;

  IF v_stage_count > 0 THEN
    UPDATE ticket_tiers
    SET
      quantity_total = v_total_stage_quantity,
      updated_at = NOW()
    WHERE id = p_ticket_tier_id;
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'message', 'Ticket stages updated successfully',
    'synced_quantity_total', v_total_stage_quantity
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;
