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
- tsc de la app no se puede correr en la VM de Claude (miles de errores falsos por la instalación de Windows y se pasa de
  tiempo): el conteo real (40 heredados) lo da Kevin en Windows.

## Decisiones (Kevin, 10-22)
- **Datos: solo la API web.** El organizador v2 de la app usa las mismas rutas `/api/organizer/*`, `/api/events`,
  `/api/ticket-tiers`, … que la web v2, con sus permisos por evento. No usa Supabase directo → no depende de la
  auditoría RLS móvil pendiente.
- **Tests en la app: jest-expo mínimo** (permisos y flujos de pantalla). La lógica sigue en `packages/lib` (vitest).
- **Firebase / push en Android:** pregunta de Kevin: ¿para qué Firebase si la auth es Clerk? Respuesta: Firebase no se usa
  para auth. Solo sería FCM, el canal por el que Android entrega push. Producción (`Flme_comp`) **no usa Firebase**:
  push = servicio de Expo (`exp.host`) y en iOS va por APNs con credenciales en EAS. Como producción es solo iOS, no es
  necesario. Sin FCM, el build Android no obtiene token (`lib/notifications.ts` lo registra en consola y sigue, no
  rompe). Recomendación: **no agregarlo**; los push se prueban en iOS/TestFlight (fase 5). Pendiente de OK de Kevin.

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
