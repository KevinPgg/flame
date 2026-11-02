-- Flame 2.0 · fase 4.2 Seguir organizadores (2026-11-02, orden por riesgo).
--
-- A person follows an organization (button on its profile; list in "You → Following").
-- Who follows whom is private: RLS only exposes one's own rows; writes go through the API
-- (/api/me/following, service role). The public number of followers comes from
-- organization_follower_counts(), which returns counts only (no people). No counter column on
-- organizations on purpose: owners can UPDATE their organization row, so they could edit it.

CREATE TABLE IF NOT EXISTS public.organization_follows (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS organization_follows_org_idx ON public.organization_follows (organization_id);

ALTER TABLE public.organization_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view who they follow" ON public.organization_follows;
CREATE POLICY "Users can view who they follow"
ON public.organization_follows
FOR SELECT
USING (user_id IN (SELECT u.id FROM public.users u WHERE u.clerk_id = (auth.jwt() ->> 'sub')));

-- Followers per organization (counts only). Organizations without followers are not returned.
CREATE OR REPLACE FUNCTION public.organization_follower_counts(p_org_ids uuid[])
RETURNS TABLE (organization_id uuid, followers bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.organization_id, count(*)::bigint
  FROM public.organization_follows f
  WHERE f.organization_id = ANY (p_org_ids)
  GROUP BY f.organization_id;
$$;

REVOKE ALL ON FUNCTION public.organization_follower_counts(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.organization_follower_counts(uuid[]) TO anon, authenticated, service_role;

COMMENT ON TABLE public.organization_follows IS
  'Organizations a person follows — Flame 2.0 "You → Following". Managed via /api/me/following; counts via organization_follower_counts().';
