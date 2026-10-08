-- W7-H1: Org-approval admin surface — audit columns for approve/reject.
--
-- Additive only: keeps `organizations.approved boolean` as the source of truth
-- for "can operate" (event-creation gate, discover filter, profile), and layers
-- a third "rejected" state on top via nullable timestamps so NO existing
-- `approved` read has to change.
--
--   approved = true                          -> Approved
--   approved = false AND rejected_at IS NULL  -> Pending
--   rejected_at IS NOT NULL                   -> Rejected   (approved stays false)
--
-- All columns nullable: no backfill. Existing approved orgs simply have
-- approved_at = NULL (historic approval time unknown). The `_by` FKs use
-- ON DELETE SET NULL so deleting an admin user never blocks/cascades an org.
-- No RLS change: the admin routes use the service role (supabaseAdmin), and the
-- pending/rejected lists must NOT be reachable via member RLS.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS approved_at      timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at      timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Optional: speeds the rejected-list query. Table is tiny today; safe either way.
CREATE INDEX IF NOT EXISTS idx_organizations_rejected_at
  ON public.organizations (rejected_at)
  WHERE rejected_at IS NOT NULL;
