-- Flame 2.0 · fase 4.1 Guardar eventos (decisión 2026-11-02, orden por riesgo).
--
-- A person saves (heart) an event to find it later in "You → Saved". Private: only the person
-- sees their own list; organizers don't see who saved their events (no counter in this step).
-- All writes go through the API (/api/me/saved-events, service role), so RLS only exposes SELECT
-- of one's own rows (Clerk JWT `sub` → users.clerk_id), like event_scanners.

CREATE TABLE IF NOT EXISTS public.saved_events (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);

-- Event deletes (cascade) and any later per-event counter.
CREATE INDEX IF NOT EXISTS saved_events_event_idx ON public.saved_events (event_id);

ALTER TABLE public.saved_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own saved events" ON public.saved_events;
CREATE POLICY "Users can view their own saved events"
ON public.saved_events
FOR SELECT
USING (user_id IN (SELECT u.id FROM public.users u WHERE u.clerk_id = (auth.jwt() ->> 'sub')));

COMMENT ON TABLE public.saved_events IS
  'Events a person saved (heart) — Flame 2.0 "You → Saved". Managed via /api/me/saved-events.';
