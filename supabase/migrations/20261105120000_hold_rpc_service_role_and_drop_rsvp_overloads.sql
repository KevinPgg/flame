-- Flame 2.0 · endurecimiento que producción no tiene (antes en 20261008180000, ver allí).
--
-- 1. atomic_create_hold_with_stage_validation es SECURITY DEFINER (salta RLS) y recibe
--    p_user_id por parámetro, pero EXECUTE estaba concedido a PUBLIC/anon/authenticated:
--    con la anon key pública cualquiera podía crear holds a nombre de cualquier usuario
--    (p. ej. reservar todo un evento 30 min una y otra vez). Su único llamador es
--    POST /api/holds/create con supabaseAdmin (service role) → EXECUTE solo para service_role.
--    CREATE OR REPLACE conserva los privilegios, así que redefiniciones futuras no lo revierten.
--
-- 2. create_rsvp_atomic tiene dos sobrecargas antiguas, (5 args) y (7 args), que nadie llama
--    (POST /api/rsvp usa la de 9 args por nombre) y que vuelven ambiguas para PostgREST las
--    llamadas con menos argumentos (PGRST203). 20260827211353/223725 las mantienen; aquí se
--    eliminan. La de 9 args (con el guard de sold out manual de producción) no se toca.
--
-- Corre después de 20261017014559 para no depender del orden con las migraciones de producción.

REVOKE EXECUTE ON FUNCTION public.atomic_create_hold_with_stage_validation(
  uuid, uuid, uuid, integer, uuid, integer, character varying
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_create_hold_with_stage_validation(
  uuid, uuid, uuid, integer, uuid, integer, character varying
) TO service_role;

DROP FUNCTION IF EXISTS public.create_rsvp_atomic(uuid, uuid, uuid, integer, uuid);
DROP FUNCTION IF EXISTS public.create_rsvp_atomic(uuid, uuid, uuid, integer, uuid, character varying, uuid);
