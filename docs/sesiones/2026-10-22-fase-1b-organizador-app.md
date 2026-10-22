# 2026-10-22 — Fase 1b: organizador en la app (Expo)

Plan y decisiones de la fase 1b. Fase 1 (organizador web v2) cerrada el mismo día: ver
`2026-10-08-valoracion-flame-2.0.md` (final) y `docs/PruebasReales/FASE_1_ORGANIZADOR_WEB.md`.

## Punto de partida (inventario 10-22)
- Pantallas de organizador actuales (~4.800 líneas + componentes): `organizer-admin` (panel, 1009), `org-event-detail` (600),
  `org-members` (474), `rsvp-management` + `rsvp-detail` (669), `edit-event` + `components/events-management`,
  `(tabs)/create-event` (573) + `components/create-event`, `(tabs)/events-management`, `scanner` (1308),
  payouts dentro de `components/settings/PayoutsSettingsTab`.
- Datos: mezcla de API web (`lib/api.ts`, Bearer de Clerk) y Supabase directo (11 hooks: `useOrgData`, `useOrgEvents`,
  `useManageMembers`, `useRsvpManagement`, …).
- Ya existe: `lib/i18n.tsx` (sin montar), diccionarios y lógica del organizador en `packages/lib/src/organizer/*`
  (la misma que usa la web v2, con tests), tokens en `packages/lib/src/design-tokens/flame-v2.ts`.
- El prototipo no tiene pantallas nativas de organizador: la especificación es la **vista teléfono** del organizador web
  (`ow:*`), por la decisión D1.
- Verificación: tsc/vitest/jest no corren sobre el `node_modules` de Windows desde la VM de Claude. Solución: copia en la VM
  (`~/linux/Flme`, sin node_modules ni `Flme_comp`) con `pnpm install --frozen-lockfile` de Linux; se sincroniza con rsync
  antes de cada verificación. tsc de la app ahí = 40, igual que en Windows (Kevin). Nunca se escribe en el node_modules de Kevin.

## Decisiones (Kevin, 10-22)
- **Datos: solo la API web.** El organizador v2 de la app usa las mismas rutas `/api/organizer/*`, `/api/events`,
  `/api/ticket-tiers`, … que la web v2, con sus permisos por evento. No usa Supabase directo → no depende de la
  auditoría RLS móvil pendiente.
- **Tests en la app: jest-expo mínimo** (permisos y flujos de pantalla). La lógica sigue en `packages/lib` (vitest).
- **Firebase / push en Android:** pregunta de Kevin: ¿para qué Firebase si la auth es Clerk? Respuesta: Firebase no se usa
  para auth. Solo sería FCM, el canal por el que Android entrega push. Producción (`Flme_comp`) **no usa Firebase**:
  push = servicio de Expo (`exp.host`) y en iOS va por APNs con credenciales en EAS. Como producción es solo iOS, no es
  necesario. Sin FCM, el build Android no obtiene token (`lib/notifications.ts` lo registra en consola y sigue, no
  rompe). **Decisión de Kevin:** no se agrega; producción se centra en iOS (Android no es seguro que se lance). Si algún día se lanza Android, Firebase/FCM sí será necesario solo para push.

## Plan por entregas
| # | Entrega | Reemplaza |
| --- | --- | --- |
| 1b.0 | Base: jest-expo, `I18nProvider` montado (idioma de `users.language`), tokens v2 en RN, cliente/hook de API del organizador (react-query sobre la API web), interruptor `EXPO_PUBLIC_ORGANIZER_V1`, stack `/v2/organizer` con barra inferior | — |
| 1b.1 | Mis organizadores + panel (KPIs según rol, actuales/pasados, búsqueda sin tildes) | `organizer-admin`, `(tabs)/events-management` |
| 1b.2 | Detalle de evento: Tiers, Compras (XLSX), Desglose, Promotores, Códigos, Enviar tickets, Co-organizadores | `org-event-detail`, `components/org-dashboard/*` |
| 1b.3 | RSVPs: lista y detalle (aprobar/rechazar, aprobar todas, exportar) | `rsvp-management`, `rsvp-detail` |
| 1b.4 | Crear y editar evento + editor de tiers (etapas, preguntas, reducción forzada) | `(tabs)/create-event`, `edit-event`, `components/create-event`, `components/events-management` |
| 1b.5 | Equipo, ajustes de organización, payouts, Mi cuenta (idioma) | `org-members`, `PayoutsSettingsTab` |
| 1b.6 | Escáner v2: cámara, cuentas y código de acceso por evento | `scanner` |
| 1b.7 | Cierre: paridad con la web, pantallas v1 detrás del interruptor, PruebasReales 1b (incluye los casos de app heredados de la fase 1) | — |

Las pantallas v1 de la app **no se borran** en la 1b: quedan detrás de `EXPO_PUBLIC_ORGANIZER_V1` (igual que la web).

## Entrega 1b.0 + 1b.1 (2026-10-22): base y panel
Kevin instaló jest-expo 54.0.18, jest 29.7, @testing-library/react-native 14.1 y @types/jest con `npx expo install` (tsc base: 40).

**Base (1b.0)**
- API web: `GET /api/me/language` → `{ language }` (la app no tiene render de servidor para leer `users.language`; misma regla que `getUserLanguage`: cualquier fallo → "en"). Test en `settings-api.test.ts`.
- `components/v2/LanguageProvider.tsx` montado en `AppShell` (dentro de Clerk): lee el idioma al iniciar sesión (`["me-language"]`), lo guarda con PUT. `lib/i18n.tsx` ahora sigue los cambios de `initialLanguage` sin remontar el árbol (el Stack raíz no se puede desmontar).
- Fuentes Inter / Inter Tight cargadas en `_layout` (nombres = `font-v2-*` de `packages/ui/tailwind.config.js`).
- `lib/v2/flags.ts` (`EXPO_PUBLIC_ORGANIZER_V1=true` vuelve a v1), `lib/v2/routes.ts` (pantallas aún no hechas → su v1 con `orgId`), `lib/v2/organizer-api.ts` (tipos de `/api/organizations` y `/api/organizer/data`).
- `RoleResolutionGate`: en rutas `/v2…` no se pintan el `Header` ni la `CustomTabBar` de asistente.
- Tests: `jest.config.js` (preset jest-expo; `@project-flame/*`, nativewind y css-interop transformados), `jest.setup.js` (safe-area mock), script `test`. **RNTL 14 es asíncrono**: `await render`, `await fireEvent` (helper `renderV2`).

**Panel (1b.1)** — `/v2/organizer?org=<slug>` (o `?orgId=`, para enlaces v1)
- `hooks/v2/useOrganizerModel.ts`: `useMyOrganizations` (`GET /api/organizations`), `findOrganization`, `useOrganizerModel` (mismos endpoints, reglas de `packages/lib` y sondeo de 15 s que la web; sincroniza `MemberRoleContext.selectedOrgId` para las pantallas v1 que se abren desde v2).
- `components/v2/ui.tsx` (Icon con Ionicons, OrgAvatar, Flyer, Skeleton, Badge, Pill, Kpi, ErrorBox, Spinner), `components/v2/OrganizerShell.tsx` (barra superior con ☰/atrás/título, menú lateral en Modal, barra flotante por rol con badge de RSVPs, `hideTabbar`), `components/v2/OrganizerDashboard.tsx` (hero con resplandor del logo, rol, Stripe, Gestionar, KPIs, crear evento, pestañas, búsqueda en ambas pestañas, lista, pull-to-refresh, error).
- Entrada: `organizer-admin` redirige a v2 (cubre perfil y deep links de notificaciones) salvo con el interruptor. "Mis organizadores" sigue en el Perfil.

**Verificado:** jest app 13/13 (panel 5, marco 4, base 4); vitest `settings-api` 6/6; tsc app 40 (sin errores nuevos), tsc web 0.
**No verificado:** cómo se ve. No hay forma de abrir la app con sesión desde la VM; lo revisa Kevin en el celular/Expo web (`FASE_1B_ORGANIZADOR_APP.md` §1b.0–1b.1).
**Siguiente:** 1b.2 detalle de evento.

Kevin: tests de la app 13/13 en Windows. Pidió que cada prueba real diga en qué dispositivo hacerla → convención en `PruebasReales/README.md` (📱 celular / 🌐 web) y pasos para levantar web + Metro al inicio de `FASE_1B_ORGANIZADOR_APP.md`.

## Entrega 1b.2a (2026-10-22): detalle de evento — marco, Tiers, Compras, Desglose
La 1b.2 se parte en dos: **1b.2a** (esta) y **1b.2b** (Enlaces de promotor, Códigos, Enviar tickets, Escáner, Co-organizadores).
- Ruta `/v2/organizer/event/[id]?org=<slug>&tab=…`; `components/v2/OrganizerRoute.tsx` resuelve la organización (slug u `orgId`) para todas las rutas v2 (el panel ahora la usa).
- `components/v2/event/EventAdmin.tsx`: cabecera (flyer desenfocado, estado, RSVP, KPIs con `summarizeEventSales`), botones Co-organizadores / Gestionar RSVPs / Editar evento (→ v1 por ahora), pestañas horizontales pegadas arriba (`stickyHeaderIndices`) con la pestaña en la URL (`router.setParams`); evento co-organizado = solo lectura; no encontrado → aviso. Pestañas aún no hechas → tarjeta "versión anterior" (i18n temporal `eventAdmin.previousVersion` / `openPrevious`, se quitan en la 1b.2b).
- `TiersTab` (Switch nativo, `PATCH /api/ticket-tiers`, mensaje del servidor en 4xx con `apiErrorText`), `PurchasesTab` (búsqueda; XLSX con datos frescos reutilizando `exportPurchasesXlsx` de v1 → hoja de compartir), `BreakdownTab` (`eventBreakdown`, `salesByTier`, `promoterLeaderboard`).
- Tipos: `OrgEventV2` (el tipo v1 no trae `organization_id`, `is_hidden`, `is_manually_sold_out`, `quantity_reserved`; v2 lee la respuesta cruda). `useOrganizerModel` devuelve también `data`. El menú resalta el evento abierto (`activeEventId`).
- Rutas: `event` → v2; `eventV1`, `editEvent`, `tier`, `rsvpEvent` → v1 hasta su entrega.

**Verificado:** jest app 23/23 (+10 `EventAdmin.test.tsx`); vitest lib 369/369; tsc app 40 (sin nuevos). **No verificado:** aspecto en el celular (Kevin, `FASE_1B…` §1b.2a).
**Siguiente:** 1b.2b.
