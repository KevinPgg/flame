-- Migration: Add stage information to RSVPs
-- This allows us to track which stage a user RSVPed at, preserving the price and stage name

-- Check if columns already exist and add them if they don't
DO $$ 
BEGIN
  -- Add stage_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rsvps' AND column_name = 'stage_id'
  ) THEN
    ALTER TABLE rsvps ADD COLUMN stage_id UUID REFERENCES ticket_stages(id) ON DELETE SET NULL;
  END IF;

  -- Add stage_name column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rsvps' AND column_name = 'stage_name'
  ) THEN
    ALTER TABLE rsvps ADD COLUMN stage_name TEXT;
  END IF;

  -- Add stage_price_cents column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rsvps' AND column_name = 'stage_price_cents'
  ) THEN
    ALTER TABLE rsvps ADD COLUMN stage_price_cents INTEGER;
  END IF;
END $$;

-- Add index for better query performance (if it doesn't exist)
CREATE INDEX IF NOT EXISTS idx_rsvps_stage_id ON rsvps(stage_id);

-- Add comments for documentation
COMMENT ON COLUMN rsvps.stage_id IS 'The ticket stage ID at the time of RSVP creation (null for tiers without stages)';
COMMENT ON COLUMN rsvps.stage_name IS 'The ticket stage name at the time of RSVP creation for historical reference';
COMMENT ON COLUMN rsvps.stage_price_cents IS 'The price in cents at the time of RSVP creation (from either stage or tier)';
