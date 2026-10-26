-- Fase 1b.5 · Búsqueda de personas restringida (decisión de Kevin 2026-10-23).
-- Sugerencias parciales (nombre o email) SOLO entre las personas ya relacionadas con la
-- organización: miembros, compradores, solicitantes de RSVP, escáneres y destinatarios de
-- tickets enviados de sus eventos. Fuera de ese círculo la API solo encuentra por email exacto.
-- Así un organizador no puede listar la base de usuarios de Flame tecleando letras.
-- Solo la usa la API (service_role): sin permisos para anon/authenticated.

CREATE OR REPLACE FUNCTION public.search_org_people(p_org uuid, p_query text, p_limit integer DEFAULT 8)
RETURNS TABLE (id uuid, email text, first_name text, last_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH org_events AS (
    SELECT e.id FROM events e WHERE e.organization_id = p_org
  ),
  circle AS (
    SELECT m.user_id FROM organization_members m WHERE m.organization_id = p_org
    UNION SELECT o.user_id FROM orders o WHERE o.event_id IN (SELECT id FROM org_events)
    UNION SELECT r.user_id FROM rsvps r WHERE r.event_id IN (SELECT id FROM org_events)
    UNION SELECT s.user_id FROM event_scanners s WHERE s.event_id IN (SELECT id FROM org_events)
    UNION SELECT u2.id FROM users u2
      JOIN promotional_tickets pt ON lower(pt.email) = lower(u2.email)
      WHERE pt.event_id IN (SELECT id FROM org_events)
  ),
  pat AS (
    -- Escape LIKE wildcards typed by the person (%, _ and \ are literal here).
    SELECT '%' || replace(replace(replace(lower(btrim(p_query)), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS v
  )
  SELECT u.id, u.email::text, u.first_name::text, u.last_name::text
  FROM users u, pat
  WHERE length(btrim(p_query)) >= 2
    AND u.id IN (SELECT user_id FROM circle)
    AND (
      lower(u.email) LIKE pat.v
      OR lower(btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, ''))) LIKE pat.v
    )
  ORDER BY lower(coalesce(u.first_name, u.email)), u.email
  LIMIT least(greatest(coalesce(p_limit, 8), 1), 20);
$$;

REVOKE ALL ON FUNCTION public.search_org_people(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_org_people(uuid, text, integer) TO service_role;
