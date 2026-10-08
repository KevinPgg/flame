-- Organization admins (not just owners) should be able to update their org's
-- profile fields (instagram_handle, description, city, etc.).
-- The existing "Organization owners can update their organization" policy only
-- matches owner_user_id, so admins who open OrganizationSettingsTab and press
-- Save hit a silent RLS rejection (no error, no row returned).

CREATE POLICY "Organization admins can update their organization"
ON public.organizations
FOR UPDATE
USING (
  id IN (
    SELECT om.organization_id
    FROM public.organization_members om
    JOIN public.users u ON u.id = om.user_id
    WHERE (u.clerk_id::text = auth.jwt() ->> 'sub')
      AND om.role IN ('owner', 'admin')
  )
);
