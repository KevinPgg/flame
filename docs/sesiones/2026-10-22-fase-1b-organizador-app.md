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
| 1b.5 | Desde **Manage**: Equipo, Pagos, Ajustes de organización. **Ajustes de usuario únicos** (ver decisión 10-23). Cola de aprobación de organizaciones (soporte) en estilo 2.0 | `org-members`, `PayoutsSettingsTab`, `account`, `settings`, `SupportAdminSection` |
| 1b.6 | Escáner v2 desde la pestaña **Escanear** del organizador (cuentas: owner/admin/organizer y personas agregadas). Ajustes → Scan Tickets queda **solo para códigos** | `scanner` |
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

## Ronda 1 de pruebas de Kevin y correcciones (2026-10-23)
**Lo que reportó**
- 1b.0: la parte de asistente sigue en inglés (esperado: se traduce en la fase 2); el organizador v2 **no tomaba el idioma** de la cuenta ("son independientes"). La tipografía sí, pero **la app era una copia reducida de la web**: hay que respetar el diseño de teléfono del prototipo, sin menú lateral, con el botón **Manage** de la barra inferior.
- 1b.1: la "organización pendiente que sí se abre" era la **cola de aprobación de soporte** del perfil (está bien gestionarla desde el celular; pasarla a estilo 2.0). Demasiados botones de ajustes en web y app. No ve notificaciones de organizador. Editar evento y Co-organizadores llevan a v1 (esperado hasta 1b.4 / 1b.2b). Quitar el menú de las pruebas.
- Heredado: Ajustes → Scan Tickets debe ser **solo para códigos**; las cuentas asignadas escanean desde el organizador.

**Error mío:** en la 1b.1 tomé la vista teléfono del organizador *web* (sidebar → cajón) en vez del diseño de teléfono del prototipo: barra inferior `owTabbar` (Events · RSVPs · Scan · Manage), hub `OW_SCREENS.manage` ("one hub instead of a growing tab bar"), título con selector de organización (`switcher`), "+" para crear evento y avatar → "Back to You". En la fase 1 el hub "Manage" se dejó sin hacer por falta de respuesta; ahora Kevin lo pidió.

**Decisiones de Kevin (10-23)**
- App: diseño de teléfono del prototipo, sin menú lateral; lo de la organización vive en **Manage**.
- **Ajustes:** solo tres cosas: la gestión de cuenta de Clerk, **un único "Ajustes" de usuario** (personal, cuenta, notificaciones… todo junto) y **un "Ajustes" de organización**. Aplica a web y app (app en la 1b.5; web: ver pendiente).
- Escanear con cuenta → pestaña Escanear del organizador; Ajustes → Scan Tickets → solo códigos (1b.6).

**Corregido**
- `OrganizerShell` reescrito: sin cajón; barra superior ← · título (en el panel, ▾ abre una hoja con las organizaciones aprobadas y "Mis organizadores") · acciones · avatar (Clerk `useUser` vía `hooks/v2/useMe.ts`, → perfil); barra inferior por rol: Eventos y RSVPs (todos), Escanear (owner/admin/organizer, solo en celular → escáner v1 hasta 1b.6), Manage (owner/admin).
- `ManageHub` + ruta `/v2/organizer/manage`: frase del prototipo y filas Equipo (N miembros, `GET /api/organizations/{id}/members`), Pagos (disponible, `GET /api/organizer/payouts/summary` + `balanceRows`; sin Stripe → "Conecta Stripe para cobrar") y Ajustes; abren v1 hasta la 1b.5. Finanzas y Comunicaciones no se muestran (no existen; fase 4). i18n `manage.*`, `tabs.manage`.
- Panel como el prototipo en teléfono: "+" blanco arriba (crear evento), tarjeta hero (logo sobre su color, rol, Stripe, Total de ingresos / Total de eventos), selector Actuales/Pasados solo si hay de los dos, búsqueda solo con más de 4 eventos; sin chip "Gestionar".
- Idioma: la app pedía el idioma una sola vez (`staleTime: Infinity`), así que un cambio hecho en la web con la app abierta nunca llegaba. Ahora se relee al volver la app al frente (`AppState`) y un fallo se registra en consola (`[i18n] Failed to read…`). [Probable] era la causa; si persiste, el log lo dirá.

**Notificaciones de organizador (respuesta):** existen `new_rsvp_request` y `ticket_sold` (owner/admin). Se guardan en `notifications` aunque no haya push y se ven en la campana del encabezado de la app (lado asistente). Cómo provocarlas: `FASE_1B…` → "Notificaciones de organizador". Pendientes anotados: textos de notificación fijos en inglés (D4 pide el idioma del usuario) y enlaces profundos que van a v1 (`/(tabs)/rsvp`, `/(tabs)/events-management`) → apuntarlos a v2 en la 1b.3 / 1b.7.

**Verificado:** jest app 28/28 (marco 5, Manage 3, panel 6, evento 10, base 4); vitest lib 369/369; tsc app 40. **No verificado:** aspecto en el celular.
**Pendiente de decisión:** aplicar Manage y la limpieza de ajustes también a la web v2 (sidebar con "Manage" como el prototipo).

### 10-23 (cont.)
- Idioma: releer al volver al frente **no actualizó** en el celular de Kevin. Decisión de Kevin: leerlo solo al arrancar (se quitó el `AppState`, `staleTime: Infinity`). [Probable] si tampoco funciona en frío hay un fallo de lectura (GET devuelve "en" o falla) → prueba en frío en `FASE_1B…` Ronda 1.
- `WARN [notifications] Permission not granted…`: permiso del sistema denegado (el manifest sí declara `POST_NOTIFICATIONS`); inofensivo, sin cambios.
- **Decisión de Kevin:** el hub Manage y la limpieza de ajustes en la web v2 se hacen **después de la 1b.5**, reutilizando el mismo diseño en web y app.
- Idioma al arrancar: Kevin marcó la prueba en frío como correcta (el organizador v2 sale en español).

## Entrega 1b.2b (2026-10-23): resto de herramientas del evento
- Pestañas v2 en la app: `PromotersTab` (crear/copiar/borrar; enlace público con `PUBLIC_SITE_URL` = `EXPO_PUBLIC_APP_URL` o **https://www.flme.co** — con `www` para no caer en la trampa de redirección de ESTADO §1.4; v1 usaba `https://flme.co`), `PromotionsTab` (chips de % `PROMO_DISCOUNT_OPTIONS`, límite), `SendTab` (3 pasos gratis/transferencia, sin cuenta, etapa, precio propio, historial), `ScannersTab` (cuentas + código; en la app, botón "Escanear tickets ahora" en lugar del aviso web) y `CohostsSheet` (hoja con actuales, búsqueda y agregar/quitar). Ya no queda ninguna pestaña que abra v1 (se quitaron `eventV1` y los textos temporales).
- Piezas nuevas en `components/v2/ui.tsx`: `Button`, `Field`, `ErrorText`, `SuccessNote`, `ConfirmDialog` (Modal).
- **API web nueva:** `GET /api/organizations/[id]/cohost-assignments?search=<texto>[&event_id=]` (owner/admin): organizaciones aprobadas por nombre, sin la propia ni los co-organizadores actuales del evento. El modal web (v1/v2) buscaba con el cliente anónimo de Supabase; la app solo usa la API (decisión 10-22). Test `cohost-search.test.ts` (2). `fake-supabase.ts`: `ilike` ahora filtra de verdad (patrón `%`); el resto de la suite organizador sigue verde.
- i18n: `eventAdmin.cohostsSheet.*`, `scanners.scanNow`.
- Co-organizadores en la app solo para owner/admin del dueño (lo que permite la API); en la web el botón se ve para cualquier rol del dueño y la API rechaza al organizer.

**Verificado:** jest app 36/36 (+9 `EventTools.test.tsx`; prueba de mutación: con el precio propio mal enviado o el código visible para organizer, fallan 2); vitest lib 369, web v2 184, API organizador verde (los 6 de `create-payment-intent` ya fallaban, fase 3); tsc app 40, web 0. **No verificado:** aspecto en el celular.
**Siguiente:** 1b.3 RSVPs.

## Ronda 2 de Kevin y 1b.6 adelantada (2026-10-23)
**Reportó**
- **Editar evento** (lleva a v1, incluso "Editar tier"): mejorarlo como el prototipo (captura: flyer con "Cambiar", Nombre, CUÁNDO con filas "Empieza / Termina", DÓNDE con "Lugar / Ciudad", ACERCA DE con contador, tiers, "Guardar cambios" fijo abajo); en la app v1 hay un solo calendario para las dos fechas y alturas/padding desparejos (lugar en dos filas, ciudad con mucho padding). **Fallo v1:** en la app se pueden borrar preguntas de tiers con registros (la web no lo permite). → Todo esto es la **1b.4** (editor v2 con las mismas reglas que la web, que bloquea esas preguntas).
- Enviar tickets gratis: se envió (aparece en Enviados) pero salió "Something went wrong" y quedó en el paso 3 (1 de 2 veces; sin error en la API).
- Escáner: el flash no se apaga; no se ve cuántas entradas de una compra están escaneadas (solo "Escaneado" sí/no) ni las enviadas; owner/admin/organizer no pueden escanear sin código; una persona agregada no tiene por dónde entrar (no es miembro → sin pestaña Escanear; Ajustes → Scan Tickets solo admite códigos). "Centrémonos en el escaneo".
- Teclado: tapa las opciones.

**Diagnóstico**
- Escaneo: el servidor ya permitía todo desde la fase 1 (`GET /api/qr-scanner/events` lista los eventos de la cuenta — miembros, co-organizadores, personas agregadas —, y `verify`/`checkin` autorizan con la sesión). Faltaba la pantalla de la app: el escáner v1 **siempre** pide código para elegir el evento. Era la 1b.6 → **adelantada**.
- Flash: el botón v1 cambia bien el estado y el código nativo de expo-camera 17 aplica `enableTorch`; [Probable] fallo nativo del celular. En v2, apagar el flash **remonta la cámara** (siempre arranca apagado).
- Enviar tickets: la API crea los tickets y **después** espera el correo antes de responder; la app corta a los 15 s; en desarrollo la primera llamada compila la ruta (20–25 s). [Probable] causa. 
- Teclado: Android usa `adjustResize` → la barra flotante sube y tapa campos/botones.

**Hecho**
- **Escáner v2** (`app/v2/scanner.tsx`, `components/v2/scanner/ScannerApp.tsx`): lista por cuenta (abre directo si hay uno solo en curso), cámara, resultado de color (válido / ya registrado / otro evento / no válido / error), registrar entrada, escaneos recientes, flash con remontaje al apagar, permiso de cámara denegado → "Abrir ajustes", enlace al escáner con código (v1 público). Lógica de `packages/lib` (`parseTicketQr`, `scanResultKind`, `scanErrorKind`, `scannerEventList`, `isHappeningNow`) y textos `scanner.*` de la fase 1 (+ `codeLink`, `cameraDenied`, `openSettings`, `signInHint`).
- Entradas: pestaña Escanear del organizador (ahora para **cualquier miembro**, como permite `scan-access.ts`) → `/v2/scanner?org=`; Escáner del evento → `?event=`; **Ajustes → Scan Tickets con sesión → `/v2/scanner`** (sin sesión, el de código como antes). Resuelve a la persona agregada.
- **Compras con asistencia** (web y app): `packages/lib/src/organizer/attendance.ts` (`attendance()`: ventas + transferencias + envíos gratis agrupados, origen, escaneados por fila y total; 3 tests). API: `Purchase.scannedCount` (`purchase-data.ts`) y `checked_in_count` en transferencias (`bank-transfer-data.ts`, antes solo el primer ticket); campos nuevos, los viejos no cambian. Tabla web (`PurchasesTab`, columnas Origen / Escaneados, total) y lista de la app. i18n `eventAdmin.purchases.colOrigin|colScanned|origin.*|scannedOf|totalScanned`. El XLSX sigue siendo solo ventas con tarjeta.
- **Enviar tickets**: `apiClient` acepta `timeoutMs`; los envíos esperan 60 s; si no hay respuesta → `eventAdmin.send.unsure` ("puede que sí se haya hecho, revisa Enviados") + refresco, en vez de invitar a reenviar.
- **Teclado**: `hooks/v2/useKeyboardVisible.ts`; el marco oculta la barra inferior al escribir y usa `KeyboardAvoidingView` en iOS; la hoja de co-organizadores sube con el teclado.

**Verificado:** jest app 43/43 (Scanner 5, EventTools 11 incl. compras y envío sin respuesta, marco 5, evento 9, panel 6, Manage 3, base 4); vitest lib 372 (+3 attendance), API organizador 236, web v2 `EventAdminTabs` 16 + `PurchasesTab` 1 nuevo, `bank-transfer-data` 1 nuevo; tsc app 40, web 0. **No verificado:** cámara y flash reales (Kevin, 📱).
**Orden que queda:** 1b.3 RSVPs → 1b.4 crear/editar evento + tiers (con lo pedido arriba) → 1b.5 Manage → 1b.7 cierre.

## Ronda 3 de Kevin (2026-10-23): teclado de co-organizadores, fecha de tiers y mejoras anotadas
**Reportó**
- Co-organizadores: el teclado sigue tapando la hoja (no sube).
- Web, nuevo tier en un evento existente: dejar inicio/fin de venta en su valor por defecto ("Ahora" / "Cuando termina el evento") y guardar → error "invalid ISO …".

**Diagnóstico**
- Hoja: [Probable] con edge-to-edge de Expo SDK 54 la ventana del `Modal` no se redimensiona en Android y `KeyboardAvoidingView` (`behavior="height"`) no la mueve.
- Tier: [Seguro, por código] `buildTierSave` mandaba `event.ends_at` tal cual lo devuelve la BD (`…+00:00`) cuando el fin de venta queda por defecto; la API valida con zod `.datetime()`, que solo acepta `…Z` → 400 "Invalid input". Los tests usaban fechas con `Z` y no lo veían. Afecta también a editar un tier y volver el fin al valor por defecto. El formulario de crear evento no tiene el fallo (calcula el fin con `toUtc`).

**Hecho**
- `hooks/v2/useKeyboardVisible.ts` → `useKeyboardHeight()`; `CohostsSheet` en Android se levanta por la altura del teclado (si el equipo sí redimensiona la ventana, resta lo que ya encogió para no subir doble). iOS sigue con `KeyboardAvoidingView`.
- `packages/lib/src/organizer/tier-editor.ts`: el fin del evento se normaliza a ISO con `Z` (`utcIso`) antes de enviarlo (POST y PATCH). +2 tests con el formato real de la BD.
- Web `TierEditor`: si la API rechaza `sales_start`/`sales_end`, muestra `eventForm.errors.salesDatesRejected` ("Revisa las fechas de venta…") en vez de "Invalid input".

**Verificado:** vitest lib `organizer-tier-editor` 21/21 (los 2 nuevos fallan sin el arreglo); web v2 `TierEditor` + `EditEvent` 37/37; jest app 43/43 (una primera corrida en frío dio 2 fallos por tiempo y la repetición pasó entera); tsc app 40, web 0. La copia Linux de la VM se recreó (`~/linux/Flme`; `pnpm install` en tramos de <3 min porque la VM mata procesos en segundo plano). **No verificado:** la hoja con teclado en el celular (📱 Kevin, PruebasReales Ronda 3).

### Mejoras anotadas (Kevin, 10-23) — sin implementar
1. **Búsqueda de personas unificada** (enviar tickets, cuentas de escáner, equipo y cualquier campo que busque usuarios): hoy `GET /api/organizer/search-users` y `POST …/scanners` exigen el **email exacto**. Kevin pide sugerencias mientras se escribe: sin "@" → por nombre/usuario; con "@" → por email completo. Refactor a un solo componente (web y app) + un endpoint.
   - **Riesgo (Claude):** una búsqueda parcial sobre *todos* los usuarios permite que cualquier owner/admin/organizer de cualquier organización (basta una membresía) liste nombres y emails de toda la base de Flame. El email exacto era intencional. **Propuesta:** sugerencias parciales solo entre personas ya relacionadas con la organización (compradores/RSVPs de sus eventos, miembros, escáneres y destinatarios anteriores); fuera de ese círculo, solo coincidencia exacta de email. Mínimo 2–3 caracteres, límite de resultados y rate limit. **Pendiente de decisión de Kevin.**
   - Cuándo: propuesta antes de la 1b.5 (Equipo lo reutiliza).
2. **Tiers — fechas por defecto:** corregido arriba en web. En la app, el editor de tiers v2 es parte de la **1b.4**: debe usar los mismos valores por defecto ("Ahora" / "Cuando termina el evento") y la misma `buildTierSave` (ya corregida).
3. **Asistente — Mis tickets (fase 2):** hoy cambiar de ticket recarga desde cero. Cargar de una vez todos los tickets de la compra/evento (p. ej. 4) y pasar entre ellos deslizando (swipe), sin recarga.
