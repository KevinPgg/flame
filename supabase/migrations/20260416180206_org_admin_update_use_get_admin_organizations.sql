-- Replace inline organization_members join with get_admin_organizations() so the
-- UPDATE policy matches other org RLS (SECURITY DEFINER, no recursion risk).
-- Safe to re-run: idempotent DROP + CREATE.

DROP POLICY IF EXISTS "Organization admins can update their organization" ON public.organizations;

CREATE POLICY "Organization admins can update their organization"
ON public.organizations
FOR UPDATE
USING (id IN (SELECT get_admin_organizations()));
