-- Add Stripe Connect fields to organizations
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS stripe_account_id text,
ADD COLUMN IF NOT EXISTS stripe_charges_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS stripe_payouts_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS platform_fee_percent numeric(5,2) DEFAULT 12.50;

-- Add Stripe fields to rsvps
ALTER TABLE rsvps
ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

-- Add Stripe fields to orders
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS platform_fee_cents integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_account_id ON organizations(stripe_account_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_stripe_payment_intent_id ON rsvps(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_payment_intent_id ON orders(stripe_payment_intent_id);

-- Add unique constraints to prevent duplicate Stripe account/payment intent associations
-- Each organization should have at most one Stripe Connect account
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_stripe_account_id_unique 
ON organizations(stripe_account_id) WHERE stripe_account_id IS NOT NULL;

-- Each PaymentIntent should only be associated with one RSVP
CREATE UNIQUE INDEX IF NOT EXISTS idx_rsvps_stripe_payment_intent_id_unique 
ON rsvps(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

-- Each PaymentIntent should only be associated with one Order
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_stripe_payment_intent_id_unique 
ON orders(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

