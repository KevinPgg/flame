-- Fase 3 (Kevin 2026-10-29): RSVP registration questions are answered once per request by
-- default; an organizer can set a tier to ask them for every ticket (each guest).
-- Guest 1's answers stay at the top level of rsvps.registration_data and guests 2..N go in
-- registration_data._guests (format chosen 2026-10-28). Existing tiers keep "once per request".
ALTER TABLE public.ticket_tiers
  ADD COLUMN IF NOT EXISTS registration_per_ticket boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ticket_tiers.registration_per_ticket IS
  'RSVP tiers: true = registration questions answered for every ticket (guests 2..N in registration_data._guests); false (default) = once per request.';
