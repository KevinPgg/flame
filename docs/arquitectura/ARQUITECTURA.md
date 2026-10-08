# Flame — Arquitectura (baseline de producción)

> **Fuente de verdad: `Flme_comp/`** — copia intacta del código que corre en producción.
> Todo lo que está fuera de `Flme_comp/` es la copia de trabajo adaptada al entorno local de
> pruebas (ver `docs/EstadoActual/ESTADO_ACTUAL.md` §Divergencias). Este documento describe
> **producción**, es decir, el contenido de `Flme_comp/`.
> Consolida los antiguos `ESTRUCTURA.md`, `ENLACE_SERVICIOS.md` y `WORKFLOW.md` (2026-07-06).
> Actualizado: 2026-07-15.

## 1. Qué es

Flame es una plataforma de **venta y gestión de tickets para eventos** (Ecuador, con soporte
multi-país vía Stripe). Dos front-ends sobre un mismo backend:

- **Web** (`apps/web`) — Next.js 15 (App Router), producción en `https://www.flme.co` (Vercel).
- **Mobile** (`apps/mobile`) — Expo / React Native (SDK 54). En producción **solo iOS**
  (TestFlight/App Store); Android existe como capacidad latente sin pipeline de build/submit.

Regla de oro: un solo catálogo, un solo login, una sola base de datos.

## 2. Monorepo (Turborepo 2.8 + pnpm 9, Node ≥20)

```
├── apps/
│   ├── web/          # Next.js 15 — sitio + API + webhooks
│   └── mobile/       # Expo RN — iOS (Android latente)
├── packages/
│   ├── lib/          # Lógica de negocio compartida (FUENTE DE VERDAD)
│   ├── ui/           # UI compartida (NativeWind) — aún marginal
│   └── config/       # TSConfig / ESLint
├── supabase/migrations/   # 66 migraciones SQL (esquema + RLS + RPCs)
├── docs/
└── turbo.json        # pipeline + globalEnv (secretos)
```

**`packages/lib` es el núcleo** (fan-in altísimo, casi sin dependencias salientes):
`pricing` (calculateFinalPrice, extractBasePrice, IVA Ecuador, markup Flame — nadie recalcula
comisiones a mano), `types` (+ EventSchema Zod), `validators`, `constants`, `stripe` (fees,
connect-countries con `DEFAULT_CONNECT_COUNTRY = "EC"`), `supabase`, `utils`.

**`apps/web`**: App Router con 82 rutas API agrupadas por dominio — compra
(`holds/*`, `purchase/*`), webhooks (`webhooks/stripe`, `webhooks/clerk`), Stripe Connect
(`stripe/connect/*`), organizador (`organizer/*`), RSVP, QR (`qr-scanner/*`), auth/usuario,
mobile (`mobile/app-config`, `push-tokens/*`), cron, admin, uploads, `datafast/*` (legacy).
`middleware.ts` (Clerk) protege `/organizer`, `/scanner`, `/api/organizer`, etc. y maneja
maintenance mode (`MAINTENANCE_MODE=true` + cookie `user_testing_access`).

**`apps/mobile`**: Expo Router (file-based), NativeWind, TanStack Query, Zustand.
Cliente Supabase propio (lectura directa con RLS) + `lib/api.ts` hacia la API web con
`Authorization: Bearer <JWT Clerk>` para todo lo que requiere secretos de servidor
(Stripe, email, push). "Logic Porting Protocol": la lógica de negocio se extrae a
`packages/lib`, nunca se duplica.

## 3. Servicios externos

```
                    ┌───────────────────────────┐
    Navegador ─────▶│   apps/web (Vercel)        │◀───── App Expo (mobile)
    (anon RLS)      │   www.flme.co              │       Bearer JWT (Clerk)
                    └────────────┬──────────────┘
                                 │ (secretos de servidor)
     Clerk    Supabase    Stripe Connect    Brevo    Sentry    Expo Push    Datafast(†)
```

| Servicio | Rol | Claves críticas | Notas |
| --- | --- | --- | --- |
| **Vercel** | hosting web + 3 crons | env vars Vercel | Sirve AASA para Universal Links iOS |
| **Clerk** | auth web+mobile | `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET` | Ver §4 (auth) |
| **Supabase** | PostgreSQL 17 + RLS + Storage | `SUPABASE_SERVICE_ROLE_KEY` (solo server web) | Proyecto único `jaoqfvugxmtomdufhswa.supabase.co`; RPCs `get_event_with_tiers`, `create_rsvp_atomic` |
| **Stripe Connect** | pagos fee-on-top ("Guaranteed Net") | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Cada org tiene cuenta Connect; webhook → `www.flme.co/api/webhooks/stripe` |
| **Brevo** | email transaccional | `BREVO_API_KEY` | Plantillas React Email; `noreply@flme.co` |
| **Sentry** | monitoreo web | `SENTRY_AUTH_TOKEN` | org `flame-oh`, con scrubbing/redaction |
| **Expo/EAS** | builds iOS + OTA + push | `EXPO_ACCESS_TOKEN` | Push vía `expo-server-sdk` desde la web; version gating `/api/mobile/app-config` |
| **Datafast** † | pasarela legacy DEPRECADA | `DATAFAST_*` | No usar; ver `docs/legacy/PAYMENT_SYSTEMS_EVOLUTION.md` |

> ⚠️ **Gotcha `www`:** toda URL externa debe ser `https://www.flme.co` (con `www`). El 307 de
> `flme.co` → `www.flme.co` hace que `fetch()` descarte `Authorization` → 401 en mobile.
> Aplica a `eas.json`, Clerk, webhooks Stripe y callbacks.

## 4. Autenticación (Clerk ↔ Supabase) — así funciona en PRODUCCIÓN

1. **Sign-in/up** con Clerk (email+password o Google OAuth). Web: `ClerkProvider` +
   `middleware.ts`. Mobile: `@clerk/expo`, token cache en `expo-secure-store`, `useSSO`.
2. **Sync a la tabla `users`** por tres caminos: webhook `→ /api/webhooks/clerk` (svix),
   JIT `resolveDbUserFromClerkId` en la primera llamada autenticada, y
   `/api/auth/sync-current-user` como disparador manual.
3. **Acceso directo de mobile a Supabase (RLS):** `apps/mobile/lib/supabase-auth.ts` y
   `hooks/useUserRole.ts` piden a Clerk un JWT con
   **`getToken({ template: "supabase" })`** — un **JWT Template llamado exactamente
   `supabase`** configurado en el Clerk Dashboard, **firmado (HS256) con el JWT Secret del
   proyecto Supabase** y con claim `role: "authenticated"`. Las políticas RLS verifican
   `auth.jwt() ->> 'sub'` contra `users.clerk_id`.
   **Sin ese template en la instancia de Clerk, todo el acceso autenticado de mobile a
   Supabase falla** (`No JWT template exists with name: supabase`). Cada entorno
   (producción / dev) necesita su propio template firmado con el secret de SU Supabase.
   Producción NO usa third-party auth de Supabase; usa este mecanismo de template.
4. La API web usa el token de sesión normal de Clerk (Bearer) y valida server-side;
   `supabaseAdmin` (`service_role`) salta RLS solo en el servidor web.

## 5. Flujos principales

### 5.1 Compra pagada (camino crítico): hold → PaymentIntent → webhook → orden

```
POST /api/holds/create                    reserva inventario 30 min (RPC atómico, promoter_code snapshot)
POST /api/purchase/create-payment-intent  el SERVIDOR calcula el monto (packages/lib/pricing);
                                          destination charge a la cuenta Connect de la org
Stripe PaymentElement / PaymentSheet      (mobile: + Apple Pay)
webhook payment_intent.succeeded          → createOrder(): orden + tickets + QR + consume hold
Brevo (email) + Expo push + revalidatePath
```

- **El webhook crea el ticket, no el cliente** — un fallo de red no deja al comprador cobrado sin ticket.
- El hold expira a los 30 min (limpieza lazy `cleanup_expired_holds`); cancelar → `POST /api/holds/cancel`.
- Guard de readiness: verifica `capabilities.transfers === "active"` en la cuenta Connect antes del PI (modelo recipient LATAM).
- Idempotencia: fallback por `stripe_payment_intent_id`; PI huérfano → excepción para que Stripe reintente.
- Gratis / promo 100%: `complete-hold-free` / `complete-direct-free` saltan Stripe.

### 5.2 RSVP (aprobación del organizador, manual capture)

`POST /api/rsvp` (RPC `create_rsvp_atomic`, único pending por usuario/evento; access code y
preguntas custom opcionales) → autorización de tarjeta (`capture_method: "manual"`) → el
organizador aprueba (`/api/organizer/rsvps/:id/approve`) → captura → mismo webhook crea la
orden. La autorización de tarjeta expira sola (~5-7 días); el cron
`monitor-payment-authorizations` notifica 48 h antes y auto-cancela 12 h antes.
El pago de RSVP vigente es el modal inline `RsvpPaymentModal.tsx`
(`StripePurchaseFlow.tsx` post-aprobación por email está deprecado). **Toda ruta de pago debe
pasar el `stage_id` vigente** (precios por etapa Early Bird → Regular → Last Chance).

### 5.3 Check-in QR

QR firmado (`validateQRCodeFormat` en `packages/lib`) → `/api/qr-scanner/verify` →
`/api/qr-scanner/checkin` (atómico, anti doble check-in). Web `@zxing`, mobile cámara nativa.

### 5.4 Onboarding de cobros (Stripe Connect)

`/api/stripe/connect/onboard` → link de onboarding → webhook `account.updated` actualiza
`stripe_charges_enabled`/`stripe_payouts_enabled` → payouts vía `/api/organizer/payouts`.

### 5.5 Crons (Vercel, `vercel.json`)

| Cron | Horario | Qué hace |
| --- | --- | --- |
| `monitor-payment-authorizations` | cada 6 h | PIs autorizados huérfanos; notifica/auto-cancela |
| `cleanup-past-event-rsvps` | diario 02:00 | limpia RSVPs de eventos pasados |
| `event-reminders` | cada 6 h | recordatorios de eventos próximos |

### 5.6 Eventos Stripe manejados por el webhook

`payment_intent.succeeded` (principal: orden+tickets), `payment_failed`, `canceled`,
`amount_capturable_updated` (RSVP pagado), `account.updated` (flags Connect),
`checkout.session.completed` (legacy, solo warning).

## 6. Deploy

- **Web:** Vercel, dominio canónico `www.flme.co`, secretos como env vars, Turbo remote cache.
- **iOS:** `pnpm build:ios:prod` (EAS, perfil `production`, autoIncrement) →
  `pnpm submit:ios` (App Store Connect automatizado). Perfil `testflight` para beta.
  OTA updates vía `expo-updates` (`runtimeVersion.policy: appVersion`).
- **Android:** sin pipeline en producción (sin script build/submit, `eas.json` submit solo iOS).

## 7. Stack resumido

Next.js 15 / React 19 / Tailwind 4 (web) · Expo SDK 54 / RN 0.81 / NativeWind 4 + Tailwind 3.4
(mobile) · TypeScript · Supabase PostgreSQL 17 + RLS · Clerk · Stripe Connect · TanStack Query 5
· Zustand (mobile) · Brevo · Sentry · Vercel · EAS.
Inconsistencias conocidas: Zod 4 (web) vs 3 (mobile); `@types/react` 18.3 fijado con React 19.
