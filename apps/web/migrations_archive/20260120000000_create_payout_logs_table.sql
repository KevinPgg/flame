-- Create payout_logs table for audit trail
CREATE TABLE IF NOT EXISTS public.payout_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_payout_id TEXT NOT NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  requested_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'canceled', 'in_transit')),
  arrival_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add index for organization lookups
CREATE INDEX IF NOT EXISTS idx_payout_logs_organization_id ON public.payout_logs(organization_id);

-- Add index for stripe_payout_id lookups
CREATE INDEX IF NOT EXISTS idx_payout_logs_stripe_payout_id ON public.payout_logs(stripe_payout_id);

-- Add index for requested_by lookups
CREATE INDEX IF NOT EXISTS idx_payout_logs_requested_by ON public.payout_logs(requested_by);

-- Enable RLS
ALTER TABLE public.payout_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Organization admins/owners can view their organization's payout logs
CREATE POLICY payout_logs_view_policy ON public.payout_logs
  FOR SELECT
  USING (
    organization_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      INNER JOIN public.users u ON u.id = om.user_id
      WHERE u.clerk_id = auth.jwt() ->> 'sub'
        AND om.role IN ('admin', 'owner')
    )
  );

-- Policy: Only the platform (service role) can insert payout logs
CREATE POLICY payout_logs_insert_policy ON public.payout_logs
  FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE public.payout_logs IS 'Audit trail of all payout requests and their outcomes. Tracks who requested payouts, when, and the results.';
COMMENT ON COLUMN public.payout_logs.stripe_payout_id IS 'Stripe payout ID (po_xxx) for reconciliation with Stripe dashboard';
COMMENT ON COLUMN public.payout_logs.requested_by IS 'User ID of the admin/owner who initiated the payout request';
COMMENT ON COLUMN public.payout_logs.status IS 'Current payout status from Stripe (pending, paid, failed, canceled, in_transit)';
COMMENT ON COLUMN public.payout_logs.arrival_date IS 'Expected arrival date of funds in bank account (from Stripe)';
COMMENT ON COLUMN public.payout_logs.created_at IS 'Timestamp when payout was created in Stripe';
COMMENT ON COLUMN public.payout_logs.recorded_at IS 'Timestamp when payout was recorded in our database';
