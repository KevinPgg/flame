-- Migration: Add updated_at column to holds table
-- This allows tracking when holds are consumed or modified

-- Add updated_at column to holds table
ALTER TABLE holds 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create index on updated_at for better query performance
CREATE INDEX IF NOT EXISTS idx_holds_updated_at ON holds(updated_at);

-- Add comment for documentation
COMMENT ON COLUMN holds.updated_at IS 
'Timestamp when the hold was last updated. Automatically set when order_id is assigned or other modifications occur.';
