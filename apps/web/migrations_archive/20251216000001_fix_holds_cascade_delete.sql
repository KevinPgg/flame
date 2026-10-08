-- Migration: Fix holds CASCADE delete behavior
-- 
-- PROBLEM: When events or ticket_tiers are deleted, holds are CASCADE deleted.
-- This causes "Cannot coerce to single JSON object" errors when users try to
-- validate holds that were CASCADE deleted. Users still have the hold_id in
-- their browser/URL, leading to confusing errors.
--
-- SOLUTION: Change foreign key constraints to SET NULL instead of CASCADE.
-- Holds should remain in the database for audit purposes and proper expiration.
-- The validation logic already checks if holds are expired or used.

-- Drop existing foreign key constraints
ALTER TABLE holds 
  DROP CONSTRAINT IF EXISTS holds_event_id_fkey,
  DROP CONSTRAINT IF EXISTS holds_tier_id_fkey;

-- Re-add constraints with SET NULL instead of CASCADE
-- This allows holds to remain in DB even if event/tier is deleted
-- They will fail validation gracefully with proper error messages
ALTER TABLE holds
  ADD CONSTRAINT holds_event_id_fkey 
    FOREIGN KEY (event_id) 
    REFERENCES events(id) 
    ON DELETE SET NULL;

ALTER TABLE holds
  ADD CONSTRAINT holds_tier_id_fkey 
    FOREIGN KEY (tier_id) 
    REFERENCES ticket_tiers(id) 
    ON DELETE SET NULL;

-- Add indexes to improve query performance on these FK columns
CREATE INDEX IF NOT EXISTS idx_holds_event_id ON holds(event_id);
CREATE INDEX IF NOT EXISTS idx_holds_tier_id ON holds(tier_id);

-- Add comments for documentation
COMMENT ON CONSTRAINT holds_event_id_fkey ON holds IS 
  'ON DELETE SET NULL: Allows holds to remain for audit/expiration even if event is deleted';
COMMENT ON CONSTRAINT holds_tier_id_fkey ON holds IS 
  'ON DELETE SET NULL: Allows holds to remain for audit/expiration even if tier is deleted';
