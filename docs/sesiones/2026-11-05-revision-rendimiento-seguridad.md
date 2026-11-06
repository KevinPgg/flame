# Sesión 2026-11-05 — Revisión de rendimiento, código sin uso y seguridad

Revisión estática (sin ejecutar nada contra BD) de `apps/web/app/api` (103 rutas), `supabase/migrations` (83) y hooks de `apps/mobile`. Rama: `integracion/prod-2026-11`. **Todo lo marcado "también en producción" está igual en `Flme_comp/`.** No se ha cambiado código: falta la aprobación de Kevin.

## A. Seguridad — CRÍTICO (también en producción)

La clave `anon` de Supabase va dentro de la app y de la web, así que cualquiera puede llamar a PostgREST (`/rest/v1/...`) directamente, sin pasar por la API de Next.

| # | Hallazgo | Impacto | Dónde |
|---|---|---|---|
| S1 | `cleanup_all_ticket_data()` es SECURITY DEFINER y tiene `GRANT ALL ... TO anon/authenticated`. El `REVOKE ... FROM PUBLIC` no quita el grant explícito a `anon`. | **Cualquiera sin cuenta borra TODOS los tickets, checkins, orders, order_items, rsvps, holds, purchase_tokens y transacciones Datafast** con un `POST /rest/v1/rpc/cleanup_all_ticket_data`. | baseline L5424-5427 |
| S2 | `users`: la política "Users can update their own profile" no limita columnas ni tiene WITH CHECK, y `authenticated` tiene `GRANT ALL`. | Un usuario con su JWT de Clerk se pone `role = 'admin'` → admin de plataforma (escanea/hace check-in de **cualquier** evento, ve `event_scanners`/`order_errors`). Si también cambia `users.email` a un correo de `SUPPORT_ADMIN_EMAILS`, `requireSupportAdmin` lo acepta (lee el email de la tabla) → aprueba/rechaza organizaciones. | baseline L5036, 5633; `api/admin/_lib.ts` L38-52 |
| S3 | `set_featured_event`, `unfeature_all_events` (grant a anon) y `set_main_featured_event`, `unset_main_featured_events` (sin revoke → PUBLIC), todas SECURITY DEFINER sin comprobar quién llama. | Cualquiera cambia o quita el evento destacado/spotlight de Inicio. | baseline; `20260429233527` |
| S4 | `contact_submissions`: política "Service role can manage…" `USING (true)` **sin `TO`** → aplica a todos los roles, FOR ALL. | Anónimos leen, editan y borran todos los mensajes de contacto (nombres, correos, mensajes). service_role no necesita política. | baseline L5004 |
| S5 | `get_allowed_user_details(email)` / `check_email_allowed(email)` ejecutables por anon. | Devuelve `id_number` (cédula), nombre, cargo y departamento de `allowed_users` sabiendo el correo. Parece código heredado (no lo usa la app). | baseline |

## B. Seguridad — ALTO / MEDIO

- **S6 Fuerza bruta de códigos sin límite real.** `qr-scanner/validate-code` es **público** (sin auth ni rate limit); códigos de 4-8 caracteres A-Z0-9 (uno de 4 = 1,7 M combinaciones). `ticket-tiers/unlock`, `ticket-tiers/validate-code` (mínimo 3 caracteres) y `purchase/validate-promo-code` solo piden sesión. Los limitadores en memoria (`contact`, `verify-testing-code`, `places/autocomplete`) no sirven en Vercel (cada instancia tiene su propio Map).
- **S7 `stripe_payment_audit`:** INSERT `WITH CHECK (true)` para todos → cualquiera inserta filas falsas en la auditoría de pagos.
- **S8 `promoter_links`:** SELECT `true` a anon expone todas las columnas (`promoter_code`, `promoter_name`, `created_by`) de todos los eventos; el comentario dice que solo se lee `id`. La app ya valida por `/api/promoter-validate`; se puede quitar la política o limitar columnas.
- **S9 `users` INSERT:** misma falta de control de columnas: una cuenta nueva que llegue antes del webhook puede crear su fila con `role='admin'`.
- **S10 menor:** `verify-testing-code` compara el código con `===` (no constante en tiempo); `try_advisory_lock` ejecutable por anon (puede bloquear locks usados por la app).
- Revisado y correcto: crons con `CRON_SECRET`, webhooks Stripe (`constructEvent`) y Clerk (svix), `orders/[id]`, `holds/details`, `rsvp/details` filtran por dueño, importes de pago calculados en servidor, storage solo lectura pública, vistas de holds ya con `security_invoker` y sin grants, todas las tablas con RLS.

### Arreglo propuesto (migración nueva, pendiente de aprobación)
```sql
-- S1, S3, S5, S10
REVOKE ALL ON FUNCTION public.cleanup_all_ticket_data()            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_featured_event(uuid)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unfeature_all_events()              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_main_featured_event(uuid)       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unset_main_featured_events()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_allowed_user_details(text)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_email_allowed(text)           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.try_advisory_lock(bigint)           FROM PUBLIC, anon, authenticated;
-- S4, S7
DROP POLICY IF EXISTS "Service role can manage contact submissions" ON public.contact_submissions;
DROP POLICY IF EXISTS "System can insert stripe payment audit logs" ON public.stripe_payment_audit;
REVOKE ALL ON public.contact_submissions FROM anon, authenticated;
-- S2, S9: el único UPDATE directo desde cliente es notification_preferences (mobile/hooks/useNotificationPreferences.ts)
REVOKE INSERT, UPDATE ON public.users FROM anon, authenticated;
GRANT UPDATE (notification_preferences, updated_at) ON public.users TO authenticated;
```
Comprobación antes/después (en el SQL editor, no destructiva):
```sql
select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef order by 2 desc, 1;
select has_column_privilege('authenticated','public.users','role','UPDATE');
```
Antes de aplicar: confirmar que ningún panel externo (Supabase Studio con service_role no cuenta) llama a las funciones de "featured" con la clave anon. En el código no hay llamadas.

## C. Funcionalidad rota / código sin uso

- **Crons que nunca corren (también en producción):** Vercel Cron llama con **GET**, y `cron/cleanup-past-event-rsvps` y `cron/monitor-payment-authorizations` solo exportan POST → 405 en cada ejecución. `monitor-payment-authorizations` evita que caduquen autorizaciones de pago de RSVP. Ya estaba anotado como "decisión pendiente: crons solo-POST" (sesión 10-27 fase 3). Arreglo: exportar `GET` que reutilice el handler.
- **Rutas sin ninguna llamada** desde web, app ni packages: `datafast/create-checkout`, `datafast/verify-payment`, `user/update-cedula`, `purchase/validate-token`, `rsvp/purchase-redirect`, `organizer/payouts/balance`, y `dev/email-preview` (bloqueada en producción). Candidatas a borrar tras confirmar que no hay enlaces externos (correos antiguos con `purchase-redirect`/tokens).
- Índice duplicado: `users.clerk_id` tiene la restricción UNIQUE y además `idx_users_clerk_id` (escritura doble, sin beneficio).

## D. Rendimiento / llamadas duplicadas

1. **`GET /api/ticket-tiers/[tierId]/availability` escribe en cada lectura**: llama al RPC `cleanup_expired_holds` (DELETE global de holds) antes de leer, con reintentos. La web v1 (`EventDetail` → `useMultipleTicketAvailability`) lo pide **por cada tier cada 10 s** → N tiers × visitantes × 6/min deletes globales. Solo activo con `ATTENDEE_V1=true` (v2 no lo usa), pero conviene quitar la limpieza de la ruta (ya hay crons/holds con `expires_at`) y que la disponibilidad ignore holds vencidos en la consulta.
2. **App: detalle de evento repite `get_event_with_tiers` (RPC pesado) cada 10 s** (`hooks/useEventDetails.ts` L380) aunque `staleTime` sea 2 min. Además, React Query en RN no tiene `focusManager` con `AppState`: las pantallas del stack que quedan montadas debajo siguen sondeando (también `useRsvpManagement` 15 s, `useOrganizerModel` 15 s, `RsvpEventDetail` 15 s). Propuesta: `focusManager` + `refetchIntervalInBackground: false`, sondear solo la disponibilidad (consulta ligera) y subir a 30 s.
3. **Web: `RsvpManagement` sondea con `refetchIntervalInBackground: true`** (sigue cada 15 s con la pestaña oculta).
4. **Búsqueda de `users` por `clerk_id` en casi todas las rutas** (64 veces): un viaje extra a BD por petición; con una función `getDbUser()` cacheada por petición (React `cache`) se evitan duplicados cuando una ruta llama a varios helpers (p. ej. `scanUserFromClerk` + gates).
5. `getScanAccess` hace hasta 3 consultas en serie por escaneo; se puede resolver en un solo RPC (miembro / co-host / designado) — notable en puerta con mucha cola.

## Prioridad sugerida
1. Migración de seguridad (S1-S5, S7, S9) — afecta producción hoy.
2. Rate limit persistente (Upstash/Vercel KV o tabla) en `qr-scanner/validate-code`, `ticket-tiers/unlock|validate-code`, `validate-promo-code`; exigir sesión en `validate-code`.
3. Crons GET.
4. Rendimiento D1-D3.
5. Limpieza de rutas sin uso.

Confianza: S1, S3, S4, S7 y crons [Seguro] por lectura directa de migraciones/código; S2 [Seguro] para `role`, [Probable] para la vía de `email` (requiere conocer un correo de la lista); estado real de producción [Probable] — verificar con las consultas de arriba porque podría haberse cambiado algo a mano en el panel.

## 2026-11-06 — Plan de correcciones
- Plan por fases en `docs/seguridad-correcciones/PLAN.md`; pruebas en `docs/PruebasReales/SEGURIDAD_CORRECCIONES.md` (§0 = verificación que hace Kevin antes de aplicar nada).
- Hallazgo nuevo al detallar S2: `users.email` es UNIQUE, así que no se puede robar el correo de una cuenta existente, pero sí tomar uno **sin cuenta** → aceptar invitaciones de equipo ajenas, ver tickets promocionales enviados a ese correo, panel de soporte si su correo aún no está registrado, y bloquear el registro del dueño real.
- Índices duplicados: 6 índices + 1 restricción duplicada (no solo `users.clerk_id`).
- Decisiones pendientes: borrar `cleanup_all_ticket_data` y las funciones de `allowed_users`; duración del `scanGrant` (10 o 2 min).

## 2026-11-06 — Cuenta eliminada y vuelta a crear con el mismo correo
- Síntoma (local): la cuenta nueva solo ve Inicio y Explorar; `JIT Sync failed … users_email_key` (23505) en `/api/user/tickets`, `/api/holds/active`, etc.
- Causa: borrar la cuenta solo elimina el usuario en Clerk (`DELETE /api/user/delete`); la fila de `users` la borra o anonimiza **el webhook `user.deleted`**. En local el webhook va por ngrok, cuya URL cambia en cada arranque → el evento no llegó y la fila vieja quedó con el correo. La cuenta nueva tiene otro `clerk_id`, no encuentra fila y el alta JIT choca con el UNIQUE de `email`. En producción pasa lo mismo si el webhook falla todos los reintentos (mismo código en `Flme_comp`).
- El sync JIT (`lib/auth.ts`) trata cualquier 23505 como "carrera" y vuelve a buscar por `clerk_id`, así que nunca se recupera de un choque por `email`. El `user.created` del webhook tiene el mismo problema (upsert por `clerk_id`, choca por `email`).
- Arreglo propuesto (pendiente de decisión de Kevin): (1) limpiar/anonimizar la fila en la propia ruta de borrado, sin depender solo del webhook; (2) en el JIT y en `user.created`, si choca por `email` con una fila cuyo `clerk_id` ya no existe en Clerk (404), anonimizarla y reintentar; (3) usar el correo principal verificado, no `email_addresses[0]`; (4) avisar antes de borrar si tiene tickets de eventos futuros. Decisión: cuenta nueva desde cero (recomendado) o re-vincular el historial.
