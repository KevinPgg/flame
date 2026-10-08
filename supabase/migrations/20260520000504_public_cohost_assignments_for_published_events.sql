-- Public read access to cohost assignments for published events.
--
-- Required so the public organizer profile pages (web /organizer/[slug] and
-- mobile organizer/[slug].tsx) can render events the org co-hosts, not just
-- events it owns. The cohost relationship is already public information
-- (rendered as a "Co-host with X" pill on the public event card), so
-- exposing the assignment row for published events does not leak data.
--
-- Existing "Org members can view event assignments" policy stays in place
-- and covers all OTHER assignment rows (user-level + draft/cancelled events).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'event_assignments'
      AND policyname = 'Anyone can view cohost links for published events'
  ) THEN
    CREATE POLICY "Anyone can view cohost links for published events"
    ON public.event_assignments
    FOR SELECT
    TO public
    USING (
      cohost_organization_id IS NOT NULL
      AND event_id IN (
        SELECT id FROM public.events WHERE status = 'published'
      )
    );
  END IF;
END $$;
