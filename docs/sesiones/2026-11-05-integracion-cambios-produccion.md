# Sesión 2026-11-05 — Integración de los cambios de producción (`Flame_cambios/`)

Origen: `Flame_cambios/project-flame-main/` (producción nueva) comparado contra `Flme_comp/` (baseline anterior) y la copia de trabajo (Flame 2.0). **Análisis y merge de prueba solamente; todavía no se aplicó nada en la copia de trabajo.**

## 1. Qué trae producción (43 diferencias)
- **5 migraciones** (todas tocan "sold out manual"):
  - `20260827211353_rsvp_respect_manual_sold_out` — guard en las 3 sobrecargas de `create_rsvp_atomic` (ERRCODE 23514 + HINT SOLD_OUT).
  - `20260827213547_ticket_tier_sold_out_changed_at` + `20260827215115_..._reseed` — columna nueva `ticket_tiers.sold_out_changed_at` (+ índice parcial).
  - `20260827223725_rsvp_atomic_unescape_error_messages` — quita los `\"` de los mensajes y formatea el precio con `to_char` en las 3 sobrecargas.
  - `20261017014559_hold_respect_manual_sold_out` — guard en `atomic_create_hold_with_stage_validation`.
- Código (changelogs en `docs/fixes/AUGUST|SEPTEMBER|OCTOBER_2026_FIXES.md`):
  - W7-H5: `maxDuration = 60` en `/api/rsvp` y approve; un 23505 (duplicado) ya **no cancela** el PaymentIntent; correos con `after()`; mobile `LONG_MUTATION_TIMEOUT_MS = 75_000`.
  - W7-H6: la aprobación valida contra el precio cotizado (`metadata.basePriceCents`) y ya no cancela la autorización si no coincide; validador nuevo `packages/lib/src/validators/stripe-metadata.ts` (`parseMetadataCents`, `isPresentMetadataValue`).
  - Octubre: `orders.currency` se guarda (antes quedaba USD por defecto); opción "My country isn't listed" en Stripe Connect (`CONNECT_COUNTRY_NOT_LISTED`, `toConnectOnboardCountry`); el precio del tier se guarda al escribir (no solo al salir del campo); hold rechaza tiers en sold out manual.

## 2. Conflicto principal: nuestra migración `20261008180000_enforce_manual_sold_out`
Producción resolvió lo mismo, y **mejor**:
- Nuestro RSVP de 9 argumentos no lleva ERRCODE/HINT en el sold out manual y conserva el precio sin formatear (`$30.0000000000000000`).
- Por orden de timestamp (0827 → **1008** → 1017), en un `db reset` nuestra 1008 **pisa** la versión corregida de producción → regresión de mensajes.
- Nuestra 1008 borra las sobrecargas de 5 y 7 argumentos que producción mantiene y actualiza.
- Lo que solo tenemos nosotros y sí vale la pena conservar: `REVOKE EXECUTE` del hold RPC a anon/authenticated (es SECURITY DEFINER y recibe `p_user_id`) y el `DROP` de las sobrecargas sin uso (provocan PGRST203). El código de producción llama a ambas RPC solo con `supabaseAdmin` (verificado).

**Propuesta:** reemplazar la 1008 por una migración nueva posterior a `20261017014559` (p. ej. `20261105120000_hold_rpc_service_role_and_drop_rsvp_overloads.sql`) que solo haga REVOKE/GRANT + DROP de las sobrecargas 5/7; quitar los cuerpos de función de la 1008 (o borrar el archivo).
- BD local: si la 1008 ya está aplicada → `supabase migration repair --status reverted 20261008180000` y luego `supabase migration up --include-all` (las 0827 quedan "en el pasado"), o `supabase db reset` si no importa perder datos locales.
- Producción: la migración nueva corre después de todo lo suyo, sin reescribir funciones.

## 3. Código: merge de 3 vías (Flme_comp → producción sobre nuestra copia)
- **11 archivos sin cambios locales** → se copian directo de producción (EditableTierCard, TicketTiersTab, ConnectCountrySelector, PayoutsSettingsTab, useRequireAuth, useRsvpManagement, create-payment-intent, StripeConnectStatus, tests de lib, `stripe/index.ts`, `utils/internal.ts`, `validators/index.ts`) + archivos nuevos (`stripe-metadata.ts`, `apps/web/__tests__/api/holds/`).
- **8 se fusionan limpio**: create-event.tsx, events/route, holds/create, approve, ticket-tiers/route, lib/orders.ts, lib `index.ts`, connect-countries.ts.
- **4 con conflicto (todos triviales):**
  - `mobile/hooks/useCheckout.ts` — import: unir `apiGetPublic` (nuestro) + `LONG_MUTATION_TIMEOUT_MS` (prod).
  - `mobile/lib/api.ts` — ambos añadimos `timeoutMs` con el mismo nombre; quedarse con una sola versión.
  - `web/api/rsvp/route.ts` — import: unir `validateRsvpGuests, RSVP_GUESTS_KEY` + `parseMetadataCents, isPresentMetadataValue`, y conservar `maxDuration`.
  - `web/api/webhooks/stripe/route.ts` — producción cambió `createOrderAndTicketsFromRsvp`, que nosotros movimos a `app/lib/stripe/rsvp-order.ts`: borrar el bloque del webhook y **añadir a mano** `currency: paymentIntent.currency.toUpperCase()` en la orden fantasma de `rsvp-order.ts` (~línea 218).

## 4. Arreglos de producción que NO llegan solos a v2
- `mobile/components/v2/rsvps/RsvpEventDetail.tsx`: `DECIDE_TIMEOUT_MS = 60_000` es igual al `maxDuration` del servidor → debe ser `LONG_MUTATION_TIMEOUT_MS` (75 s), si no vuelve el "falla en el cliente pero se aprobó".
- "My country isn't listed" falta en `mobile/components/v2/manage/PayoutsScreen.tsx` y `web/app/v2/organizer/payouts/PayoutsView.tsx` (usar `CONNECT_COUNTRY_NOT_LISTED` + `toConnectOnboardCountry`).
- Por verificar: que los editores de precio de tier v2 guarden al escribir (bug "Create con el campo enfocado guarda 0").
- OK sin cambios: v2 marca sold out vía `PATCH /api/ticket-tiers`, así que `sold_out_changed_at` se sella tras el merge; v2 checkout usa `useCheckout` (recibe el timeout largo).

## 5. Orden propuesto
1. Migraciones (punto 2) y aplicar en local.
2. Copiar los 11 + nuevos; fusionar los 8; resolver los 4 conflictos.
3. Ajustes v2 (punto 4).
4. `pnpm -w test` (lib, web, mobile jest-expo) + `tsc --noEmit`.
5. Pruebas reales: sold out manual (hold y RSVP), aprobar RSVP desde la app, orden en MXN/EUR con `currency` correcta, conectar Stripe con "no listado".
6. Actualizar `Flme_comp/` al nuevo baseline (copiar `Flame_cambios/project-flame-main/`) una vez integrado.
