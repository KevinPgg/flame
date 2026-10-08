-- Fix 7 RLS security lints flagged by Supabase linter
--
-- Category 1: 3 × SECURITY DEFINER views (monitoring/admin use only)
--   v_active_holds_by_stage, holds_at_risk_of_expiration, holds_with_active_payments
--   Fix: Set security_invoker = true so queries run with the caller's permissions
--        (respecting RLS on the underlying holds/events/ticket_tiers tables).
--        Also revoke unnecessary anon/authenticated grants — these are admin-only views.
--
-- Category 2: 4 × tables with RLS disabled
--   ticket_tiers_price_backup, ticket_stages_price_backup: backup/migration tables,
--     no application PostgREST access needed — enable RLS, deny all.
--   promoter_links: SELECT allowed for anon + authenticated (needed for checkout
--     promoter code validation in mobile useCheckout.ts which uses the anon client).
--     INSERT/UPDATE/DELETE only via service_role (web API uses supabaseAdmin).
--   user_sync_queue, rsvp_pending_requests: internal queue tables managed by
--     webhooks/cron via service_role — enable RLS, deny all direct access.


-- ================================================================
-- Category 1: SECURITY DEFINER views → SECURITY INVOKER
-- ================================================================

ALTER VIEW public.v_active_holds_by_stage SET (security_invoker = true);
ALTER VIEW public.holds_at_risk_of_expiration SET (security_invoker = true);
ALTER VIEW public.holds_with_active_payments SET (security_invoker = true);

-- Revoke broad PostgREST access from anon/authenticated — these are admin-only views.
-- service_role (used by supabaseAdmin and Supabase studio) retains full access.
REVOKE ALL ON public.v_active_holds_by_stage FROM anon, authenticated;
REVOKE ALL ON public.holds_at_risk_of_expiration FROM anon, authenticated;
REVOKE ALL ON public.holds_with_active_payments FROM anon, authenticated;


-- ================================================================
-- Category 2a: Backup tables — enable RLS, deny all direct access
-- ================================================================

ALTER TABLE public.ticket_tiers_price_backup ENABLE ROW LEVEL SECURITY;
-- No policies: service_role bypasses RLS; anon/authenticated are denied.

ALTER TABLE public.ticket_stages_price_backup ENABLE ROW LEVEL SECURITY;
-- No policies: service_role bypasses RLS; anon/authenticated are denied.


-- ================================================================
-- Category 2b: promoter_links — enable RLS + SELECT for all roles
-- ================================================================

ALTER TABLE public.promoter_links ENABLE ROW LEVEL SECURITY;

-- Allow any role to SELECT so that checkout can validate promoter codes.
-- The mobile checkout (useCheckout.ts) uses the anon Supabase client to check
-- whether a promoter_code exists for a given event_id before creating an order.
-- The query only reads `id` to confirm existence — no sensitive data exposed.
-- INSERT/UPDATE/DELETE continue to go through supabaseAdmin (service_role).
CREATE POLICY "Anyone can look up promoter codes for validation"
  ON public.promoter_links
  FOR SELECT
  TO anon, authenticated
  USING (true);


-- ================================================================
-- Category 2c: Internal queue tables — enable RLS, deny all direct access
-- ================================================================

ALTER TABLE public.user_sync_queue ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (Clerk webhooks) should access this table.

ALTER TABLE public.rsvp_pending_requests ENABLE ROW LEVEL SECURITY;
-- No policies: all access goes through web API routes using supabaseAdmin.
