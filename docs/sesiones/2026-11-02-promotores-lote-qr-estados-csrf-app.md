# Sesión 2026-11-02 — fase 4 arranca: promotores (lote + QR), etiquetas de estado, CSRF de pagos en la app, 4.1 Guardar eventos, 4.2 Seguir organizadores, 4.3 Line-up, 4.4 Búsqueda, 4.5 Invitaciones

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

## 6. Fase 4.3 — Line-up, web y app
- **Migración** `supabase/migrations/20261102170000_events_lineup.sql`: `events.lineup jsonb NOT NULL DEFAULT '[]'` con CHECK (array, máx. 20). `get_event_with_tiers` ya devuelve `to_jsonb(e)`, así que la app lo recibe sin tocar el RPC; las versiones viejas lo ignoran.
- **lib** `packages/lib/src/organizer/lineup.ts`: artista `{ name, instagram?, spotify?, soundcloud? }`; normalizadores (Instagram `@`/link → usuario; Spotify solo `open.spotify.com`/`spotify.link`; SoundCloud link o usuario), `validateLineup`, `lineupFromDrafts`, `parseLineup` (para mostrar, tolera basura), `sanitizeLineup` (servidor, estricto), `artistLinks`, `artistInitials`. Integrado en `event-form.ts` (crear: `lineup` en el estado, errores `lineup.<key>.<campo>`, payload; editar: precarga y se envía solo si cambió). Test: `packages/lib/__tests__/lineup.test.ts`.
- **API** `POST/PATCH /api/events`: campo `lineup` validado con `sanitizeLineup` (400 si un link no vale; `[]` lo borra). Test: `__tests__/api/organizer/events-lineup.test.ts`.
- **Web**: `v2/organizer/event-form/LineupFields.tsx` en crear y editar evento (sección después de "Acerca de"); `v2/attendee/events/[slug]/Lineup.tsx` en la página del evento después de los tiers (tarjetas con iniciales y tono por nombre, iconos propios simples, no logos de marca). `Event` de `useOrganizerData` con `lineup?`.
- **App**: `components/v2/form/LineupFields.tsx` en crear/editar; `components/v2/attendee/event/Lineup.tsx` en `app/event/[id].tsx` (solo v2).
- i18n: `eventForm.lineup*`, `eventForm.artistName*`, `eventForm.addArtist`, errores nuevos; `event.lineup`, `event.artistOn`.
- Decidido por mí (cambiable): **sin fotos de artistas** (subirlas exige que el evento exista; el flujo de crear sube el flyer después); máximo 20 artistas; el line-up va debajo de los tiers como en el prototipo.
- Pruebas: §6 de `docs/PruebasReales/FASE_4_FUNCIONALIDAD_NUEVA.md`.

## 7. Pedidos de Kevin (11-02, tarde)
- **Logo de Flame → Inicio** desde cualquier pantalla (web): `OrganizerShell` (antes iba a Mis organizadores) y `components/auth/WelcomeFrame.tsx`. La barra del asistente y la app ya iban a Inicio.
- **Rol en "Tú"**: `StatusTag` con el rol en cada organización (web `YouView`, app `You.tsx`, también en `/v2/organizer`).
- **`/v2/organizer` integrada**: `OrganizersList` ahora va dentro de `AttendeeShell` (pestaña Tú activa), sin `<main>` propio; botón "Tú" en lugar de "App de asistente".
- **Foto del artista en el line-up**: miniatura con lápiz en cada tarjeta (web: menú; app: hoja). Opciones: Spotify y SoundCloud (oEmbed público; Spotify con respaldo opcional de la Web API si hay `SPOTIFY_CLIENT_ID`/`SECRET`), Instagram **desactivado** (no hay forma pública de leer la foto de perfil; su oEmbed exige token de Meta y solo cubre publicaciones), subir (web recorta 600×600 en el navegador; app recorte 1:1 del sistema), quitar.
  - API `POST /api/organizer/lineup-photo` (`app/lib/artist-photo.ts`): la foto se **copia a nuestro Storage** `event-images/artists/<org>/<uuid>.<ext>` (no se enlaza a Spotify/SoundCloud); funciona antes de crear el evento; miembros salvo viewer.
  - lib: `photo_url` en el artista, `isArtistPhotoUrl` (solo nuestro Storage), error `photoInvalid`.
  - Tests: lib `lineup`, web `lineup-photo.test.ts`, `LineupPhoto.test.tsx`, `OrganizerShell`, `You`; app `EventForms`, `You`.
- Pruebas: §6.3 y §7 de `docs/PruebasReales/FASE_4_FUNCIONALIDAD_NUEVA.md`.

## 8. Fase 4.4 — Búsqueda (web y app)
- Kevin confirmó que la foto de Spotify funciona (el error sale cuando Spotify no tiene foto del artista: esperado).
- [Probable] **Sin endpoint nuevo**: la búsqueda sigue en el cliente sobre los eventos próximos que ya cargan Inicio/Explorar (como el prototipo `filterEvents`). Al volumen actual es suficiente; si crece mucho, pasar a un endpoint con índice (pendiente, no urgente).
- **lib** `utils/explore.ts`: `searchExplore` busca también por artistas del line-up y devuelve `artists` (mismo nombre sin tildes = mismo artista; foto de cualquiera de sus eventos; ordenados por nº de eventos); `addRecentSearch` (máx. 4, sin repetir). Tests en `packages/lib/__tests__/explore.test.ts`.
- **Web**: `getHomeEvents` trae `lineup` (caché `home-events-v2.6`); `getExploreOrganizers` trae `followers_count` y ordena por seguidores (caché `explore-organizers-v3`); `ExploreView`: sección Artistas (fila con foto/iniciales → próximo evento), seguidores en las tarjetas, búsquedas recientes en `localStorage` (`flame.recentSearches`), placeholder "Eventos, artistas, lugares, organizadores".
- **App**: `useAppEvents` ya trae `*` (incluye `lineup`); `FeedEvent.lineup`; `useFollowerCounts` (conteos públicos de 50 en 50); `lib/v2/recent-searches.ts` (SecureStore `flame_recent_searches`); `Explore.tsx` igual que la web.
- Pruebas: §8 de `docs/PruebasReales/FASE_4_FUNCIONALIDAD_NUEVA.md`.

## 9. Fase 4.5 — Invitaciones de equipo (web y app)
- **Decisiones de Kevin**: invitar **cualquier correo** (con o sin cuenta); aviso **en la app + correo** (si el correo falla, la invitación igual se ve en la app); **vence a los 7 días** (reenviar renueva, cancelar la cierra).
- **Migración** `supabase/migrations/20261102190000_organization_invitations.sql`: tabla `organization_invitations` (email en minúsculas, rol admin/organizador, token, estado pending/accepted/declined/cancelled, `expires_at` +7 d); una sola pendiente por correo y organización; RLS sin políticas (solo la API).
- **lib** `organizer/invitations.ts` (validar correo/rol, estado con vencido, días restantes); tipo de notificación `team_invitation` (siempre activa); i18n `invites.*` y `pushes.teamInvitation`.
- **API** (`app/lib/team-invitations.ts`): `GET/POST /api/organizations/[id]/invitations` (dueño/admin; 409 si ya es miembro; repetir = reenviar), `POST/DELETE …/invitations/[invitationId]` (reenviar / cancelar), `GET /api/me/invitations`, `POST /api/me/invitations/[id]` (aceptar → fila en `organization_members` con el rol), `GET/POST /api/invitations/[token]` (link del correo; responder exige estar con **el mismo correo**). Correo por Brevo con botón a `/invite/<token>`; notificación + push si ya tiene cuenta.
- **Web**: Equipo con "Invitar miembro" (correo + rol; sustituye a "Agregar miembro" con buscador), "Invitaciones pendientes" (Invitado/Vencida, vence en N días, Reenviar, cancelar); Tú con tarjeta Aceptar/Rechazar; página `/invite/<token>` (reescrita a `v2/attendee/invite/[token]`); campana → Tú.
- **App**: `TeamScreen` igual; `hooks/useMyInvitations.ts` + tarjeta en Tú; deep link `team_invitation` → `/profile`.
- El alta directa (`POST /api/organizations/[id]/members`) **no se borró** (la usa la app v1).
- Se creó por error `apps/web/app/invite/[token]/` (duplicado); sus archivos se movieron a `_to_delete/web-app-invite-duplicado/` y quedó la **carpeta vacía** `apps/web/app/invite/` — borrar a mano.
- Ajustes del mismo pedido: eventos de Explorar más grandes (web destacados 260–300 px y resultados máx. 3 columnas; app destacados ~72 % del ancho); app: el fondo difuminado del flyer cubre todo el encabezado hasta "Acerca de" con fundido a negro (antes altura fija de 700 px).
- Pruebas: §9 y §10 de `docs/PruebasReales/FASE_4_FUNCIONALIDAD_NUEVA.md`.

## 10. Correo de invitación no llega — diagnóstico Brevo (11-02, noche)
- Log: `[team-invitations] e-mail failed … BrevoError 401 "unrecognised IP address 2800:bf0:…"` y luego `POST …/invitations 200`.
- **Causa [Seguro]**: la cuenta de Brevo tiene activo el **bloqueo por IPs autorizadas** (Security → Authorized IPs). La llamada a la API sale desde la IPv6 del ISP de la PC de desarrollo, que no está en la lista, y Brevo la rechaza antes de enviar. **No es un bug del código.**
- Afecta a **todos** los correos por Brevo desde esa máquina (tickets, RSVP, cambio de fecha, invitaciones), no solo a invitaciones.
- Que lleguen correos "de `…@11637143.brevosend.com`" no contradice nada: es otro problema. `FROM_EMAIL`/`BREVO_SENDER_EMAIL` en `apps/web/.env` es una dirección **@gmail.com**; Brevo no puede firmar como gmail (DMARC) y reescribe el remitente a su dominio compartido. Peor entregabilidad (spam) y se ve poco profesional.
- La app se comportó como se diseñó en 4.5: la invitación se crea (200), se ve en la app de la persona y la pantalla Equipo muestra "enviada, sin correo" (`invites.sentNoEmail`).
- **Arreglo (en Brevo, no en código)**:
  1. Brevo → Security → Authorized IPs → **desactivar el bloqueo** (recomendado). Añadir la IP no sirve de mucho: la IPv6 de casa rota, y en Vercel las IPs de salida de las funciones también cambian.
  2. [Probable] Si producción usa la **misma cuenta/clave** de Brevo, producción también está fallando con el mismo 401: revisar logs de Vercel buscando `unrecognised IP address`.
  3. Autenticar un dominio propio en Brevo (DKIM + DMARC, p. ej. `flme.co`) y usar `FROM_EMAIL=noreply@<dominio>`; así desaparece el remitente `brevosend.com`. El código ya usa `noreply@flme.co` por defecto si `FROM_EMAIL` no está.

## 11. Aviso a seguidores cuando se publica un evento (decisión de Kevin 11-02)
- **Decisión**: sí avisar a los seguidores cuando un organizador publica un evento.
- En Flame todo evento nace publicado (`POST /api/events` solo acepta `status: "published"`; no hay borradores), así que "publicar" = **crear**. Editar no vuelve a avisar.
- **lib**: tipo de notificación `followed_org_event` (desactivable; no está en `NON_DISMISSABLE…`), en `NOTIFICATION_PREFERENCE_ITEMS` con las de asistente; i18n `settings.notif.followed_org_event` ("Eventos nuevos") y `pushes.followedOrgEvent` (título "Nuevo evento de {org}", cuerpo "Evento · fecha · ciudad").
- **Web** `app/lib/follower-notifications.ts` → `notifyFollowersOfNewEvent(event)`: seguidores de la organización con paginación (más de 1000), **sin los miembros** de la organización, sin quienes lo apagaron en Ajustes; idioma de cada persona; fecha en la zona horaria del evento; bandeja + push con `sendPushNotification` en tandas de 10; nunca lanza error. Se llama desde `POST /api/events` con `after()` de Next (después de responder: crear el evento no espera el envío).
- Enlaces: web (campana) → `/events/<slug>`; app → `/event/<id>`; icono calendario en web y app (`InboxCard`, `NotificationsList`), v1 `NotificationCard` con icono propio.
- Arreglo de paso: `DEFAULT_PREFERENCES` de la app (`hooks/useNotificationPreferences.ts`) no tenía `team_invitation` (4.5) → `tsc` de mobile habría fallado; añadido junto con el tipo nuevo.
- Sin migración (usa `organization_follows` y `notifications`).
- Test: `apps/web/__tests__/api/organizer/follower-notifications.test.ts`. Pruebas reales: §5.3 de `PruebasReales/FASE_4_FUNCIONALIDAD_NUEVA.md`.
- [Probable] Límite: con muchos miles de seguidores el envío en tandas de 10 puede acercarse al tiempo máximo de la función en Vercel; al volumen actual sobra. Si crece, pasar a una cola/cron.

## 12. Fase 4.6 Numeración de tickets — revisión antes de tocar la compra (11-02, noche)
- **[Seguro] En el prototipo el número es por persona, no por evento**: `ACTS.payNow` asigna `n` contando solo los tickets **de esa persona** para ese evento (`S.tickets.filter(x => x.ev === e.id)`, todos `holder:'me'`), y la pantalla del ticket muestra "Ticket 1 / Ticket 2" para cambiar entre los tuyos. No hay un correlativo 1, 2, 3… entre todos los compradores.
- **Ya está hecho**: "Ticket N de M" en la web (`v2/attendee/tickets/[id]/TicketView.tsx`) y en la app (`TicketPager.tsx`) desde la 2.3; el escáner muestra "Ticket N de M" de la orden (`sequence_number` = posición en la orden, sale del QR, `api/qr-scanner/verify`).
- La valoración (`actual/FLAME_2_0_VALORACION.md` §2.3) lo describió como "correlativa por evento con asignación dentro del RPC de compra": **lectura equivocada del prototipo**. Corregido abajo.
- **Decisión de Kevin (11-02)**: cerrar la 4.6 como cubierta (sin serie por evento). Antes se planteó (b) añadir además un número de serie por evento (#0001…) — sería columna + backfill + trigger `BEFORE INSERT` en `tickets` con contador por evento (no dentro del RPC); toca el camino de compra, así que entraría en la evaluación del proceso de compra que Kevin ya planificó para después de Flame 2.0.
- No se cambió código en este punto.

## 13. Corrección de cierre de la fase 4 + inventario para la fase 5 (11-02, noche)
- **Bug (app)**: el número de la campana con 2 cifras se veía cortado (21 → "2"). [Seguro] El conteo estaba bien; era el dibujo: la insignia absoluta solo tenía `minWidth` y Android la medía antes de aplicar la fuente en negrita. Arreglo en `components/v2/attendee/AttendeeTopBar.tsx`: ancho explícito por nº de caracteres (`badgeWidth`: 18 / 24 / 30 px para 1, 2 y "99+"), `numberOfLines={1}`, sin padding de fuente. Test: `__tests__/v2/AttendeeTopBarBadge.test.tsx`. Prueba real: §11 de `PruebasReales/FASE_4_FUNCIONALIDAD_NUEVA.md`.
- **Fase 4 cerrada en código** (4.1–4.6). Falta: tests en local + pruebas reales + aplicar sus migraciones.
- **Qué queda para la fase 5 (Ensayo y salida)** — detalle en `actual/ESTADO_ACTUAL.md`, fila 5.

## 14. Auditoría contra la lista del cliente (11-02, noche)
- Kevin pasó la lista del cliente (3 fases) basada en el prototipo. Resultado en `actual/AUDITORIA_REQUISITOS_CLIENTE.md`.
- Faltan: **Finance**, **Communications** (en el prototipo es solo "Próximamente"; el cliente lo pide como SMS y correo → aclarar alcance), **Editar perfil** completo (@usuario, ciudad, color), **países y ciudades** agrupados, **escáner** con buscador / campo "evento o código". El resto está hecho; varias cosas sin prueba real.
- Kevin trabajará mejoras de diseño en Claude Design en paralelo.

## 15. Finanzas, Editar perfil, seguridad de cuenta, ciudades y lugar (11-02, noche)
Pedido de Kevin tras la auditoría: 1) Finanzas como el prototipo, 2) Editar perfil propio separado de Ajustes (con Clerk), 3) países y ciudades. Después: quitar la tarjeta de perfil de Ajustes, pantalla propia en la app para contraseña/correos (sin accounts.dev), ciudades = lista + lugar con autocompletado.

**Finanzas (web y app)** — Manage → Finanzas. `packages/lib/src/organizer/finance.ts` (`organizationFinance`): misma regla que el Desglose (tarjeta neto + transferencias; gratis no cuentan; solo eventos propios). Saldo "listo para retirar" del mismo resumen de Stripe de Pagos. Web `v2/organizer/finance/`, app `components/v2/manage/FinanceScreen.tsx` + `app/v2/organizer/finance.tsx`. Sin migración. Dueño/admin.

**Editar perfil** — [Seguro] no hace falta dejar Clerk: el nombre se cambia con la Backend API de Clerk (`users.updateUser`) desde nuestra API; Instagram y color en `users`; la foto con `/api/upload-profile-image` (ya existía). Dejar Clerk = rehacer login Google/Apple, sesiones, recuperación, JWT de Supabase en la app y webhooks: descartado.
- Migración `20261102210000_users_profile_fields.sql` (`users.instagram`, `users.avatar_color` con CHECK). Antes de aplicarla nombre y foto funcionan; Instagram/color no se guardan.
- lib `utils/profile.ts` (8 colores del prototipo, validación, iniciales, la foto por defecto de Clerk = sin foto). API `GET/PATCH /api/me/profile` (si Clerk rechaza el nombre → 502 y no se guarda nada).
- Web `/profile/edit` (reescrita a `v2/attendee/you/edit`), app `/v2/profile/edit`. Tú muestra avatar con color/foto y @instagram.
- [Probable] En Clerk Dashboard deben estar activados nombre y apellido; si no, el cambio de nombre falla con aviso.

**Ajustes** — sin tarjeta de perfil (web y app). Web: la fila abre `clerk.openUserProfile()` (ventana sobre la página). App: pantalla propia `components/v2/settings/AccountSecurity.tsx` (`/v2/account-security`) con el SDK de Clerk: correos (agregar con código, principal, quitar), contraseña (cambiar o agregar si solo Google/Apple; cerrar otras sesiones), cuentas conectadas, dispositivos (cerrar sesión en otros). Si Clerk pide re-verificar → mensaje de volver a entrar.

**Ciudades y lugar** (decisión de Kevin: lista de ciudades + autocompletado del lugar).
- lib `utils/places.ts`: catálogo del prototipo (EC, US, ES, PA, PT, MX) con alias ("gye", "NYC", "Lisbon"…), `canonicalCity`, `cityDefaults` (zona y moneda), `groupCitiesByCountry`, `sameCity`, `venueMapsUrl` (link de Maps sin API), `newPlacesSessionToken`. Zonas nuevas: America/Panama, Cancun, Merida, Europe/Lisbon.
- Migración `20261102220000_events_venue_place.sql` (`events.venue_address`, `events.venue_place_id`). `POST/PATCH /api/events` aceptan ambos y guardan la ciudad con la grafía del catálogo.
- API nueva `GET /api/places/venues` y `/api/places/venues/[placeId]` (Places API **New**, solo con sesión iniciada, token de sesión, detalles solo `id,formattedAddress` = Essentials, límite por persona; sin llave → 503 y el campo queda como texto). La ruta v1 `/api/places/autocomplete` (legacy, ciudades) sigue para la v1.
- Formularios web/app: ciudad desde la lista (agrupada por país, "Otra ciudad…" a texto; eventos viejos fuera de la lista abren en texto), lugar con sugerencias del país de la ciudad; al elegir ciudad en Crear, sugiere zona y moneda. Inicio web/app: selector agrupado por país. Página del evento: dirección y "Cómo llegar" al lugar exacto.
- Llave: `docs/guias/GOOGLE_PLACES_API_KEY.md` (Kevin la crea con su cuenta para dev; otra para producción).
- Pruebas: §12–§15 de `PruebasReales/FASE_4_FUNCIONALIDAD_NUEVA.md`.
- Verificado ejecutando en la VM: `organizationFinance`, `validateProfile`, catálogo/agrupación/alias, payloads de crear/editar con lugar, `directionsUrl`. Tests escritos (lib `places`, `organizer-finance`; web `Finance`, `EditProfile`, `me-profile`, `places-venues`, `VenueCityFields`, `Settings`, `You`, `ManageHub`; app `Finance`, `EditProfile`, `AccountSecurity`, `UserSettings`, `You`, `ManageHub`, `EventForms`) — correr en local.
- Para borrar a mano: carpeta vacía `apps/web/__tests__/api/me/` y `_to_delete/tmp-2026-11-02/`.

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
6. ~~Decidir aviso a seguidores~~ → hecho (§11). Correr `follower-notifications.test.ts` y seguir §5.3 de la guía.
6b. Brevo: desactivar el bloqueo de IPs autorizadas y revisar si producción tiene el mismo 401 (§10).
7. Aplicar `20261102170000_events_lineup.sql` y seguir §6 de la guía de pruebas. Fotos de artistas: hechas (§7).
8. Seguir §8 de la guía de pruebas (búsqueda).
9. Aplicar `20261102190000_organization_invitations.sql`, borrar la carpeta vacía `apps/web/app/invite/` y `_to_delete/web-app-invite-duplicado/`, seguir §9–§10.
10. Fase 4.6 cerrada sin cambios (§12). Probar la insignia de la campana con 10+ notificaciones (§13).
11. Aplicar `20261102210000_users_profile_fields.sql` y `20261102220000_events_venue_place.sql`; crear la llave de Google (`guias/GOOGLE_PLACES_API_KEY.md`); seguir §12–§15 de la guía de pruebas.
