# Sesión 2026-11-05 — Integración de los cambios de producción (`Flame_cambios/`)

Origen: `Flame_cambios/project-flame-main/` (producción nueva) comparado contra `Flme_comp/` (baseline anterior) y la copia de trabajo (Flame 2.0). **Aplicada el 2026-11-05 en la rama `integracion/prod-2026-11`** (ver §6).

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

## 6. Aplicado (2026-11-05, rama `integracion/prod-2026-11`)
- Antes: limpieza de `docs/notas.txt` del historial (`filter-branch` + borrado de `refs/original`, reflog y `gc`); push al repo personal de Kevin. El código pasará al repo de producción copiando el proyecto encima, sin traer los commits.
- **Migraciones:** copiadas las 5 de producción; `20261008180000` queda como no-op (`SELECT 1` con comentario) para no descuadrar BD locales que ya la aplicaron; nueva `20261105120000_hold_rpc_service_role_and_drop_rsvp_overloads.sql` (REVOKE/GRANT del hold RPC + DROP de las sobrecargas 5/7).
- **Código:** 13 archivos copiados de producción (local = baseline), nuevos `validators/stripe-metadata.ts` y `apps/web/__tests__/api/holds/create.test.ts`; 8 fusionados limpio; 4 conflictos resueltos (imports unidos en `useCheckout.ts` y `rsvp/route.ts` con `maxDuration`; `api.ts` versión de producción; webhook sin la función duplicada) + `currency` en la orden fantasma de `app/lib/stripe/rsvp-order.ts`.
- **v2:** `RsvpEventDetail.tsx` aprueba con `LONG_MUTATION_TIMEOUT_MS` (75 s); "Mi país no está en la lista" en Pagos v2 web (`PayoutsView.tsx`) y app (`PayoutsScreen.tsx`) con `toConnectOnboardCountry`; i18n `payouts.countryNotListed` (en/es). Los editores de precio v2 ya guardan al escribir (sin cambio).
- **Docs/config:** `AUGUST|SEPTEMBER|OCTOBER_2026_FIXES.md` y `JULY` actualizado en `historico/fixes/`; `EDGE_CASES_TODOS` y `NITPICKS_TODOS` fusionados; `guias/TICKET_VALIDATION_REFERENCE.md` y nuevo `guias/VERSIONING_AND_UPDATE_GATING.md`; `.gitignore` con `.claude/rules` y `.mcp.json`. `.cursor/rules/nextjs-typescript.mdc` no se tocó (local difiere; producción solo añadió `paths:`).
- **Verificación:** `tsc` de `packages/lib` limpio en la VM; tests (vitest/jest) no corren en la VM (binarios de Windows) → correr en el PC. Pruebas en `PruebasReales/INTEGRACION_PRODUCCION_2026_11.md`.
- **Observación (no tocada):** `SendTab.tsx` (enviar tickets) espera 60 s, pero `promotional-tickets` y `bank-transfer-tickets` no declaran `maxDuration`; si en Vercel caen al límite por defecto, el problema es el mismo que W7-H5. Revisar antes de producción.
- **Pendiente antes de Vercel:** confirmar a qué Supabase apuntan las variables de Preview; no aplicar nuestras migraciones en la BD de producción para probar.

## 7. Resultado de tests en el PC (2026-11-05 tarde) y arreglos
- `tsc` web: 0 errores. `tsc` mobile: 40 errores **previos** (14 de 15 archivos sin tocar desde el commit inicial; `useRsvpManagement.ts:266` es deuda W6-E1 documentada por producción).
- **Causados por la integración (arreglados):**
  - `apps/web/__tests__/api/holds/create.test.ts` (test nuevo de producción): su mock no cubría la consulta de "pago en curso" de la fase 3 (`holds` … `.is/.gt/.limit`) → 500. Mock ampliado; la ruta no cambia.
  - `apps/mobile/__tests__/v2/Rsvps.test.tsx`: el mock de `lib/api` no exportaba `LONG_MUTATION_TIMEOUT_MS` (→ `undefined`); ahora lo exporta y la expectativa es 75 s.
- **Previos, de nuestro código v2 (arreglados):**
  - `team-invitations.test.ts`: el falso Supabase devuelve filas completas; la ruta `GET /api/organizations/[id]/invitations` ahora elige los campos explícitamente (el token nunca sale en la lista, pase lo que pase con el `select`).
  - `lineup-photo.test.ts`: jsdom no envía `FormData` por `NextRequest`; el test usa el patrón de `settings-api.test.ts`. La ruta acepta el archivo por forma (`typeof f !== "string"`) en vez de `instanceof File`.
  - "Unhandled Errors" `el.scrollTo is not a function` (`TicketView.tsx`, test `Tickets.test.tsx`): polyfill de `Element.scrollTo/scrollBy` en `apps/web/__tests__/setup.ts`.
  - Mobile: 5 fallos eran timeouts de 5 s con suites de 45–70 s → `testTimeout: 20000` en `apps/mobile/jest.config.js`.
- **Previos, sin tocar (no los causa la integración):**
  - `create-payment-intent.test.ts` (6): los mocks de hold no traen `currency` y la ruta exige la moneda de la reserva desde antes (igual en `Flme_comp`; test idéntico al de producción).
  - `purchase-page.integration.test.tsx` (7) y `payment-protection.test.ts` (necesita Supabase real: "Supabase client not initialized"): página `/purchase` v1 y test sin cambios desde el baseline.
  - `OrganizerShell.test.tsx` "Finish Stripe setup" y `HomeFeed.test.tsx` "All cities": código sin cambios; repetir aislados para saber si son intermitentes.

## 8. Corrección: página del organizador (asistente) con flyers grandes
- Pedido de Kevin (11-05, con captura del prototipo `SCREENS.org` → `bFeed`): próximos eventos con la tarjeta grande del Inicio en el celular y flyers más grandes en PC.
- **Web:** la tarjeta del Inicio pasó a `app/v2/attendee/EventFeedCard.tsx` (compartida; `HomeView.tsx` la importa). En `attendee/organizer/[slug]/OrganizerProfile.tsx`: próximos con `EventFeedCard` (1 por fila en teléfono, 2 en PC dentro del ancho de 900 px; compartir evento con hoja nativa o copiar + aviso), pasados siguen como mosaicos pero máximo 3 por fila (antes 4).
- **App:** `OrganizerProfile.tsx` usa `EventFeedCard` (prop nueva `inset={false}` porque la página ya tiene márgenes); pasados sin cambios (2 por fila).
- Tests: `EventOrganizer.test.tsx` web y app comprueban el botón de compartir de cada tarjeta.

## 9. Probar la app en iPhone (desarrollo)
- Expo Go no sirve: la app usa `expo-dev-client` (SDK 54) y Expo Go de la App Store solo corre el SDK más reciente → hace falta un **development build** propio, compilado en la nube con EAS (Windows no compila iOS).
- Requisitos: acceso a una cuenta **Apple Developer de pago** (el equipo de producción es `6LD6F5HM59`, Apple ID `hello@flme.co`) y a la cuenta de Expo dueña del proyecto EAS (`75f6c24d-…`).
- Pasos: `eas device:create` (registrar el UDID del iPhone) → `eas build --profile development-device --platform ios` → instalar desde el QR → activar **Modo desarrollador** en el iPhone → `npx expo start -c` en el PC → abrir la app, aceptar "Red local".
- Ojo: el perfil `development-device` tiene `EXPO_PUBLIC_API_URL=https://www.flme.co` (producción) para el bundle embebido; con Metro manda el `.env` local, pero si la app abre sin conectarse a Metro apunta a producción.
