-- Migration: Add date_of_birth field to users table
-- This field is collected during the purchase flow and stored in ISO 8601 format (YYYY-MM-DD)
-- It is required for new purchases but nullable to support existing users who haven't made a purchase yet
-- The field is used for purchase exports and regulatory compliance

-- Add date_of_birth field to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS date_of_birth VARCHAR(10);

-- Add comment for documentation
COMMENT ON COLUMN users.date_of_birth IS 'User date of birth in YYYY-MM-DD format (ISO 8601). Required when making a purchase, nullable for existing users. Used for purchase exports and compliance tracking.';

