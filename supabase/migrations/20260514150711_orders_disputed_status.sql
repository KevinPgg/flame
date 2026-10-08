-- Adds Stripe dispute (chargeback) tracking to `orders`.
--
-- This file backfills a remote-only migration that was applied via the
-- Supabase MCP/dashboard on May 14, 2026 without a corresponding committed
-- file. The SQL below mirrors the exact statements stored in
-- `supabase_migrations.schema_migrations` for version `20260514150711` so a
-- fresh database (preview branch, local supabase start, etc.) ends up in the
-- same state as production.
--
-- Every statement is idempotent (`IF EXISTS` / `IF NOT EXISTS`), so re-running
-- this migration against a database that already has the changes is a no-op.
--
-- Operationally: surfaces dispute lifecycle so support + Stripe webhook
-- handlers can update an order when Stripe fires `charge.dispute.created`,
-- `charge.dispute.updated`, `charge.dispute.closed`, etc.

-- 1. Widen `status` to varchar(30) and rebuild the CHECK to allow `disputed`.
ALTER TABLE public.orders ALTER COLUMN status TYPE varchar(30);

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (
  status::text = ANY (ARRAY[
    'pending'::text,
    'paid'::text,
    'failed'::text,
    'canceled'::text,
    'refunded'::text,
    'completed'::text,
    'requires_manual_review'::text,
    'disputed'::text
  ])
);

-- 2. Extend the `orders_payment_status` enum so any code reading the type
--    via that path also sees the new value.
ALTER TYPE public.orders_payment_status ADD VALUE IF NOT EXISTS 'disputed';

-- 3. Dispute-tracking columns. All nullable; populated only for orders that
--    actually have a Stripe dispute attached.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stripe_dispute_id text,
  ADD COLUMN IF NOT EXISTS disputed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_reason text,
  ADD COLUMN IF NOT EXISTS dispute_status text,
  ADD COLUMN IF NOT EXISTS dispute_amount_cents integer,
  ADD COLUMN IF NOT EXISTS dispute_evidence_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_outcome text;

-- 4. Indexes for the two columns we filter / look up by from webhook handlers
--    and ops queries. Both partial so the index stays tiny — the vast majority
--    of orders are not disputed.
CREATE INDEX IF NOT EXISTS orders_stripe_dispute_id_idx
  ON public.orders (stripe_dispute_id)
  WHERE stripe_dispute_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_disputed_status_idx
  ON public.orders (status)
  WHERE status = 'disputed';
