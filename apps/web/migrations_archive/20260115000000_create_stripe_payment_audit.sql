-- Create stripe_payment_audit table to track all Stripe payment intents
-- Provides complete audit trail for reconciliation and troubleshooting

CREATE TABLE IF NOT EXISTS stripe_payment_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Stripe Payment Intent Details
  stripe_payment_intent_id TEXT NOT NULL,
  stripe_event_id TEXT NOT NULL UNIQUE, -- The webhook event ID (Atomic uniqueness constraint)
  stripe_event_type TEXT NOT NULL, -- e.g., payment_intent.succeeded, payment_intent.canceled
  
  -- Payment Intent Data
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL, -- requires_payment_method, requires_confirmation, requires_action, processing, requires_capture, canceled, succeeded
  capture_method TEXT, -- automatic, manual
  
  -- Metadata from Payment Intent
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Related Records (nullable - may not exist for all payment intents)
  hold_id UUID REFERENCES holds(id) ON DELETE SET NULL,
  rsvp_id UUID REFERENCES rsvps(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  
  -- Financial Tracking (extracted from metadata where available)
  base_price_cents INTEGER,
  platform_fee_cents INTEGER,
  markup_percent DECIMAL(5,2),
  markup_fixed_cents INTEGER,
  
  -- Transfer Information (for destination charges)
  transfer_destination TEXT, -- Stripe account ID
  transfer_amount_cents INTEGER, -- Amount transferred to connected account
  
  -- Error Tracking
  last_payment_error TEXT, -- Error message if payment failed
  cancellation_reason TEXT, -- Why payment was canceled
  
  -- Timestamps
  stripe_created_at TIMESTAMP WITH TIME ZONE NOT NULL, -- When PI was created in Stripe
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(), -- When we logged this event
  
  -- Raw Event Data (for debugging)
  raw_event_data JSONB, -- Complete webhook event payload
  
  CONSTRAINT stripe_payment_audit_status_check 
    CHECK (status IN (
      'requires_payment_method', 
      'requires_confirmation', 
      'requires_action', 
      'processing', 
      'requires_capture', 
      'canceled', 
      'succeeded'
    ))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_stripe_payment_audit_pi_id 
  ON stripe_payment_audit(stripe_payment_intent_id);

-- Remove explicit index on stripe_event_id since it is now UNIQUE
-- CREATE INDEX IF NOT EXISTS idx_stripe_payment_audit_event_id 
--   ON stripe_payment_audit(stripe_event_id);

CREATE INDEX IF NOT EXISTS idx_stripe_payment_audit_event_type 
  ON stripe_payment_audit(stripe_event_type);

CREATE INDEX IF NOT EXISTS idx_stripe_payment_audit_status 
  ON stripe_payment_audit(status);

CREATE INDEX IF NOT EXISTS idx_stripe_payment_audit_user_id 
  ON stripe_payment_audit(user_id) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stripe_payment_audit_order_id 
  ON stripe_payment_audit(order_id) WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stripe_payment_audit_organization_id 
  ON stripe_payment_audit(organization_id) WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stripe_payment_audit_recorded_at 
  ON stripe_payment_audit(recorded_at DESC);

-- Composite index for finding latest event for a payment intent
CREATE INDEX IF NOT EXISTS idx_stripe_payment_audit_pi_recorded 
  ON stripe_payment_audit(stripe_payment_intent_id, recorded_at DESC);

-- Enable Row Level Security
ALTER TABLE stripe_payment_audit ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins and system can read audit logs
CREATE POLICY "Admins can read all stripe payment audit logs"
  ON stripe_payment_audit
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organizations
      WHERE organizations.id = stripe_payment_audit.organization_id
      AND organizations.owner_user_id = auth.uid()
    )
    OR
    -- Also allow users to see their own payment audits
    user_id = auth.uid()
  );

-- Policy: Only system can insert audit logs (via service role)
CREATE POLICY "System can insert stripe payment audit logs"
  ON stripe_payment_audit
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Add helpful comment
COMMENT ON TABLE stripe_payment_audit IS 
  'Complete audit trail of all Stripe payment intent events for reconciliation, troubleshooting, and compliance. Records every webhook event received from Stripe.';

COMMENT ON COLUMN stripe_payment_audit.stripe_event_id IS 
  'Unique Stripe webhook event ID (evt_xxx) - ensures we can track duplicate webhook deliveries';

COMMENT ON COLUMN stripe_payment_audit.metadata IS 
  'Complete metadata object from PaymentIntent - includes holdId, rsvpId, pricing breakdown, etc.';

COMMENT ON COLUMN stripe_payment_audit.raw_event_data IS 
  'Complete webhook event payload for debugging - stored as JSONB for queryability';
