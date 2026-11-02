# Sesión 2026-11-02 — fase 4 arranca: promotores (lote + QR), etiquetas de estado, CSRF de pagos en la app, 4.1 Guardar eventos, 4.2 Seguir organizadores

## Contexto
Kevin pide avanzar con el plan aunque quedan pruebas/correcciones de fases anteriores. Siguiente fase del plan Flame 2.0 (`actual/FLAME_2_0_VALORACION.md` §3): **fase 4, funcionalidad nueva**. Ninguno de sus ítems existe hoy en la BD (sin tablas `follows`, `saved_events`, invitaciones, line-up ni numeración de tickets).

## Decisiones de Kevin
- **Orden de la fase 4: por riesgo** → Guardar eventos → Seguir organizadores → Line-up → Búsqueda → Invitaciones de equipo → Numeración de tickets (al final: toca el RPC de compra).
- **Categorías: descartadas** ("no se integra muy bien").
- **Añadidos que faltaban del prototipo (promotor)**: (1) QR por link de promotor, (2) crear links en lote pegando una lista de nombres, (3) rediseñar las etiquetas de estado ("Publicado", "Conectado con Stripe", "Activo"), que se veían genéricas.
- QR: se muestra en la página (captura / compartir), **sin ZIP**.

## 1. CSRF en "Solicitar pago" desde la app
- Síntoma: `CSRF validation failed { origin: null, referer: null }` en `POST /api/organizer/payouts/create` desde la app.
- [Seguro] Causa: la app nativa **no envía Origin ni Referer**; añadir IPs a los orígenes permitidos no lo arregla (además `192.168.100.3` sin `http://` y puerto es una URL inválida → el warning `Invalid URL in allowed origins`).
- Fix: la comprobación de origen solo aplica a peticiones con cookie (navegador). Si llega `Authorization: Bearer …` (lo que manda `apps/mobile/lib/api.ts`), se salta: otro sitio no puede poner esa cabecera. Es la única ruta con este CSRF manual.
- Test: `apps/web/__tests__/api/organizer/payouts-create-csrf.test.ts`.
- No se añadió ninguna IP al `.env`.

## 2. Promotores: pegar lista + QR (web y app)
- `packages/lib` (`organizer/event-detail.ts`): `parsePromoterNames` (líneas/comas/;, quita "1.", "-", "•", duplicados), `promoterCodeFor` (nombre + inicial del apellido sin tildes, `DAVIDC`, `DAVIDC2`…), `buildPromoterBatch`, `PROMOTER_BATCH_MAX = 100`. Test: `packages/lib/__tests__/promoter-batch.test.ts`.
- API nueva `POST /api/organizer/promoter-links/bulk` `{ event_id, names }`: mismos permisos que crear uno (miembro + `requireEventAccess`); los códigos se generan en el servidor contra los existentes; un solo insert; reintenta una vez si choca (23505). Test: `__tests__/api/organizer/promoter-links-bulk.test.ts`.
- Pestaña Promotores (web `tabs/PromotersTab.tsx`, app `components/v2/event/PromotersTab.tsx`): selector "Un promotor / Pegar lista"; tarjeta "N links listos" con **Copiar todo** (`Nombre: link` por línea, para WhatsApp); botón **QR** por fila → modal/hoja con el QR, código y link; web: copiar, compartir (si el navegador lo permite) y descargar PNG; app: copiar y compartir el link (el QR se comparte con captura). "Copiar todo" también bajo la lista cuando hay más de un link.
- i18n: `eventAdmin.promoters.*` nuevas claves en en/es.

## 3. Etiquetas de estado (StatusTag)
- Estilo nuevo tipo talón de entrada: esquinas casi rectas, muesca de color a la izquierda que lleva el estado, texto pequeño en mayúsculas Inter Tight en crema. El color solo en la muesca.
- Componentes: web `app/v2/components/StatusTag.tsx`, app `StatusTag` en `components/v2/ui.tsx`. Tonos: good, warn, danger, flame, neutral.
- Aplicado en web y app: estado del evento (Publicado/Borrador/Terminado) y etiqueta RSVP, Conectado con Stripe / Stripe incompleto (dashboard y Pagos), códigos Activo/Agotado, RSVPs (pendiente/aprobado/rechazado), Enviar tickets (Actual/Agotado/Oculto), tiers (Agotado/Oculto), roles de equipo y del dashboard. Se quitó `Pill` del dashboard de la app (sin otros usos).

## 4. Fase 4.1 — Guardar eventos (corazón), web y app (tarde del 11-02)
- **Migración** `supabase/migrations/20261102120000_saved_events.sql`: tabla `saved_events (user_id, event_id, created_at)`, PK compuesta, borrado en cascada, RLS solo SELECT de las filas propias (Clerk `sub`); escrituras por la API.
- **API** `GET/PUT /api/me/saved-events` (web y app, Bearer en la app): GET devuelve los eventos guardados **publicados** con los campos de las tarjetas (como Inicio, sin tiers ocultos); PUT `{ event_id, saved }` idempotente (guardar exige evento publicado; quitar siempre). Test: `__tests__/api/organizer/saved-events.test.ts`.
- **lib**: `splitSavedEvents` (próximos primero, terminados después) y `toggleSavedId`. Test: `packages/lib/__tests__/saved-events.test.ts`. i18n: sección `saved.*` en/es.
- **Web**: store compartido `app/v2/attendee/useSavedEvents.ts` (sin React Query ni Clerk: 401 = sin sesión → `/sign-in?redirect_url=…`), `SaveButton.tsx` (corazón; guardado = disco blanco + corazón carmesí), en tarjeta de Inicio, `EventTile` (Explorar, Más del organizador, perfil del organizador; no en pasados), barra superior del evento junto a Compartir, y sección **Guardados** en Tú. Icono `heart`/`heartFill`.
- **App**: `hooks/useSavedEvents.ts` (React Query, optimista, vuelve atrás si falla; sin sesión → `/sign-in`), `components/v2/attendee/SaveButton.tsx`, en `EventFeedCard`, `EventTile`, `EventTopBar` (prop `event`) y **Guardados** en Tú (también al tirar para recargar).
- Tests: web `__tests__/v2/SavedEvents.test.tsx` + caso en `You.test.tsx`; app `__tests__/v2/SavedEvents.test.tsx` + caso en `You.test.tsx`.
- **Pruebas reales**: `docs/PruebasReales/FASE_4_FUNCIONALIDAD_NUEVA.md` (también cubre §1–§3 de esta sesión); línea añadida en `docs/PruebasReales/README.md`.
- Decidido por mí (cambiable): el organizador no ve cuántos guardaron su evento; los guardados terminados siguen en la lista con la etiqueta "Terminado" (para poder quitarlos); un evento que vuelve a borrador se oculta de Guardados.

## 5. Fase 4.2 — Seguir organizadores, web y app (11-02, tras subir Kevin las migraciones)
- **Migración** `supabase/migrations/20261102150000_organization_follows.sql`: tabla `organization_follows (user_id, organization_id, created_at)`, RLS solo SELECT de lo propio; función `organization_follower_counts(uuid[])` (SECURITY DEFINER, solo números). **Sin columna contador en `organizations`** a propósito: los dueños pueden hacer UPDATE de su fila por RLS y podrían inflarlo.
- **API**: `GET/PUT /api/me/following` (lista con `followers_count`; seguir exige organización aprobada; idempotente) y pública `GET /api/organizations/followers?ids=…` (hasta 50, solo conteos). Helper `app/lib/follows.ts`. `getPublicOrganizer` trae `followers_count`. Test: `__tests__/api/organizer/following.test.ts`.
- **Web**: store `app/v2/attendee/useFollowing.ts` (mismo patrón que guardados; el número del perfil se mueve con el botón), `FollowButton.tsx`; perfil del organizador (botón junto al logo + "N seguidores"); Tú: contador **Siguiendo** y sección con lista (logo, ciudad · seguidores, botón).
- **App**: `hooks/useFollowing.ts` (`useFollowing` + `useFollowerCount`, React Query), `components/v2/attendee/FollowButton.tsx`; perfil del organizador y Tú igual que la web (vacío → Buscar organizadores = Explorar).
- i18n `follow.*` en/es.
- Tests: web `following.test.ts`, `EventOrganizer.test.tsx` (seguidores + botón; `EventTopBar` ahora recibe `id`), `You.test.tsx`; app `Following.test.tsx`, `EventOrganizer.test.tsx`, `You.test.tsx`.
- **Pendiente de decisión de Kevin**: el prototipo dice "te enterarás primero" al seguir → avisar a los seguidores (push/bandeja) cuando el organizador publica un evento. No está hecho; los textos nuevos no lo prometen.
- Pruebas: §5 de `docs/PruebasReales/FASE_4_FUNCIONALIDAD_NUEVA.md`.

## Verificación
- Lógica de `parsePromoterNames` / `promoterCodeFor` / `buildPromoterBatch` ejecutada en la VM: todo pasa.
- Lógica de `splitSavedEvents` / `toggleSavedId` ejecutada en la VM: pasa.
- Sintaxis TS/TSX de todos los archivos tocados: OK. **No se pudo correr vitest/jest ni `tsc` completo** (node_modules es de Windows y el disco montado es lento) → correr en local.

## Pendiente para Kevin (local)
1. `pnpm --filter @project-flame/lib test`, tests web (`EventAdminTabs`, `promoter-links-bulk`, `payouts-create-csrf`) y app (`EventTools`), y `tsc` de web y mobile.
2. Probar "Solicitar pago" desde la app y la pestaña Promotores (pegar lista, QR, copiar todo) en web y app.
3. Revisar visualmente las etiquetas nuevas; si no convencen, se cambia en un solo componente por plataforma.
4. Aplicar la migración `20261102120000_saved_events.sql` y seguir `docs/PruebasReales/FASE_4_FUNCIONALIDAD_NUEVA.md`.
5. Aplicar `20261102150000_organization_follows.sql` y seguir §5 de la guía de pruebas.
6. Decidir si seguir a un organizador debe avisar cuando publica eventos.
7. Siguiente ítem de fase 4: **Line-up** (artistas por evento con IG/Spotify/SoundCloud, en crear/editar evento y en la página del evento).
