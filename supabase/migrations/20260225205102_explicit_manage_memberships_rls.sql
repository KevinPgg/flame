-- Replace the implicit FOR ALL "Organization owners can manage memberships" policy
-- with explicit per-operation policies that include a WITH CHECK clause on
-- INSERT and UPDATE. Functionally equivalent — PostgreSQL already uses the
-- USING expression as the implicit WITH CHECK when none is specified — but
-- explicit policies make the intent auditable and prevent future confusion.

DROP POLICY IF EXISTS "Organization owners can manage memberships" ON public.organization_members;
DROP POLICY IF EXISTS "Organization owners can select memberships" ON public.organization_members;
DROP POLICY IF EXISTS "Organization owners can insert memberships" ON public.organization_members;
DROP POLICY IF EXISTS "Organization owners can update memberships" ON public.organization_members;
DROP POLICY IF EXISTS "Organization owners can delete memberships" ON public.organization_members;

CREATE POLICY "Organization owners can select memberships"
ON public.organization_members
FOR SELECT
USING (organization_id IN (SELECT get_owned_organizations()));

CREATE POLICY "Organization owners can insert memberships"
ON public.organization_members
FOR INSERT
WITH CHECK (organization_id IN (SELECT get_owned_organizations()));

CREATE POLICY "Organization owners can update memberships"
ON public.organization_members
FOR UPDATE
USING (organization_id IN (SELECT get_owned_organizations()))
WITH CHECK (organization_id IN (SELECT get_owned_organizations()));

CREATE POLICY "Organization owners can delete memberships"
ON public.organization_members
FOR DELETE
USING (organization_id IN (SELECT get_owned_organizations()));
