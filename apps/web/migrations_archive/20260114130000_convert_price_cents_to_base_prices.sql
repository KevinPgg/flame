-- Migration: Convert price_cents to Base Prices for Stripe Connect Model
-- Description: Converts ticket_tiers and ticket_stages price_cents from final customer prices
-- to base organizer prices. This aligns with the "Guaranteed Net" model where:
-- - price_cents = what organizer receives (base price)
-- - Markup is calculated and added during checkout based on event.markup_percent
--
-- ============================================================================
-- BACKUP: Create backup tables before conversion (for safety)
-- ============================================================================

DO $$
DECLARE
  tiers_already_converted boolean;
BEGIN
  -- Check if migration was already applied by looking for the column comment
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_description d
    JOIN pg_catalog.pg_class c ON d.objoid = c.oid
    JOIN pg_catalog.pg_attribute a ON d.objoid = a.attrelid AND d.objsubid = a.attnum
    WHERE c.relname = 'ticket_tiers' 
    AND a.attname = 'price_cents' 
    AND d.description LIKE '%Base ticket price in cents%'
  ) INTO tiers_already_converted;

  IF tiers_already_converted THEN
    RAISE NOTICE 'Migration already applied (based on column comment), skipping price conversion.';
    RETURN;
  END IF;

  -- ============================================================================
  -- BACKUP: Create backup tables inside guard block to prevent overwrite
  -- ============================================================================
  
  -- Create backup tables if they don't exist
  CREATE TABLE IF NOT EXISTS ticket_tiers_price_backup (LIKE ticket_tiers INCLUDING ALL);
  CREATE TABLE IF NOT EXISTS ticket_stages_price_backup (LIKE ticket_stages INCLUDING ALL);
  
  -- Populate backups only if they are empty (prevents overwriting valid backup from previous run)
  INSERT INTO ticket_tiers_price_backup 
  SELECT t.* FROM ticket_tiers t
  LEFT JOIN ticket_tiers_price_backup b ON t.id = b.id
  WHERE b.id IS NULL;
  
  INSERT INTO ticket_stages_price_backup 
  SELECT t.* FROM ticket_stages t
  LEFT JOIN ticket_stages_price_backup b ON t.id = b.id
  WHERE b.id IS NULL;

  -- Perform Ticket Tiers Update
  UPDATE ticket_tiers
  SET price_cents = (
    CASE 
      -- Free tickets stay free
      WHEN price_cents = 0 THEN 0
      
      -- If fee_percentage is stored, use it for precise extraction
      WHEN fee_percentage IS NOT NULL AND fee_percentage > 0 THEN
        ROUND(price_cents / (1 + (fee_percentage::numeric/100) + (fee_percentage::numeric/100 * 0.15)))
      
      -- For tiers created after Nov 8, 2025, use 7% fee rate
      WHEN created_at >= '2025-11-08T00:00:00Z' THEN
        ROUND(price_cents / (1 + 0.07 + 0.07 * 0.15))
      
      -- For older tiers (before Nov 8, 2025), use legacy 10% fee rate
      ELSE
        ROUND(price_cents / (1 + 0.10 + 0.10 * 0.15))
    END
  );

  -- Perform Ticket Stages Update
  UPDATE ticket_stages
  SET price_cents = (
    CASE 
      -- Free tickets stay free
      WHEN price_cents = 0 THEN 0
      
      -- If fee_percentage is stored, use it for precise extraction
      WHEN fee_percentage IS NOT NULL AND fee_percentage > 0 THEN
        ROUND(price_cents / (1 + (fee_percentage::numeric/100) + (fee_percentage::numeric/100 * 0.15)))
      
      -- For stages created after Nov 8, 2025, use 7% fee rate
      WHEN created_at >= '2025-11-08T00:00:00Z' THEN
        ROUND(price_cents / (1 + 0.07 + 0.07 * 0.15))
      
      -- For older stages (before Nov 8, 2025), use legacy 10% fee rate
      ELSE
        ROUND(price_cents / (1 + 0.10 + 0.10 * 0.15))
    END
  );

  -- ============================================================================
  -- STEP 3: Add column comments for clarity (moved inside DO block for atomicity)
  -- ============================================================================
  
  EXECUTE 'COMMENT ON COLUMN ticket_tiers.price_cents IS ''Base ticket price in cents (net amount organizer receives). Platform markup (from events.markup_percent and events.markup_fixed_cents) is calculated and added during checkout. This field stores the guaranteed net payout amount that will be transferred to the organizer.''';
  
  EXECUTE 'COMMENT ON COLUMN ticket_stages.price_cents IS ''Base ticket price in cents (net amount organizer receives). Platform markup (from events.markup_percent and events.markup_fixed_cents) is calculated and added during checkout. This field stores the guaranteed net payout amount that will be transferred to the organizer.''';

END $$;

-- ============================================================================
-- VERIFICATION: Log conversion results for audit
-- ============================================================================

DO $$
DECLARE
  tiers_converted INTEGER;
  stages_converted INTEGER;
  tiers_total INTEGER;
  stages_total INTEGER;
  backups_present_tiers INTEGER;
  backups_present_stages INTEGER;
BEGIN
  -- Check if backups exist and have data
  SELECT COUNT(*) INTO backups_present_tiers 
  FROM ticket_tiers_price_backup 
  WHERE price_cents IS NOT NULL;

  SELECT COUNT(*) INTO backups_present_stages 
  FROM ticket_stages_price_backup 
  WHERE price_cents IS NOT NULL;

  IF backups_present_tiers = 0 AND backups_present_stages = 0 THEN
    RAISE NOTICE 'Skipping verification: No data in backup tables (migration likely skipped or empty DB).';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO tiers_total FROM ticket_tiers WHERE price_cents > 0;
  SELECT COUNT(*) INTO stages_total FROM ticket_stages WHERE price_cents > 0;
  
  -- Only count conversions if backup tables have data matching original
  IF backups_present_tiers > 0 THEN
    SELECT COUNT(*) INTO tiers_converted 
    FROM ticket_tiers t
    JOIN ticket_tiers_price_backup b ON t.id = b.id
    WHERE t.price_cents != b.price_cents AND t.price_cents > 0;
  ELSE
    tiers_converted := 0;
  END IF;
  
  IF backups_present_stages > 0 THEN
    SELECT COUNT(*) INTO stages_converted 
    FROM ticket_stages t
    JOIN ticket_stages_price_backup b ON t.id = b.id
    WHERE t.price_cents != b.price_cents AND t.price_cents > 0;
  ELSE
    stages_converted := 0;
  END IF;
  
  RAISE NOTICE 'Price Conversion Complete:';
  RAISE NOTICE '  - Ticket Tiers: % of % converted to base prices', tiers_converted, tiers_total;
  RAISE NOTICE '  - Ticket Stages: % of % converted to base prices', stages_converted, stages_total;
  RAISE NOTICE '  - Backup tables: ticket_tiers_price_backup, ticket_stages_price_backup';
END $$;
