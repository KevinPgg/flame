-- Flame 2.0 · lugar del evento con Google Places (2026-11-02, decisión de Kevin).
-- `venue` sigue siendo el nombre que se muestra. Cuando el organizador elige el lugar de la lista
-- de Google se guardan además la dirección y el place_id; el link a Maps lo arma la app
-- (google.com/maps/search/?api=1&query=…&query_place_id=…), sin llamar a la API.
-- Sin RLS nueva: escriben solo las rutas /api/events (service role).

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS venue_address text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS venue_place_id text;

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_venue_address_len;
ALTER TABLE public.events ADD CONSTRAINT events_venue_address_len CHECK (venue_address IS NULL OR char_length(venue_address) <= 300);
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_venue_place_id_len;
ALTER TABLE public.events ADD CONSTRAINT events_venue_place_id_len CHECK (venue_place_id IS NULL OR char_length(venue_place_id) <= 300);
