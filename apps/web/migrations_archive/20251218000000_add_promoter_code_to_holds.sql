-- Migration: Add promoter_code column to holds table
-- Description: Store promoter codes directly in hold records for reliable server-side tracking
-- This eliminates dependence on client-side sessionStorage and URL parameters

-- Add promoter_code column to holds table
ALTER TABLE holds 
ADD COLUMN IF NOT EXISTS promoter_code VARCHAR(50);

-- Create index for efficient querying by promoter code
CREATE INDEX IF NOT EXISTS idx_holds_promoter_code ON holds(promoter_code);

-- Add comment explaining the purpose
COMMENT ON COLUMN holds.promoter_code IS 'Tracks which promoter link was used when creating this hold. Stored server-side to survive redirects and prevent multi-tab conflicts.';
