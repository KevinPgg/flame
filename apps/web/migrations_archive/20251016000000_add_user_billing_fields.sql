-- Migration: Add billing information fields to users table for Datafast integration
-- These fields are required by Datafast payment gateway for transaction processing

-- Add billing fields to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS phone VARCHAR(25),
ADD COLUMN IF NOT EXISTS billing_address VARCHAR(100),
ADD COLUMN IF NOT EXISTS billing_city VARCHAR(50),
ADD COLUMN IF NOT EXISTS billing_country VARCHAR(2),
ADD COLUMN IF NOT EXISTS document_type VARCHAR(20),
ADD COLUMN IF NOT EXISTS document_id VARCHAR(10),
ADD COLUMN IF NOT EXISTS ip_address VARCHAR(255);

-- Add comments for documentation
COMMENT ON COLUMN users.phone IS 'User phone number (7-25 characters, required by Datafast)';
COMMENT ON COLUMN users.billing_address IS 'User billing street address (required by Datafast)';
COMMENT ON COLUMN users.billing_city IS 'User billing city';
COMMENT ON COLUMN users.billing_country IS 'User billing country code (ISO 3166-1, e.g., EC, US)';
COMMENT ON COLUMN users.document_type IS 'Document type (e.g., IDCARD, passport)';
COMMENT ON COLUMN users.document_id IS 'Document identification number (max 10 characters)';
COMMENT ON COLUMN users.ip_address IS 'Last known IP address for transaction tracking';

