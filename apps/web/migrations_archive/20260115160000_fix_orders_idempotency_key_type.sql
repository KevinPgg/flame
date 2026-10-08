-- Migration: Change idempotency_key to text to support Stripe IDs
-- Description: The idempotency_key column was previously UUID but needs to support Stripe IDs (e.g. pi_...)
-- which are strings. This migration alters the column type to text.

ALTER TABLE orders 
ALTER COLUMN idempotency_key TYPE text;
