-- Migration: Add constraint to source column and index for payment monitoring
-- Description: Adds CHECK constraint for orders.source and creates composite index for RSVPs payment monitoring

-- Add CHECK constraint to orders.source to ensure data integrity (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'orders_source_check'
      AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE orders
    ADD CONSTRAINT orders_source_check CHECK (source IN ('rsvp', 'hold', 'direct'));
  END IF;
END $$;

-- Create composite index for payment monitoring cron job optimization
-- Optimizes query: .eq("status", "pending").not("stripe_payment_intent_id", "is", null).lte("created_at", ...).gte("created_at", ...)
CREATE INDEX IF NOT EXISTS idx_rsvps_payment_monitoring 
ON rsvps(status, stripe_payment_intent_id, created_at)
WHERE status = 'pending' AND stripe_payment_intent_id IS NOT NULL;
