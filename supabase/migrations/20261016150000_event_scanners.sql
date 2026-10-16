-- Flame 2.0 · Door scanning by person (decision 2026-10-16).
--
-- Who can scan (verify / check in) tickets of an event:
--   * every member of the event's organization (any role), and of its co-host organizations;
--   * platform admins (users.role = 'admin');
--   * people designated for that specific event in this table — any Flame account, member of
--     the organization or not (e.g. door staff hired for one night).
--
-- The per-event access code (events.qr_scanner_code) keeps working server-side for the app
-- versions already in the stores; it can be switched off with SCANNER_ACCESS_CODES=off once the
-- new app is out. All writes go through the API (service role), so only SELECT is exposed by RLS.

CREATE TABLE IF NOT EXISTS public.event_scanners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Who designated them; kept as audit if that user is deleted.
  added_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_scanners_unique UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS event_scanners_user_idx ON public.event_scanners (user_id);

ALTER TABLE public.event_scanners ENABLE ROW LEVEL SECURITY;

-- The designated person sees their own rows; members of the event's organization see the event's list.
DROP POLICY IF EXISTS "Scanners and org members can view event scanners" ON public.event_scanners;
CREATE POLICY "Scanners and org members can view event scanners"
ON public.event_scanners
FOR SELECT
USING (
  user_id IN (SELECT u.id FROM public.users u WHERE u.clerk_id = (auth.jwt() ->> 'sub'))
  OR event_id IN (
    SELECT e.id FROM public.events e WHERE e.organization_id IN (SELECT get_user_organizations())
  )
);

COMMENT ON TABLE public.event_scanners IS
  'People designated to scan tickets of one event (besides members of the organizer and co-host orgs). Managed via /api/organizer/events/[id]/scanners.';
