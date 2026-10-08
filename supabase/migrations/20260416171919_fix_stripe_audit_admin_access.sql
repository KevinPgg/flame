-- Baseline policy used organizations.owner_user_id = auth.uid(), which (1) excludes org admins
-- and (2) breaks with Clerk JWTs (auth.uid() is not the Supabase user id).
-- Org access: get_admin_organizations() (owner + admin, Clerk via SECURITY DEFINER).
-- Purchaser rows: match stripe_payment_audit.user_id to users.id via auth.jwt() ->> 'sub'.

DROP POLICY IF EXISTS "Admins can read all stripe payment audit logs" ON public.stripe_payment_audit;

CREATE POLICY "Admins can read all stripe payment audit logs"
ON public.stripe_payment_audit
FOR SELECT
USING (
  organization_id IN (SELECT get_admin_organizations())
  OR user_id IN (
    SELECT u.id
    FROM public.users u
    WHERE u.clerk_id::text = (auth.jwt() ->> 'sub')
  )
);
