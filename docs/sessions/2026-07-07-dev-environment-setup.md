# Sesión 2026-07-07 — Setup entorno de pruebas/dev

## Contexto
Kevin está levantando el entorno local de desarrollo (Supabase local + Next.js en localhost:3000 + Stripe CLI + Clerk test keys).

## Hallazgo crítico (pendiente, sin resolver)
`flame-envs.mdf` en la raíz del repo contiene secretos de **producción en texto plano**: `STRIPE_SECRET_KEY` (sk_live), `CLERK_SECRET_KEY` (sk_live), `SUPABASE_SERVICE_ROLE_KEY` de prod, `SENTRY_AUTH_TOKEN`, `VERCEL_OIDC_TOKEN`, etc. `.gitignore` solo cubre `.env*`, no cubre `*.mdf` — riesgo real de que un `git add .` lo suba al historial. No se verificó si ya está trackeado en git (no había `.git` accesible en esta sesión). **Sigue pendiente: confirmar y remediar (rotar claves si ya se filtró, añadir `*.mdf` a .gitignore, mover a un secret manager).**

## Estado del entorno de dev (`apps/web/.env`)
Ya existe `.env` en `apps/web` con: Supabase local (127.0.0.1:54321), Clerk pk_test/sk_test, Stripe pk_test/sk_test + `STRIPE_WEBHOOK_SECRET` de `stripe listen`.

Pendientes menores (no bloqueantes):
- `QR_SIGNATURE_SECRET` — vacío, usado para firmar QR de tickets. Generar con `openssl rand -hex 32`.
- `CRON_SECRET` — vacío, usado en 3 rutas cron (`cleanup-past-event-rsvps`, `event-reminders`, `monitor-payment-authorizations`). Generar con `openssl rand -hex 32` si se van a probar esos endpoints manualmente.
- `BREVO_API_KEY` — vacío. Sin esto los correos transaccionales no se envían (no rompe la app, pero no hay feedback de emails en dev).
- `GOOGLE_PLACES_API_KEY` — vacío, solo necesario si se prueba autocompletado de direcciones.
- `apps/mobile/.env` — falta copiar desde `.env.example` y completar `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` si se va a correr la app mobile.

## Clerk webhook — resuelto
Se usó ngrok (`ngrok http 3000` + endpoint en Clerk Dashboard apuntando a `https://<subdominio>.ngrok-free.dev/api/webhooks/clerk`) para obtener el `whsec_...` real. Nota para quien retome: el authtoken de ngrok NO es el "ID" corto (`cr_...`) que aparece en la tabla de Authtokens del dashboard — hay que sacarlo completo desde `https://dashboard.ngrok.com/get-started/your-authtoken`. Usuario de prueba ya creado y validado en Clerk test.

## Supabase local — schema
66 migraciones en `supabase/migrations`, sin `seed.sql` propio (el seed real es el dump normalizado, ver abajo). Levantar con `supabase db reset` (aplica migraciones desde cero).

## Seed de datos de producción — normalizado y cargado en el repo
`supabase/seed/backup.sql` (pg_dump completo de prod, ~100MB) se reemplazó por una versión normalizada (mismo path, ~95MB, verificado por checksum contra el archivo generado):

- Se descartó todo el DDL (`CREATE TABLE`, schemas, índices, funciones) — el schema local ya sale de las 66 migraciones vía `supabase db reset`.
- Se descartaron los datos de los schemas internos de Supabase: `auth.*` (users/sessions/identities — irrelevante, la auth la maneja Clerk, no Supabase Auth), `storage.*` (objects apuntan a archivos que no existen en el storage local), `realtime.*`, `vault.*`, `supabase_migrations.*`.
- Se mantuvieron ~54,373 filas de ~30 tablas de `public.*` (events, organizations, orders, tickets, rsvps, etc.).
- PII anonimizada: `users.email/first_name/last_name/phone/document_id/billing_address/document_type/ip_address/date_of_birth/profile_image_url`, y equivalentes en `orders.customer_email/customer_name`, `tickets.attendee_email/attendee_name`, `promotional_tickets`, `datafast_transactions`, `contact_submissions`. Además se hizo un pase global de regex sobre las tablas con JSON libre (`rsvps.registration_data`, `rsvp_pending_requests.registration_data`, `datafast_transactions` payloads, `order_errors`, `notifications`, `holds`, `app_config`) que atrapó ~1092 emails reales sueltos dentro de esos JSON que las reglas por columna no cubrían.
- El archivo incluye `SET session_replication_role = replica;` al inicio y `DEFAULT` al final, así que el `COPY` de datos no falla por orden de FKs.

**Decisión explícita del usuario, pendiente de acción manual:** los `clerk_id` de las filas de `users` NO se tocaron — siguen siendo los IDs de Clerk de producción, que no existen en la instancia Clerk test. No se intentó emparejar automáticamente (pedido explícito: "omitirlos... luego emparejamos esos datos con otros email"). Para "ser" un usuario semilla específico durante pruebas, hay que actualizar manualmente:
```sql
UPDATE public.users SET clerk_id = 'user_xxx' WHERE email = 'seed.userNNNN@test.flme.dev';
```
usando el `User ID` real del usuario de prueba desde Clerk Dashboard → Users.

**Siguiente paso para cargar en local (aún no ejecutado):**
```
supabase db reset
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/seed/backup.sql
```

## Notas técnicas de la sesión
El sandbox de shell tuvo fallas intermitentes de timeout/resume en comandos largos contra archivos grandes (>90MB) en la carpeta del proyecto (posible sync lento hacia el host Windows). Los procesos siguieron corriendo server-side pese al error de timeout del lado del tool; hubo que reintentar/poll hasta que el tamaño de archivo convergiera. Si se retoma trabajo con `backup.sql` u otros archivos grandes, tener esto en cuenta y verificar con `md5sum`/`ls -la` antes de asumir que una operación falló.

## Cambios de código de esta sesión (antes en sessions/cambios/, consolidado aquí)

1. **`apps/web/next.config.ts`** — `images.remotePatterns` para `http://127.0.0.1:54321` y `http://localhost:54321` (path `/storage/v1/object/**`), solo si `NODE_ENV !== "production"`. Motivo: `next/image` bloqueaba imágenes del storage local. Requiere reiniciar Next.
2. **`apps/web/app/components/StripePaymentForm.tsx`** — el catch de `confirmPayment()` loguea `type/code/message/decline_code/param` explícitos (el overlay de Next serializa el error cross-origin de Stripe como `{}`).
3. **`supabase/seed/backup.sql`** — dump de prod reemplazado por versión solo-datos anonimizada (detalle arriba).
4. **SQL manual en Studio (no versionado):** `UPDATE organizations SET stripe_account_id = NULL, stripe_charges_enabled = false, stripe_payouts_enabled = false;` (las cuentas Connect del seed son de prod, inválidas con sk_test) + remapeo de un organizador semilla al clerk_id de prueba.
5. **Dashboard Stripe test:** Connect activado; EC habilitado en Express, pero EC + Accounts v2 falla con agreement `recipient` → workaround: orgs de prueba con país US.
