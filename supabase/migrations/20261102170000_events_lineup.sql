-- Flame 2.0 · fase 4.3 Line-up (2026-11-02).
--
-- Artists of an event, shown on the event page (prototype "Lineup") and edited in create / edit
-- event. jsonb array of { name, instagram?, spotify?, soundcloud? } — the API normalizes it with
-- sanitizeLineup (@project-flame/lib) before writing. No photos in this step.
-- Existing events get [] (nothing changes for them or for app versions already in the stores:
-- get_event_with_tiers returns to_jsonb(e), the extra key is ignored by old clients).

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS lineup jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_lineup_is_array;
ALTER TABLE public.events
  ADD CONSTRAINT events_lineup_is_array
  CHECK (jsonb_typeof(lineup) = 'array' AND jsonb_array_length(lineup) <= 20);

COMMENT ON COLUMN public.events.lineup IS
  'Line-up: [{ name, instagram?, spotify?, soundcloud? }] (max 20). Written via /api/events (sanitizeLineup).';
