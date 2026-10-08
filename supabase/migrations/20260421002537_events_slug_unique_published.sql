-- Ensure no two published events share a slug.
-- Slugs are already unique per-organization via events_organization_id_slug_key,
-- but the public URL /events/{slug} does not scope by org, so a second org
-- publishing the same slug would make the public page 404 (.single() fails on
-- multiple matches). Partial unique index on status='published' prevents this
-- at the DB level while still allowing drafts across orgs to share slugs.
CREATE UNIQUE INDEX IF NOT EXISTS events_slug_unique_published
  ON public.events (slug)
  WHERE status = 'published';

COMMENT ON INDEX public.events_slug_unique_published IS
  'Guarantees the public /events/{slug} URL resolves to exactly one published event. Draft events can freely share slugs (UNIQUE (organization_id, slug) still applies).';
