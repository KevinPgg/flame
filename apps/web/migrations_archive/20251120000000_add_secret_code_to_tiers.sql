-- Add secret_code column to ticket_tiers table
ALTER TABLE ticket_tiers ADD COLUMN IF NOT EXISTS secret_code TEXT;

-- Add comment to explain usage
COMMENT ON COLUMN ticket_tiers.secret_code IS 'Secret code required to purchase this tier. If null, no code is required.';

