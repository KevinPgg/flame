-- Optional: Add constraints and index for secret_code column
-- This migration is optional and can be applied if you want database-level validation

-- Add CHECK constraint to ensure secret_code has minimum length if provided
-- This prevents empty strings (use NULL instead)
ALTER TABLE ticket_tiers 
ADD CONSTRAINT ticket_tiers_secret_code_check 
CHECK (secret_code IS NULL OR LENGTH(TRIM(secret_code)) >= 3);

-- Add index on secret_code for faster lookups if you plan to search by code
-- Note: This is only useful if you need to find tiers by their secret code
-- CREATE INDEX IF NOT EXISTS idx_ticket_tiers_secret_code ON ticket_tiers(secret_code) WHERE secret_code IS NOT NULL;

-- Add comment explaining the constraint
COMMENT ON CONSTRAINT ticket_tiers_secret_code_check ON ticket_tiers IS 
'Ensures secret_code is either NULL or has at least 3 characters when provided';

