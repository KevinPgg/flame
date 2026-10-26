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
| 1b.5a | Desde **Manage**: Equipo, Pagos, Ajustes de organización + búsqueda de personas restringida (API + migración) | `org-members`, `PayoutsSettingsTab`, `OrganizationSettingsTab` |
| 1b.5b | **Ajustes de usuario únicos** (decisión 10-23); cola de aprobación de organizaciones (soporte) en estilo 2.0; buscador restringido en Enviar tickets y Escáner (web y app) y Equipo web | `account`, `settings`, `SupportAdminSection`, `search-users` |
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

**Verificado:** vitest lib `organizer-tier-editor` 21/21 (los 2 nuevos fallan sin el arreglo); web v2 `TierEditor` + `EditEvent` 37/37; jest app 43/43 (una primera corrida en frío dio 2 fallos por tiempo y la repetición pasó entera); tsc app 40, web 0. La copia Linux de la VM se recreó (`~/linux/Flme`; `pnpm install` en tramos de <3 min porque la VM mata procesos en segundo plano). Kevin probó la Ronda 3 (hoja con teclado y tiers con fechas por defecto): OK.

### Mejoras anotadas (Kevin, 10-23) — sin implementar
1. **Búsqueda de personas unificada** (enviar tickets, cuentas de escáner, equipo y cualquier campo que busque usuarios): hoy `GET /api/organizer/search-users` y `POST …/scanners` exigen el **email exacto**. Kevin pide sugerencias mientras se escribe: sin "@" → por nombre/usuario; con "@" → por email completo. Refactor a un solo componente (web y app) + un endpoint.
   - **Riesgo (Claude):** una búsqueda parcial sobre *todos* los usuarios permite que cualquier owner/admin/organizer de cualquier organización (basta una membresía) liste nombres y emails de toda la base de Flame. El email exacto era intencional. **Propuesta:** sugerencias parciales solo entre personas ya relacionadas con la organización (compradores/RSVPs de sus eventos, miembros, escáneres y destinatarios anteriores); fuera de ese círculo, solo coincidencia exacta de email. Mínimo 2–3 caracteres, límite de resultados y rate limit. **Decisión de Kevin (10-23): restringido** (parcial solo dentro del círculo de la organización; fuera, email exacto). Se puede abrir más adelante si hace falta.
   - Cuándo: propuesta antes de la 1b.5 (Equipo lo reutiliza).
2. **Tiers — fechas por defecto:** corregido arriba en web. En la app, el editor de tiers v2 es parte de la **1b.4**: debe usar los mismos valores por defecto ("Ahora" / "Cuando termina el evento") y la misma `buildTierSave` (ya corregida).
3. **Asistente — Mis tickets (fase 2):** hoy cambiar de ticket recarga desde cero. Cargar de una vez todos los tickets de la compra/evento (p. ej. 4) y pasar entre ellos deslizando (swipe), sin recarga.

## Entrega 1b.3 (2026-10-23): RSVPs en la app
- Rutas `/v2/organizer/rsvps?org=` (lista) y `/v2/organizer/rsvps/[eventId]?org=` (solicitudes); `routes.rsvps` / `routes.rsvpEvent` ya apuntan a v2 (pestaña RSVPs de la barra inferior y botón "Gestionar RSVPs" del evento).
- `components/v2/rsvps/RsvpEvents.tsx` (prototipo `ow:rsvps`): eventos RSVP propios y co-organizados según rol (`rsvpEventLists`), Actuales/Pasados con número, búsqueda sin tildes, tarjeta con flyer, fecha, lugar y pendientes.
- `components/v2/rsvps/RsvpEventDetail.tsx` (prototipo `ow:rsvp`): cabecera, pestañas Todas/Pendientes/Aprobadas/Rechazadas con número (pegadas arriba; abre en Pendientes si hay), aprobar/rechazar con la misma confirmación de la web (cobro de tarjeta / liberar retención), "Aprobar todas" una por una con progreso y Detener, 409 → "otra persona ya la gestionó", detalles de registro en hoja inferior, exportar pendientes a XLSX con datos frescos (exportador v1 → hoja de compartir), evento terminado → aviso sin acciones, evento ajeno o 403 → sin acceso. Sondeo cada 15 s como la web.
- Aprobar captura el pago y manda el correo antes de responder → plazo de 60 s; sin respuesta → `rsvps.unsure` ("puede que sí se haya hecho, la lista se actualizó") en vez de invitar a repetir (mismo criterio que Enviar tickets).
- v1: `rsvp-management` y `rsvp-detail` redirigen a v2 si traen `orgId` (perfil y notificaciones `new_rsvp_request` / `auth_expiry_warning`); sin `orgId` o con `EXPO_PUBLIC_ORGANIZER_V1=true` siguen en v1.
- i18n nuevo: `rsvps.unsure`; icono `eye`.

**Verificado:** jest app 51/51 (+8 `Rsvps.test.tsx`; mutación: con plazo de 15 s o sin el caso "sin respuesta" fallan 2); `EventAdmin` actualizado (Gestionar RSVPs → v2); vitest lib 374/374; tsc app 40 (sin nuevos). **No verificado:** aspecto y cobro real en el celular (Kevin, PruebasReales §1b.3).
**Siguiente:** 1b.4 crear/editar evento + editor de tiers.

## Entrega 1b.4 (2026-10-23): crear / editar evento y editor de tiers en la app
Kevin: "empiézala; faltan pruebas, las hacemos en la siguiente entrega" → pruebas reales de 1b.3 y 1b.4 juntas.
- **Kit de formulario** `components/v2/form/`: `ui.tsx` (Section, Group, Row, Labeled, Input, MoneyInput, SwitchRow/Toggle, `DateTimeRow` y `OptionalDateRow` con el selector del sistema — Android: fecha y luego hora; iOS: rueda en hoja — siempre en la zona del evento, `ViewerTimeHint`, `SelectRow` en hoja), `CityField` (sugerencias de `GET /api/places/autocomplete`, como la web), `FlyerPicker` (galería → 4:5 1080×1350 JPEG con `processEventImageTo4x5` de v1; se sube al guardar), `FormScreen` (scroll + barra de acción fija; en Android se levanta sobre el teclado con `useKeyboardLift` y la barra se oculta al escribir), `TierFields`, `QuestionsBuilder`.
- `hooks/v2/useKeyboardVisible.ts`: `useKeyboardLift()` (lo que antes estaba dentro de la hoja de co-organizadores; la hoja ahora lo usa).
- **Editar evento** (`/v2/organizer/event/[id]/edit`): flyer con "Cambiar"/quitar, nombre fijo, CUÁNDO con filas **Empieza / Termina separadas** (pedido de Kevin: v1 tenía un solo calendario), DÓNDE lugar/ciudad en filas de la misma altura, ACERCA DE con contador, tiers → pestaña Tiers, ajustes fijos; "Guardar cambios" siempre abajo. Solo envía lo que cambió; cambio de fecha pide confirmación; fechas bloqueadas a <2 h; co-organizado / viewer → no editable.
- **Editor de tier** (`/v2/organizer/event/[id]/tiers/[tierId|new]`): misma lógica que la web (`buildTierSave`, ya con la fecha en `Z`), preguntas nuevas al evento primero (fijando los tiers "todas las preguntas"), reducción forzada con confirmación, borrar bloqueado con ventas o si es el único tier. **Quitar una pregunta guardada solo la saca de este tier**: el evento la conserva con sus respuestas (fallo v1 reportado por Kevin en ronda 2).
- **Crear evento** (`/v2/organizer/create`, owner/admin): flyer → nombre (enlace automático) → cuándo (fin sugerido +5 h) → dónde → acerca de → tiers (agregar/quitar, etapas, preguntas si RSVP) → invitados (RSVP) → ajustes (enlace, moneda y zona en hojas). Publicar valida y hace scroll al primer error; `POST /api/events` con el mismo payload que la web, luego flyer; si falla solo el flyer, "Ir al evento".
- Rutas: `routes.editEvent`, `routes.tier`, `routes.createEvent` → v2 (botones del detalle del evento, Tiers y "+" del panel). `event/[id].tsx` pasó a `event/[id]/index.tsx`. v1 `edit-event` y `(tabs)/create-event` redirigen a v2 si traen `orgId` (con `EXPO_PUBLIC_ORGANIZER_V1=true`, v1).
- i18n nuevo: `eventForm.pickDate`, `flyerPermission`, `flyerHintApp`, `notAllowedCreate`; iconos `up`.

**Verificado:** jest app 61/61 (+10 `EventForms.test.tsx`: editar solo lo cambiado, confirmación de fecha, no editable; tier nuevo con fin en `Z`, cupos bajo lo vendido, reducción forzada y luego el resto, quitar pregunta guardada solo del tier; crear con huecos no envía, crear completo = payload web, organizer no crea; mutación sin la confirmación de fecha → falla 1); tsc app 40 (sin nuevos). **No verificado:** selectores de fecha nativos, galería y subida del flyer, teclado en Android (Kevin, PruebasReales §1b.4).
**Siguiente:** pruebas reales 1b.3 + 1b.4; luego 1b.5 (Manage: equipo, pagos, ajustes; búsqueda de personas restringida).

## Entrega 1b.5a (2026-10-23): Manage → Equipo, Pagos, Ajustes de organización + búsqueda de personas restringida
Kevin: "sigue, luego probamos; actualiza el checklist". La 1b.5 se parte: **1b.5a** (esta) y **1b.5b** (ajustes de usuario únicos, cola de aprobación de soporte en estilo 2.0, buscador de personas en Enviar tickets y Escáner — web y app — y en Equipo de la web).
- **Búsqueda restringida** (decisión de Kevin 10-23): migración `supabase/migrations/20261023180000_search_org_people.sql` → función `search_org_people(org, texto, límite)` (SECURITY DEFINER, solo `service_role`): coincidencias parciales por nombre o email **solo** entre miembros, compradores (`orders`), solicitantes de RSVP, escáneres (`event_scanners`) y destinatarios de tickets enviados (`promotional_tickets` por email) de los eventos de la organización; comodines `%`/`_` escapados; mínimo 2 caracteres, máximo 20. API `GET /api/organizer/people?organizationId=&q=` (owner/admin/organizer de esa organización): círculo + **email exacto** para cualquier otra persona (`related: false`). [Seguro, por parser] la SQL es válida (pglast); [no verificado] contra una base real → Kevin aplica la migración.
- **API** `GET /api/organizations/[id]`: perfil de la organización (instagram, ciudad, descripción, logo) para cualquier miembro, con su rol — la app no lee Supabase directo. Tests `people-search.test.ts` (4).
- **App** `components/v2/people/PeoplePicker.tsx` (sugerencias mientras escribes, "Encontrado por e-mail" fuera del círculo), `components/v2/Sheet.tsx` (hoja inferior genérica que sube con el teclado).
- **Equipo** (`/v2/organizer/team`): miembros con rol y eventos asignados, "(tú)"; owner/admin: "+" agregar (PeoplePicker + rol), por miembro (no owner): cambiar rol, asignar eventos (organizer), quitar con confirmación (quitarte a ti mismo → Mis organizadores). Organizer/viewer: solo lista.
- **Pagos** (`/v2/organizer/payouts`, owner/admin): conectar Stripe con país / terminar configuración (abre Stripe en el navegador; al volver se relee el estado), saldo disponible y "disponible pronto" por moneda, pedir pago con confirmación y clave de idempotencia, 409 → "ya hay uno en camino", historial, banco y "Gestionar en Stripe".
- **Ajustes de la organización** (`/v2/organizer/settings`): logo (galería con recorte cuadrado, mínimo 400×400, re-codificado ≤1024 px JPEG; quitar con confirmación), nombre fijo, Instagram, ciudad, descripción con contador; guardar solo lo del perfil (`PATCH /api/organizations/[id]`). Organizer/viewer: solo lectura.
- Manage: las tres filas abren v2 (`routes.team|payouts|settings`). Ya no queda ninguna ruta del organizador apuntando a v1 (`v1()` eliminado de `routes.ts`).
- i18n nuevo: `people.*`, `payouts.ownersOnly`; iconos `clock`, `camera`; `useMe` devuelve también el email (para "(tú)").

**Verificado:** jest app 71/71 (+10 `Manage.test.tsx`; `ManageHub` actualizado; mutación: sin clave de idempotencia → falla 1); vitest API organizador 240/240 (+4), lib 374/374; tsc app 40 (sin nuevos), web 0. **No verificado:** la función SQL contra la base, Stripe real, galería/logo, aspecto en el celular.
**Siguiente:** 1b.5b.

## Entrega 1b.5b · Ajustes únicos (2026-10-26)
Kevin: "termina ajustes y luego comienzo con las pruebas". De la 1b.5b se hizo **Ajustes**; quedan para después de la ronda de pruebas: cola de aprobación de soporte en estilo 2.0 y el buscador restringido en Enviar tickets / Escáner (web y app) y Equipo web.
- **Un solo Ajustes** (`/v2/settings`, `components/v2/settings/UserSettings.tsx`), decisión 10-23: Cuenta (foto, nombre, e-mail de `GET /api/user/profile`; cambiar/quitar foto con `/api/upload-profile-image`; "Contraseña, correos y seguridad" → portal de cuenta de Clerk en el navegador), Idioma (en/es, se aplica al momento y se guarda), Notificaciones (como asistente; como organizador solo si perteneces a alguna organización; "Ticket recibido" siempre activa), Escanear tickets (con sesión → escáner por cuenta; sin sesión → con código), Ayuda y legal (Soporte v1, privacidad, términos, compra, cookies), Cerrar sesión, Eliminar cuenta (dos confirmaciones, Apple 5.1.1(v)), versión. Sin sesión: solo escanear con código, legal e "Iniciar sesión".
- **Notificaciones por API** (antes la app escribía `users.notification_preferences` directo en Supabase): `GET/PUT /api/me/notification-preferences`; reglas en `packages/lib/src/utils/notification-preferences.ts` (faltante = activa, "ticket recibido" forzada, solo tipos conocidos con booleanos). Tests: lib 2, API 3.
- **Portal de Clerk:** `lib/v2/clerk-portal.ts` deduce la URL desde la clave pública (`clerk.flme.co` → `https://accounts.flme.co/user`; dev `x.clerk.accounts.dev` → `https://x.accounts.dev/user`); `EXPO_PUBLIC_CLERK_ACCOUNT_URL` lo sobrescribe. [Probable] es la convención de Clerk; se confirma en la prueba real.
- **Entradas v1 → v2** (con `EXPO_PUBLIC_ORGANIZER_V1=true` siguen v1): `/settings` (engranaje del encabezado) y `/notifications-settings` → `/v2/settings`; `/account` personal (Perfil) → `/v2/settings`; `/account?tab=organization|payouts&orgId=` → Ajustes / Pagos de esa organización en Manage.
- Corrección encontrada por los tests: si cerrar sesión fallaba tras borrar la cuenta en el servidor, la pantalla decía "no pudimos eliminar" → ahora siempre sale (la cuenta ya no existe).
- i18n nuevo `userSettings.*`.

**Verificado:** jest app 77/77 (+6 `UserSettings.test.tsx`); vitest lib 376, API organizador 243; tsc app 40, web 0. **No verificado:** portal de Clerk, foto real, borrado real de cuenta (Kevin, con una cuenta de prueba).

## Ronda 3 · primeras correcciones (2026-10-26)
**Reportó Kevin:** (1) Editar evento sin el fondo difuminado; "Acerca de" se sobrepone a Tiers y debería ser más alto. (2) Cambiar flyer en la app: `[api] Upload network error: POST …/api/upload-image Network request failed`. (3) Teclado: dejar ~5 px entre campo y teclado. (4) Nuevo tier: el campo del nombre ("Tier n") se ve cortado. (5) Editar tier: los chips de preguntas conocidas no agregan con un toque (mensaje cortado: "solo sirve…"). (6) Manage → elegir persona no encuentra nada y el log muestra `GET /api/organizer/people…` muchas veces. (7) ¿Cómo se valida el conflicto de organizaciones que comparten cuenta de depósito?

**Diagnóstico y cambios**
- (1) `FormScreen` acepta `backdrop` (flyer difuminado + degradado, como la cabecera del detalle); Editar y Crear evento lo usan. El campo multilínea tenía `h-11` fijo + clases de alto en conflicto → el texto se desbordaba sobre la sección siguiente. `Input` multilínea ahora crece desde `minHeight: 140` (sin alto fijo).
- (4) [Probable] Android recortaba texto de 17 px en un campo de 40 px por el padding vertical por defecto → `Input` de una línea sin padding vertical; nombre del tier en `h-12`.
- (3) `useKeyboardLift` suma `KEYBOARD_GAP` = 8 px cuando hay teclado (formularios y hojas).
- (6) [Seguro, reproducido en test] **bucle de búsqueda**: el `t` de i18n se recreaba cada vez que cambiaba el callback de guardado de idioma (que sigue al `getToken` de Clerk); el efecto del buscador dependía de `t`/`getToken` → se re-ejecutaba en cada render. Arreglado en la raíz (`t` memoizado solo por idioma, `LanguageProvider` con `getToken` en ref) y en `PeoplePicker` y `CohostsSheet` (refs). Test `PeoplePicker.test.tsx`: con el código anterior 6 llamadas, ahora 1. Además el email exacto fuera del círculo se busca **sin distinguir mayúsculas** (`ilike` sin comodines; antes `eq` sobre minúsculas fallaba con emails guardados con mayúsculas). Validación del buscador: 2+ caracteres, 300 ms de espera, solo owner/admin/organizer de esa organización, parcial solo en el círculo (función SQL), fuera de él email exacto.
- (2) Mismo envío que la app v1 (multipart, Bearer). [No determinado]. Se agregó `uploadFlyer()` compartido: verifica que el archivo exista, registra tamaño y estado (`[flyer] upload failed {…}`) y **reintenta una vez** si es fallo de red puro. Pendiente: log de la terminal de la web en ese momento y si el cambio de flyer de la app v1 funciona en el mismo celular (para separar app / red / servidor).
- Encontrado al corregir (2): en Crear evento la función local `uploadFlyer` tapaba la importada y se llamaba a sí misma (se colgaba al publicar con flyer). Corregido + tests "con flyer" en crear y editar (con reintento).
- (5) En test el chip agrega con un toque → la lógica está bien; en el celular puede ser el toque. Chips con área de toque mayor (`h-9`, `hitSlop`) y realce por `style` en vez de `active:` de NativeWind. Falta que Kevin complete la frase.
- (7) [Seguro, por código] cada organización crea **su propia cuenta Express de Stripe** al conectar (`/api/stripe/connect/onboard`, `stripe_account_id` por organización con bloqueo optimista): saldos y pagos nunca se mezclan, aunque usen el mismo banco para depositar (Stripe lo permite). Lo que **no** está protegido: la BD no exige `stripe_account_id` único; si dos organizaciones quedan con el mismo id (copia del seed, edición manual) compartirían saldo y una podría retirar el dinero de la otra. Propuesta pendiente de decisión: revisar duplicados y agregar índice único parcial.

**Verificado:** jest app 81/81; vitest people-search 4/4; tsc app 40.

### 10-26 (cont.) · Asignar eventos solo por iniciar
- Kevin: en Manage → Equipo → Asignar eventos no deben salir eventos viejos, solo por iniciar.
- `assignableEvents` (lib, usado por web y app) ahora ofrece solo eventos que **aún no empiezan** (ni en curso ni sin fecha), del más cercano al más lejano.
- Riesgo evitado: `PUT /api/organizations/[id]/event-assignments` **reemplaza** toda la lista del organizador; si solo se ocultaban los pasados, guardar habría borrado en silencio sus asignaciones viejas (y su acceso a ventas/asistentes de esos eventos). Nuevo `assignmentsToSave(seleccionados, ofrecidos, actuales)`: lo marcado + las asignaciones actuales a eventos que ya no se ofrecen. El contador "N seleccionados" cuenta solo los visibles.
- Tests: lib team 6/6 (+1), web `Team.test.tsx` 15 (+1), app `Manage.test.tsx` 11 (+1). jest app 82/82, vitest lib 377; tsc app 40, web 0.
- **Ajuste (Kevin, 10-26):** también se pueden asignar eventos **en curso**. Regla final: se ofrecen los eventos que **no han terminado** (por iniciar y en curso; sin fin conocido, decide el inicio), del más cercano al más lejano; los terminados no salen y sus asignaciones se conservan al guardar. Tests lib/web/app actualizados (app incluye un evento en curso visible).

## Cierre de la 1b (2026-10-26): 1b.5b restante + 1b.7
Kevin eligió **cerrar la 1b** antes de abrir otra fase.

**Buscador restringido en todas partes** (decisión 10-23)
- App: `PeoplePicker` con espacio `noAccount(email)` (para "crear orden sin cuenta"); usado en **Enviar tickets** (gratis y transferencias) y **Escáner → cuentas** (además de Equipo). `SendTab` recibe `organization`.
- Web: nuevo `app/v2/components/PeoplePicker.tsx` (mismo comportamiento, `fetch` con espera de 300 ms y respuestas viejas descartadas); usado en **Equipo → Agregar**, **Enviar tickets** y **Escáner**. `GET /api/organizer/search-users` (email exacto) ya no lo usa v2; queda para v1.
- Tests: web `SendTab` 21, `ScannersTab` 8, `Team` 15 reescritos al flujo nuevo; app `EventTools` 11 adaptados.

**Cola de aprobación de soporte en estilo 2.0** (app)
- `/v2/support/organizations` (`components/v2/support/OrgApprovals.tsx`): Pendientes / Rechazadas con número, búsqueda (más de 4), tarjeta (dueño, fecha, motivo si fue rechazada), Aprobar (confirmación), Rechazar con motivo opcional (hoja), Eliminar (confirmación). Mismos hooks y API admin (`useAdminOrganizations`, el servidor decide quién es soporte). En el Perfil, solo para soporte, una entrada "Aprobación de organizadores · N esperando revisión" en lugar de los acordeones v1 (v1 vuelve con el interruptor). i18n `supportQueue.*`. Test `OrgApprovals.test.tsx` (4).
- Web: la cola de soporte sigue siendo v1 (entra en la limpieza web de Manage/Ajustes).

**1b.7 cierre**
- Enlaces de notificaciones: **ticket vendido** llevaba a la lista v1 de eventos (sin redirección, el servidor no mandaba evento ni organización). Servidor (`lib/orders.ts`): `data` ahora incluye `eventId` y `orgId` (aditivo). App (`lib/notification-deep-links.ts`): ticket vendido → `/v2/organizer/event/{id}?orgId=…&tab=purchases`; notificaciones viejas sin datos → panel de la organización o Mis organizadores, nunca la lista v1. Test `deep-links.test.ts` (3). Nueva solicitud de RSVP ya iba a v2 por la redirección de `rsvp-detail`.
- Pantallas v1 sin redirección que quedan: `org-event-detail`, `org-members`, `(tabs)/events-management` → solo se llega desde el organizador v1 (interruptor) o el mapeo ya corregido. Todas las redirecciones nuevas respetan `EXPO_PUBLIC_ORGANIZER_V1=true`.
- **Paridad web ↔ app del organizador v2:** panel, detalle de evento (Tiers, Compras con asistencia, Desglose, Promotores, Códigos, Enviar tickets, Escáner, Co-organizadores), RSVPs, crear/editar evento y tiers, Equipo, Pagos y Ajustes de organización: **iguales** (mismas APIs y reglas de `packages/lib`). Diferencias **a propósito**: escanear solo en la app (decisión 10-16); la app no tiene menú lateral (Manage). Diferencias **pendientes**: la web aún no tiene el hub Manage ni los Ajustes únicos ni la cola de soporte 2.0 (siguiente paso acordado 10-23); textos de notificaciones solo en inglés (D4, pendiente).

**Verificado:** jest app 89/89; vitest API organizador + compra 301, web v2 (SendTab, ScannersTab, Team, EventAdminTabs, V2Boundaries, Rsvps) verdes; tsc app 40, web 0.
**Estado:** el código de la fase 1b está completo. Falta la **ronda 3 de pruebas reales** (1b.3–1b.7) para cerrarla.
