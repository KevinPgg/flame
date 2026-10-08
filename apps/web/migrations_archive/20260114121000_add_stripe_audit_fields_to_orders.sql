-- Migration: Add Stripe audit fields to orders
-- Description: Adds Stripe IDs, fee fields, and payment status tracking

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type
    WHERE typname = 'orders_payment_status'
  ) THEN
    CREATE TYPE orders_payment_status AS ENUM (
      'authorized',
      'captured',
      'canceled',
      'failed'
    );
  END IF;
END $$;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS stripe_transfer_id text,
  ADD COLUMN IF NOT EXISTS stripe_fee_cents integer,
  ADD COLUMN IF NOT EXISTS organizer_account_id text,
  ADD COLUMN IF NOT EXISTS payment_status orders_payment_status,
  ADD COLUMN IF NOT EXISTS authorized_at timestamptz,
  ADD COLUMN IF NOT EXISTS captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_payment_intent_id_key
ON orders (stripe_payment_intent_id)
WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_stripe_transfer_id
ON orders (stripe_transfer_id)
WHERE stripe_transfer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_organizer_account_id
ON orders (organizer_account_id)
WHERE organizer_account_id IS NOT NULL;
