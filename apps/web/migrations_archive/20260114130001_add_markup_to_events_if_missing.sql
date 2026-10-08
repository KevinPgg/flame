-- Migration: Ensure all events have markup fields with proper defaults
-- Description: Adds markup_percent and markup_fixed_cents to events table if missing
-- and sets defaults for existing events that don't have these values set

-- ============================================================================
-- STEP 1: Add columns if they don't exist (idempotent)
-- ============================================================================

ALTER TABLE events
ADD COLUMN IF NOT EXISTS markup_percent numeric(5,2) DEFAULT 12.5,
ADD COLUMN IF NOT EXISTS markup_fixed_cents integer DEFAULT 30;

-- ============================================================================
-- STEP 2: Set defaults for existing events that have NULL values
-- ============================================================================

UPDATE events SET markup_percent = 12.5 WHERE markup_percent IS NULL;
UPDATE events SET markup_fixed_cents = 30 WHERE markup_fixed_cents IS NULL;

-- ============================================================================
-- STEP 3: Add column comments for documentation
-- ============================================================================

COMMENT ON COLUMN events.markup_percent IS 
  'Percentage markup added to base ticket prices (default 12.5%). ' ||
  'This represents the total platform markup including: ' ||
  'Platform Profit (~7%) + Stripe Processing (~2.9%) + International Fees (~1.5%) + ' ||
  'Currency Conversion (~1%) + Rounding Buffer (~0.1%). ' ||
  'Adjustable per event to modify platform profitability.';

COMMENT ON COLUMN events.markup_fixed_cents IS 
  'Fixed fee in cents added to each ticket purchase (default 30 cents / $0.30). ' ||
  'This represents the Stripe fixed transaction fee. ' ||
  'Combined with markup_percent to calculate total customer charge.';

-- ============================================================================
-- STEP 4: Ensure NOT NULL constraint for data integrity
-- ============================================================================

-- Set NOT NULL constraints now that all rows have values
ALTER TABLE events
ALTER COLUMN markup_percent SET NOT NULL,
ALTER COLUMN markup_fixed_cents SET NOT NULL;

-- ============================================================================
-- VERIFICATION: Log current markup settings
-- ============================================================================

DO $$
DECLARE
  event_count INTEGER;
  default_count INTEGER;
  custom_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO event_count FROM events;
  
  SELECT COUNT(*) INTO default_count 
  FROM events 
  WHERE markup_percent = 12.5 AND markup_fixed_cents = 30;
  
  SELECT COUNT(*) INTO custom_count 
  FROM events 
  WHERE markup_percent != 12.5 OR markup_fixed_cents != 30;
  
  RAISE NOTICE 'Events Markup Configuration:';
  RAISE NOTICE '  - Total events: %', event_count;
  RAISE NOTICE '  - Using default markup (12.5%% + $0.30): %', default_count;
  RAISE NOTICE '  - Using custom markup: %', custom_count;
END $$;
