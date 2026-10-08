-- Decouple "featured carousel" (multiple events) from "spotlight / Reserve Your Spot" (single event)
--
-- Before this migration:
--   * `events.is_featured` had a UNIQUE partial index (`idx_single_featured_event`) that
--     allowed only one featured event at a time. This conflated two distinct UX needs.
--   * `events.featured` existed but was unused at runtime (no app code reads or writes it).
--   * Helper functions `set_featured_event()` / `unfeature_all_events()` operated on
--     `is_featured` and were never called from app code (greppable verification).
--
-- After this migration:
--   * `is_featured` (boolean, NOT NULL) drives the "Featured Events" carousel and may be
--     true for multiple events (cap of 10 enforced in app code, sorted by starts_at ASC).
--   * `main_featured` (boolean, NOT NULL) drives the spotlight ("Reserve Your Spot") card
--     and is enforced to at most one event at a time via a unique partial index.
--   * Helper RPCs `set_main_featured_event(uuid)` / `unset_main_featured_events()` provide
--     a safe way to toggle the spotlight (clear all, set one). Not currently called from
--     app code but kept so an admin tool can use them later.
--
-- Data preservation: the formerly-unused `events.featured` column is renamed to
-- `main_featured`. The single event that had `is_featured = true` (ZULU: CIERRE DE TEMPO)
-- also already has `featured = true`, so after rename it remains the spotlight without any
-- additional UPDATE.

-- 1. Drop the unique constraint that limited is_featured to one row.
DROP INDEX IF EXISTS public.idx_single_featured_event;

-- 2. Drop the old non-unique perf index on `featured` (will be recreated under the new name).
DROP INDEX IF EXISTS public.idx_events_featured;

-- 3. Rename the unused column to its new role.
ALTER TABLE public.events RENAME COLUMN featured TO main_featured;

-- 4. Tighten the column: NOT NULL with default false, matching is_featured.
UPDATE public.events SET main_featured = false WHERE main_featured IS NULL;
ALTER TABLE public.events ALTER COLUMN main_featured SET NOT NULL;
ALTER TABLE public.events ALTER COLUMN main_featured SET DEFAULT false;

-- 5. Recreate query-perf partial index on the new column.
CREATE INDEX idx_events_main_featured
  ON public.events USING btree (main_featured)
  WHERE (main_featured = true);

-- 6. Enforce "at most one main_featured event at a time".
CREATE UNIQUE INDEX idx_single_main_featured_event
  ON public.events USING btree (main_featured)
  WHERE (main_featured = true);

-- 7. Replace the old helper functions with versions that operate on main_featured.
DROP FUNCTION IF EXISTS public.set_featured_event(uuid);
DROP FUNCTION IF EXISTS public.unfeature_all_events();

CREATE OR REPLACE FUNCTION public.set_main_featured_event(event_id_param uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE public.events
  SET main_featured = false, updated_at = NOW()
  WHERE main_featured = true;

  UPDATE public.events
  SET main_featured = true, updated_at = NOW()
  WHERE id = event_id_param;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event with id % not found', event_id_param;
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.set_main_featured_event(uuid) IS
  'Atomically set a single event as the spotlight (main_featured=true), clearing any previous spotlight first. Enforced as the only event with main_featured=true via idx_single_main_featured_event.';

CREATE OR REPLACE FUNCTION public.unset_main_featured_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE public.events
  SET main_featured = false, updated_at = NOW()
  WHERE main_featured = true;
END;
$function$;

COMMENT ON FUNCTION public.unset_main_featured_events() IS
  'Clear the spotlight by setting main_featured=false on every event currently flagged.';
