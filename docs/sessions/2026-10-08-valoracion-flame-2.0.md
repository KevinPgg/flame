# 2026-10-08 — Valoración Flame 2.0

**Qué se hizo:** análisis de la carpeta `flame-2.0/` (prototipo HTML del rediseño, datos mock) contra el código y la BD actuales. Documento completo: `docs/features/FLAME_2_0_VALORACION.md`.

**Hallazgos clave:**
- `flame-2.0/` es una especificación visual en un solo `index.html` (JS vanilla), no código reutilizable: el front se reescribe en Next/Expo.
- Stage 1 = mismas funciones, rediseñadas; Stage 2 (flag `FX`) = transferencias, social, recaps, mapa, add-ons → fuera de alcance.
- El prototipo pone al **organizador solo en web responsive** y la app solo para asistentes (el botón "Manage" abre la web). Hoy la app iOS tiene herramientas de organizador y va por delante de la web → decisión D1 pendiente.
- La mayoría es solo front. Ítems con migración: follows, saved events, line-up/artistas, categorías, búsqueda ampliada, invitaciones de equipo (estado "Invited"), numeración de tickets (toca el RPC de compra), preferencias de usuario.
- Ya existen en BD: `notifications`, `checkins`, visibilidad/sold-out de tiers, `stripe_fee_cents`, `logo_url`/`cover_image_url` de org.
- Breakdown financiero agrava el N+1 de revenue si no se hace batch antes.

**Plan propuesto:** F0 decisiones + tokens → F1 organizador web → F2 asistente → F3 checkout/códigos (fix bug promoter antes) → F4 funcionalidad nueva con migraciones → F5 QA/release. Estimación baja-confianza: 3–4,5 meses con 1 persona a tiempo completo.

**Pendiente de Kevin:** D1 dónde vive el organizador · D2 relación con la versión base `Flme_comp/` · D3 staging/tests antes de F3–F4 · D4 idioma/i18n.

## Decisiones de Kevin (misma fecha, 15:31)
- D1: el organizador debe verse y funcionar desde la app (pantallas nativas, no web embebida).
- D2: Flame 2.0 reemplaza a `Flme_comp/`. Mientras tanto `Flme_comp/` queda congelada como referencia de comportamiento.
- D3: este proyecto ya es el entorno de desarrollo (fuera del git de producción, commits propios que Kevin pasará a limpio). Se agrega: tests de integración de los RPC de compra (fase 0) y un ensayo final de migraciones + TestFlight sobre staging (fase 5).
- D4: inglés por defecto como el prototipo, con selector de idioma (en/es) en Ajustes → i18n desde la fase 0, preferencia en `users.language` (incluye emails y push).
- Estimación revisada [Adivinando]: 4,5–6 meses con 1 persona a tiempo completo.

## Aclaraciones de Kevin (16:02)
- D2: `Flme_comp/` no se toca; queda como referencia de la versión antigua. "Reemplazar" = Flame 2.0 se construye con código nuevo.
- D3: hoy Kevin prueba la app mobile con `npx expo start` en `apps/mobile` y la usa en `localhost:8081` → eso es **Expo web en el navegador**, no la app nativa. Pago con Stripe nativo (`@stripe/stripe-react-native`), cámara del scanner (`expo-camera`), push (`expo-notifications`) y `expo-secure-store` no se comportan igual o no funcionan en web (solo hay 3 ramas `Platform.OS === 'web'` en mobile). Plan: Expo web para iterar UI; build local Android (ya resuelto el 07-15) para lo nativo; build iOS (EAS, no hay Mac) solo para el ensayo final, porque producción es solo iOS.
- D4: de acuerdo (inglés por defecto + selector en/es).

## Fase 0 — hecha (2026-10-08)
Todo aditivo: ninguna pantalla actual cambia. Verificado en un Postgres 16 + PostgREST locales con las 65 migraciones aplicadas.

| Pieza | Archivos | Verificación |
| --- | --- | --- |
| Tokens v2 | `packages/lib/src/design-tokens/flame-v2.ts`, namespace `v2-*` en `packages/ui/tailwind.config.js`, fuentes v2 en `apps/web/tailwind.config.ts` | Test de sincronía `design-tokens-v2.test.ts`; Tailwind 3 genera `bg-v2-ink`, `rounded-v2-card`, `font-v2-display`; tokens v1 intactos |
| i18n | `packages/lib/src/i18n/` (en/es tipados, `translate`, plurales, `resolveLanguage`), `apps/web/app/lib/i18n.tsx`, `apps/mobile/lib/i18n.tsx` (provider + `useI18n`) | `i18n.test.ts`; TypeScript falla si `es.ts` no tiene todas las claves o si se usa una clave inexistente. Sin librerías nuevas |
| Idioma del usuario | `supabase/migrations/20261008170000_add_users_language.sql` (`users.language` en/es, default en) | Aplicada sobre las 65 migraciones; CHECK rechaza otros valores; idempotente |
| Tests de holds | `apps/web/__tests__/integration/purchase-holds.test.ts` (15 tests) | 15/15 verdes contra PostgREST + Postgres; una mutación del RPC (quitar límite por usuario) los pone en rojo |

`packages/lib`: tsc 0 errores, 195/195 tests (antes 176).

**Hallazgo (bug real, no corregido):** el "Sold out" manual del organizador (`is_manually_sold_out`) solo se respeta en la UI. Ni `atomic_create_hold_with_stage_validation` ni `POST /api/holds/create` lo validan → una llamada directa a la API puede reservar y comprar un tier marcado como agotado. Documentado con `it.fails` en el test. Corregir en fase 3 (o antes si Kevin lo prioriza).
**Observación menor:** un tier `is_hidden` sin `secret_code` también se puede reservar por API (la ruta solo exige código si existe).

**Pendiente de Kevin (en su PC):**
1. `supabase migration list` (verificar que las 65 existentes figuran como aplicadas) y luego `supabase migration up` para aplicar solo la de idioma. **No usar `supabase db reset`**: borra la BD y `supabase/seed/` está vacío, se perdería el seed de prod anonimizado (~54k filas).
2. `pnpm --filter @project-flame/lib test` y `pnpm --filter web test:integration` (con `.env.local` apuntando al Supabase local; el test de holds se niega a correr contra `*.supabase.co`).
3. Fuentes para mobile cuando arranque la fase 1: `pnpm --filter mobile add @expo-google-fonts/inter @expo-google-fonts/inter-tight` (no se instaló nada desde aquí: el entorno remoto es Linux y rompería los binarios de Windows en `node_modules`).

**Siguiente:** fase 1 — organizador web. Primera pantalla v2 monta `I18nProvider` y carga Inter / Inter Tight.

## Snapshot de prod en dev y `migration list` (16:37)
- Pauta existente: `2026-07-07-dev-environment-setup.md`. Método = **schema por migraciones** (`supabase db reset`) + **datos de un pg_dump de prod, solo-datos y anonimizado** (`supabase/seed/backup.sql`, ~95MB) cargado con `psql`, + SQL manual (Stripe de orgs a NULL, remapeo de `clerk_id`).
- ⚠️ `supabase/seed/` está **vacía** desde el 2026-07-17: el `backup.sql` ya no está en el proyecto y el script de anonimización nunca se guardó. Si la BD local se borra, no hay cómo recargar esos datos sin un dump nuevo de prod.
- `supabase migration list` sin flags compara contra el proyecto **vinculado en la nube** → "no project ref". Para la BD local: `supabase migration list --local`, o consultar `supabase_migrations.schema_migrations` con psql. **No** hacer `supabase link` contra prod.
- Conteo real: 65 migraciones (igual que `Flme_comp`); el "66" de docs anteriores era un error de conteo.

## Fix sold-out manual + inicio fase 1 (17:09)
**Fix (`supabase/migrations/20261008180000_enforce_manual_sold_out.sql`):**
- `atomic_create_hold_with_stage_validation` y `create_rsvp_atomic` rechazan tiers con `is_manually_sold_out` ("This ticket tier is sold out", mismo mensaje que el inventario → la ruta de RSVP ya lo traduce a 400). Envío de tickets gratis / transferencias del organizador NO se bloquea (a propósito).
- Hallazgo extra (seguridad): el RPC de holds es `SECURITY DEFINER`, recibe `p_user_id` y tenía EXECUTE para `anon`/`authenticated` → con la anon key pública cualquiera podía reservar entradas a nombre de cualquiera (bloquear inventario 30 min en bucle). Ahora solo `service_role` (su único llamador es la API con service role).
- Se eliminaron 2 overloads viejos de `create_rsvp_atomic` (5 y 7 args) sin la validación; nada los llama (la API usa la de 9 args).
- Tests: `purchase-holds.test.ts` 18/18; sin la migración fallan justo los casos nuevos.

**Fase 1 — organizador web v2 (primera entrega):**
- Rutas en `/v2/organizer` (sin `org` = Mis organizadores; con `?org=slug` = dashboard). Mismo esquema de URL que v1 → al publicar se quita `/v2`. `/v2(.*)` protegido en `middleware.ts`.
- Datos: misma API (`/api/organizer/data`) y misma cache de React Query que v1; rol desde el servidor (`selectOrganization`). Reglas (alcance por rol, co-hosts, totales por moneda, búsqueda sin tildes, fecha en la zona del evento) en `packages/lib/src/organizer/dashboard.ts` con tests (lib: 207/207).
- Pantallas que aún no tienen v2 enlazan a v1 desde un solo archivo: `apps/web/app/v2/lib/routes.ts`.
- Verificado: tsc web 0 errores; render en escritorio (1280) y teléfono (412), en/es, con datos simulados.
- Fuentes: Inter / Inter Tight vía `next/font` en `app/v2/layout.tsx`; pesos web en `app/v2/v2.css`.

**Pendiente de Kevin:** `supabase migration up` (aplica el fix) · correr tests · abrir `localhost:3000/v2/organizer` con su usuario.
**Siguiente en fase 1:** detalle de evento v2 (tabs Tiers / Purchases / Breakdown / Promoter links / Promotions / Send tickets).

## Fase 1 — detalle de evento v2 (2026-10-13)
- Ruta `/v2/organizer/event/[id]?org=slug&tab=…`. El dashboard v2 ya enlaza aquí (`routes.event`); "Editar evento", agregar/editar tiers y "Enviar tickets" siguen en v1 (`routes.eventV1`).
- Estructura compartida extraída: `OrganizerShell` (sidebar / barra inferior / selector) y `useOrganizerModel` (misma API y cache que v1).
- Encabezado: flyer con fondo desenfocado, estado (publicado / borrador / finalizado), co-organizadores (modal v1 reutilizado, solo org dueña), indicadores Tickets / Solicitados / Vendidos / Ingresos (mismas fórmulas que v1).
- Pestañas: **Tiers** (vendidos vs total, pendientes, ingresos por tier, interruptores Agotado/Oculto vía `PATCH /api/ticket-tiers`), **Compras** (tabla, búsqueda, Export XLSX con el mismo builder de lib), **Desglose** (NUEVO: tarjeta vs transferencia vs gratis, comisiones, total del organizador, ventas por tier y por promotor), **Links de promotor** (ranking, crear con validación igual a la API, copiar, borrar con confirmación), **Códigos** (tarjetas con barra de uso, Activo/Agotado, alta validada, borrar con confirmación), **Enviar tickets** (abre v1).
- Eventos co-organizados: solo lectura; las ventas las ve el organizador dueño.
- Errores 5xx → mensaje genérico traducido; 4xx → mensaje del servidor.
- Lógica en `packages/lib/src/organizer/event-detail.ts` (lib 217/217). Web tsc 0 errores. Verificado con datos simulados en escritorio y teléfono, en/es, incluidas validaciones, confirmación de borrado y error de API.
- **Siguiente:** "Enviar tickets" en v2 (buscar usuario → tier y cantidad → confirmar; historial al lado), luego RSVPs v2.

## Fase 1 — Enviar tickets v2 (2026-10-15)
- Pestaña **Enviar tickets** del detalle de evento v2 ya no abre v1. Modos **Tickets gratis** (`POST /api/organizer/promotional-tickets`) y **Transferencias** (`POST /api/organizer/bank-transfer-tickets`); mismas rutas y reglas que v1, sin cambios de API.
- Flujo del prototipo en 3 pasos: buscar persona → ticket y cantidad → confirmar; historial "Enviados" al lado (debajo en teléfono).
- Se mantiene lo que v1 hace y el prototipo no muestra: enviar a un email **sin cuenta Flame** (PDF con QR por email), elegir **etapa** en transferencias (preseleccionada la etapa vigente), **precio personalizado** (> 0 y ≤ 10.000, acepta coma decimal).
- Diferencia deliberada con el prototipo: la búsqueda es por **email exacto** (la API no busca por nombre; buscar usuarios por nombre entre todas las cuentas sería una fuga de datos).
- Capacidad: ninguna de las dos rutas bloquea por inventario (override del organizador a propósito). La UI muestra "Quedan N" y avisa si la cantidad supera lo disponible, sin bloquear.
- Historial: las cortesías se guardan una fila por ticket; ahora se agrupan por envío ("3 × General") en vez de listarse una por una. Montos de transferencias con el mismo cálculo legacy que v1.
- Permisos UI: solo owner/admin/organizer de la org dueña ven el formulario; el resto ve el historial.
- **Hallazgo (no corregido):** las dos rutas solo verifican que el usuario sea miembro de la org → un miembro con rol **viewer** puede crear cortesías y órdenes por transferencia llamando a la API. Corregirlo cambia el comportamiento de la app iOS de producción (usa las mismas rutas) → decisión de Kevin.
- Lógica en `packages/lib/src/organizer/send-tickets.ts` (12 tests; lib 229/229). Web y lib tsc 0 errores. Verificado con datos simulados y API falseada: escritorio 1280 y teléfono 412, en/es, solo lectura, email inválido no llega al servidor, payloads correctos, sin scroll horizontal.
- **Siguiente:** RSVPs v2 (lista de eventos con pendientes → detalle con pestañas Todos/Pendientes/Aprobados/Rechazados, aprobar/rechazar, aprobar todos, ver formulario).

### Revisión de código + tests antes del commit (2026-10-15, 14:00)
Pedido de Kevin: revisar y generar los tests que faltan antes de comitear.

**Bugs encontrados y corregidos:**
- **Desglose v2 inflaba "Cobrado por ti" en eventos viejos:** `eventBreakdown` y `salesByTier` sumaban `order_total_cents` de transferencias tal cual. Las órdenes anteriores al 2026-01-15 (migración Stripe Connect) guardaban la comisión dentro del total; v1 la descuenta con `getBasePriceFromTicket`. Nuevo `bankOrderNetCents` en `event-detail.ts`, usado por Desglose, ventas por tier e historial de Enviar tickets. Fecha ausente o inválida → total guardado, nunca rompe la pantalla.
- **Códigos de descuento:** límite de usos vacío mostraba "Algo salió mal". Ahora: "El límite de usos debe ser al menos 1." (`eventAdmin.promotions.limitInvalid`). El 0 ya lo bloquea el navegador (`min=1`).
- **Enviar tickets:** al cambiar de tier con precio personalizado activo se sobrescribía el precio escrito; ahora se conserva, como en v1.
- `personName` / `initialsOf` pasan de SendTab a lib (los usará la app).

**Tests nuevos:**
- lib (`packages/lib/__tests__`): ramas que faltaban en send-tickets, event-detail (montos legacy, capacidad 0, sobreventa, contadores nulos), dashboard (zona horaria nula) e i18n (clave que apunta a un grupo, plural sin `count`, motor sin `Intl.PluralRules`). lib 252/252; cobertura de `organizer/*` + i18n: 100% funciones y líneas, ramas 86% → 98% (lo que queda son fallbacks `|| 0`).
- web (`apps/web/__tests__/v2/`, primeros tests de pantallas v2): `v2-lib.test.ts` (apiErrorMessage, routes, getUserLanguage), `useOrganizerModel.test.tsx` (alcance por rol, organizer sin asignaciones no ve datos sin filtrar, error, invalidación de la cache compartida con v1), `SendTab.test.tsx` (21: permisos, email inválido no llega a la API, normalización, sin cuenta, payloads exactos de cortesía y transferencia con etapa/precio, límites de cantidad, errores 4xx/5xx, doble envío), `EventAdminTabs.test.tsx` (Tiers, Promotores, Códigos: validaciones, PATCH/POST/DELETE, confirmación de borrado, errores). 47/47. `helpers.tsx`: polyfill de `<dialog>` para jsdom y mock de fetch con registro de llamadas.
- Nota de entorno: `__tests__/setup.ts` reemplaza `window.location` por un objeto sin `origin`; el test de copiar link lo define explícitamente.

**Sin tests de componente todavía:** `EventAdmin` (enrutado de pestañas / solo lectura co-host), `PurchasesTab` (export XLSX), `BreakdownTab`, `OrganizerDashboard`, `OrganizersList`, `OrganizerShell`. Su lógica de cálculo sí está cubierta en lib.

**Alcance real de la fase 1 (según `FLAME_2_0_VALORACION.md` §3: "rediseño 1:1 del panel + responsive, fix batch del N+1 antes del dashboard"). Pendiente:**
- Fix N+1 de `/api/organizer/data` (`enrichEventWithStats` hace 2 consultas por evento; `ESTADO_ACTUAL.md` riesgo 1). El plan lo ponía antes del dashboard y no se hizo.
- RSVPs v2 (lista + detalle).
- Pantallas que siguen enlazando a v1 (`app/v2/lib/routes.ts`): crear evento, editar evento + formulario de tiers, equipo, ajustes de organización, payouts, scanner. Hub "Manage organization" / Finance del prototipo.

**Suite web completa (sin BD):** todo verde salvo 3 archivos que **ya fallaban en el commit 93ff208** (comprobado corriendo el código de HEAD): `payment-protection.test.ts` (necesita credenciales Supabase), `purchase-page.integration.test.tsx` (9 fallos) y `api/purchase/create-payment-intent.test.ts` (6 fallos: los mocks no traen la moneda de la reserva → "Hold missing reservation currency"). Son tests desactualizados del camino de pago → revisar en fase 3, no tocados aquí.

## Autorización por evento en la API del organizador (2026-10-15, 15:30)
Decisión de Kevin: un miembro solo actúa sobre lo que le corresponde. Viewer: no hay ningún miembro activo con ese rol.

**Regla** (`canActOnEvent` en `packages/lib/src/utils/permissions.ts`): owner/admin → todos los eventos de su organización; organizer → solo eventos asignados en `event_assignments` **por esa misma organización**; viewer / no miembro → nada. Helper de servidor `apps/web/app/lib/utils/event-access.ts` (`getEventAccess`, `requireEventAccess`, `visibleEventIds`). Error de consulta → 500, nunca "permitido".

**Antes:** todas las rutas solo comprobaban "es miembro de la organización". Un organizer podía, llamando a la API, actuar sobre eventos no asignados, y `/api/organizer/data` le enviaba compras (nombres, emails) de **todos** los eventos (el filtro era solo en el navegador).

**Rutas corregidas** (cambio aditivo: se mantiene el control previo y se agrega el de rol+asignación; la app móvil usa estas mismas rutas):
- Enviar tickets: `POST promotional-tickets`, `GET promotional-tickets/[eventId]`, `POST bank-transfer-tickets`.
- Códigos: `POST/GET promotional-codes`, `DELETE promotional-codes/[id]`. Promotores: `GET/POST promoter-links`, `DELETE promoter-links/[id]`.
- Tiers: `GET/POST/PATCH/DELETE ticket-tiers`, `POST tiers/[tierId]/force-reduce`.
- Eventos: `PATCH /api/events` (rol+asignación); `POST /api/events` (crear) solo owner/admin = `canCreateEvents`, que la web y la app ya aplicaban en la UI.
- RSVPs (listar/aprobar/rechazar vía `canManageEventRsvps`): lado primario pasa de "cualquier miembro" a rol+asignación; se conserva owner/admin de org co-organizadora.
- `GET organizer/data`: el servidor filtra eventos propios y co-organizados a los visibles para el rol.
- `GET organizer/search-users`: solo owner/admin/organizer.

**Tests:** `packages/lib/__tests__/permissions-event-access.test.ts`; `apps/web/__tests__/api/organizer/event-access.test.ts` (129: matriz 7 perfiles × 16 rutas reales sobre BD en memoria `fake-supabase.ts`, crear evento, búsqueda, filtrado de data, helpers, RSVP co-host, fallos de consulta). Prueba de mutación: con el control desactivado fallan 50 → los tests detectan el hueco. lib 261/261; web tsc 0; suite web sin regresiones (siguen solo los 3 archivos de pago que ya fallaban).

**Cambio de comportamiento a comunicar:** un organizer que hoy edite tiers, códigos o eventos **no asignados** (web o app) recibirá 403. Si alguno trabaja así, hay que asignarle esos eventos.

**Fuera de alcance (pendiente de decisión):**
- Scanner (`qr-scanner/checkin|verify`): autoriza por rol de plataforma (`users.role`) + membresía, o por código de puerta del evento. No se tocó: endurecerlo puede dejar sin escanear al personal de puerta la noche del evento.
- Lecturas directas de la app móvil a Supabase (RLS con JWT de Clerk): no auditadas en esta sesión.
- Payouts ya exigían owner/admin; miembros/asignaciones ya exigían owner/admin.

### Corrida de tests en el PC de Kevin (2026-10-15, 16:00)
`npm run test:run` en apps/web: 6 archivos / 18 tests fallidos. Diagnóstico:
- 3 tests de `SendTab` (míos) por **timeout**: en Windows tardan ~2,6× más que en Linux y superaban los 5 s por defecto. Corregido: `userEvent.setup({ delay: null })` y `testTimeout: 20_000` en `SendTab.test.tsx` y `EventAdminTabs.test.tsx` (el más lento: ~3 s Linux ≈ 8 s Windows).
- 15 ya existentes (pagos desactualizados): `create-payment-intent` (6) y `purchase-page.integration` (9) → fase 3.
- 3 archivos de `__tests__/integration/` abortaban por falta de credenciales: `vitest.config.ts` solo lee `.env.local`/`.env.test` y Kevin solo tiene `apps/web/.env`. Corregido separando: `vitest.config.ts` excluye `__tests__/integration/**`; esos corren solo con `npm run test:integration` (su setup sí lee `.env`, que apunta al Supabase local). Ambos tests de integración limpian únicamente sus propias filas.
- Nota: redirigir con `>` en PowerShell guarda UTF-16 y solo stdout (vitest escribe los errores en stderr) → usar `npm run test:run 2>&1 | Out-File -Encoding utf8 run_test.txt`.

## Fase 1 — fix N+1 de `/api/organizer/data` (2026-10-15, 17:00)
**Medido con tests** (BD en memoria que imita PostgREST: corte en 1000 filas, `range`, `neq` sin NULL):
- Antes: 17 consultas con 2 eventos, **137 con 42** (2–4 por evento: RSVPs, órdenes, etapas, registro). Ahora: **13 fijas**.
- Antes, toda lectura de varios eventos se cortaba en 1000 filas **sin error**: con 1500 RSVPs el dashboard mostraba 999 pendientes. Afectaba también stats de promotores (órdenes de toda la org), reservas activas, RSVPs reservados y RSVPs de co-organizados. Ahora todo pagina.

**Cambios:**
- `lib/utils/supabase-pagination.ts`: `selectAllPages` / `selectAllPagesByIds` (páginas de 1000 ordenadas por `id`, `.in()` en trozos de 100). Error en una página → excepción (datos parciales = totales falsos).
- `lib/utils/purchase-data.ts`: `fetchEventPurchasesForEvents` (3 consultas para N eventos); `fetchEventPurchases` queda como envoltorio. Cálculo por orden idéntico (función `toPurchase`).
- `lib/utils/rsvp-stats.ts`: una lectura de RSVPs → conteos por evento + reservado por tier.
- `api/organizer/data/route.ts`: `enrichEventWithStats` pasa a síncrono con datos precargados; propios y co-organizados en lote.
- `app/organizer/page.tsx` (SSR v1, alcance mínimo): filtro por rol (antes metía todos los eventos y compradores en el HTML de cualquier miembro), co-organizados en lote, RSVPs y reservas paginados. Su cálculo propio de compras no se unificó: se elimina con v1.

**Tests:** `purchases-batch.test.ts` (caracterización con valores grabados del código anterior + batch idéntico, consultas fijas, >1000 filas, errores), `organizer-data.test.ts` (respuesta idéntica a la anterior, 2 vs 42 eventos mismas consultas, >1000 filas, error → 500), `organizer-page-ssr.test.tsx` (rol, co-host en lote, >1000). Fixtures: `purchases-fixture.ts`, `organizer-data-fixture.ts`. Mutación: sin el filtro del SSR falla el test del organizer. Web tsc 0; lib 261/261; sin regresiones.

**Pendiente de Kevin:** medir si algún evento real ya pasaba de 1000 filas (si sí, los números que veían estaban mal):
```sql
select 'orders' t, event_id, count(*) n from orders group by event_id having count(*) > 1000
union all
select 'rsvps', event_id, count(*) from rsvps group by event_id having count(*) > 1000
union all
select 'orders_org', e.organization_id, count(*) from orders o join events e on e.id = o.event_id
  where o.promoter_code is not null group by e.organization_id having count(*) > 1000;
```
**Siguiente en fase 1:** RSVPs v2.

## Fase 1 — RSVPs v2 (2026-10-15, 18:00)
**Pantallas:** `/v2/organizer/rsvps?org=` (eventos con RSVP propios y co-organizados, actuales/pasados, búsqueda sin tildes, pendientes por evento) y `/v2/organizer/rsvps/[eventId]?org=` (pestañas Todas/Pendientes/Aprobadas/Rechazadas con conteo, tabla en escritorio y tarjetas en teléfono, aprobar/rechazar, aprobar todas, exportar pendientes XLSX, datos de registro). El menú "RSVPs" del shell y el detalle de evento ("Gestionar RSVPs") ya apuntan a v2.
**Mismas APIs que v1** (`GET /api/organizer/rsvps`, `PATCH .../approve|reject`), misma cache (`["rsvps-poll", id]`, refresco 15 s).

**Decisiones:**
- Aprobar **cobra la tarjeta** (captura de la autorización Stripe en el servidor). La confirmación lo dice con el monto que recibe el organizador; si es gratis dice que se envían los tickets. Rechazar dice que se libera la retención.
- "Aprobar todas" (del prototipo, no existía en v1): confirmación con cuántas son pagadas y total, aprobaciones **una por una** con progreso y botón Detener, resumen (aprobadas / ya gestionadas por otra persona / fallidas con nombres). 409 = otra persona ya la gestionó → aviso, no error.
- Pestaña "Aprobadas" incluye las ya pagadas (`purchased`), como el prototipo; en v1 quedaban ocultas.
- Evento terminado: sin botones de decidir (igual que v1), con aviso.

**Corregido de paso:** `GET /api/organizer/rsvps` cortaba en 1000 solicitudes por evento → ahora paginado (`selectAllPages`).
**Hallazgo (no corregido, camino de pago → fase 3):** `PATCH .../approve` no valida que el evento no haya terminado; solo lo oculta la UI. Por API se puede capturar el pago de un evento pasado.

**Archivos:** lib `organizer/rsvps.ts` (monto, pestañas, quién puede decidir, plan de aprobar todas, datos de registro, lista de eventos; 16 tests) + i18n `rsvps.*` en/es. Web: `v2/organizer/rsvps/*`, `v2/lib/organizer-context.ts` (carga de organización en servidor para páginas v2), `ConfirmDialog` con `detail`, `OrganizerShell` con `section`.
**Tests:** `__tests__/v2/Rsvps.test.tsx` (15: lista, pestaña inicial y conteos, confirmación con cobro/gratis/rechazo, PATCH exacto, 409, 4xx/5xx, aprobar todas con mezcla de resultados, detener, evento terminado, 403, datos de registro, es) + `api/organizer/rsvps-list.test.ts` (1500 solicitudes, error → 500). lib 277/277; web v2 + organizer 212/212; tsc web 0. Revisado visualmente en 1280 y 412, en/es (corregido un desborde de la lista en teléfono).

**Fase 1 — pendiente:** crear evento, editar evento + formulario de tiers, equipo, ajustes de organización, payouts, scanner (siguen en v1 vía `v2/lib/routes.ts`).

## `next build` fallaba por Datafast (2026-10-16)
- Síntoma (PC de Kevin): `Failed to collect page data for /api/datafast/verify-payment` — "Missing required Datafast configuration".
- Causa: `app/api/datafast/verify-payment/route.ts` validaba `DATAFAST_*` **al importar el módulo** (`throw` a nivel superior); el build importa cada ruta, y el `.env` local no tiene credenciales Datafast. Ya existía en `Flme_comp` (archivo idéntico); no lo causaron los cambios recientes. `create-checkout` ya validaba dentro del handler.
- Fix: validación dentro de `POST`, igual que `create-checkout` → sin credenciales responde 500 "Payment system configuration error" en vez de romper el build. Comportamiento con credenciales: idéntico.
- Verificado: las 79 rutas de `app/api` cargan con las variables del `.env` de Kevin (valores ficticios) y sin `DATAFAST_*`; con la versión anterior falla exactamente esa ruta. El `next build` completo no pudo correrse en el entorno de verificación (VM de 4 GB, el proceso murió durante la compilación).
- El aviso `MODULE_TYPELESS_PACKAGE_JSON` de `tailwind.config.ts` es solo de rendimiento; no rompe el build. No se tocó (añadir `"type": "module"` cambiaría cómo Node interpreta todos los `.js` de apps/web).
- Pendiente ya conocido (`ESTADO_ACTUAL.md`): retirar Datafast.

## `upload-image` sin control de rol/asignación (2026-10-16)
- `POST/DELETE /api/upload-image` solo verificaba que el usuario fuera miembro de la organización del evento: un viewer o un organizer no asignado podía subir o borrar el flyer de cualquier evento de la organización.
- Fix: `requireEventAccess` (el mismo de las demás rutas de organizador) después de cargar el evento, en POST y DELETE.
- Tests: matriz de `event-access.test.ts` ampliada a upload-image (7 perfiles × 18 funciones, 143 tests). El fake de Supabase ganó `storage` (upload/getPublicUrl/remove/list). Mutación: quitando el chequeo fallan 6.

## Fase 1 — Crear evento v2 (2026-10-16)
**Pantalla:** `/v2/organizer/create?org=` (solo owner/admin, igual que `POST /api/events`; el resto vuelve al dashboard). El botón "Crear evento" del dashboard v2 ya apunta aquí (`routes.createEvent`).
**Orden del prototipo:** flyer → nombre → cuándo → dónde → descripción → tiers → invitados (RSVP) → ajustes (enlace, moneda, zona horaria) → "Publicar evento". Errores junto a cada campo solo después del primer intento, contador "Corrige N campos", salto al primer error.
**Misma API y flujo que v1:** `POST /api/events`; si hay flyer, se sube después (`POST /api/upload-image` con `eventId`) y se guarda con `PATCH /api/events`. Al terminar abre el evento en v2.

**Decisiones:**
- Etapas de precio = opción avanzada por tier ("El precio cambia según se vende", decisión de Kevin). Al activarla crea Early Bird / Regular con el precio y los cupos repartidos; mínimo 2 etapas, nombres únicos (reglas de v1).
- Formulario de registro **por tier** como el prototipo (preguntas en orden, ayuda, tipo, obligatoria, subir/bajar, reutilizar preguntas de tiers anteriores). Se guarda en el modelo actual: una pregunta del evento por etiqueta (`registration_form_config`) y cada tier con la lista de ids que pregunta (`registration_form_fields`, `[]` = ninguna). La misma etiqueta en dos tiers con distinto tipo/ayuda/obligatoriedad → error. El orden de preguntas lo marca el primer tier donde aparece (la pantalla del invitado sigue el orden del evento). Solo con RSVP activo (como v1).
- Al elegir el inicio, el fin se sugiere 5 h después (prototipo) hasta que el organizador lo cambie. El enlace sigue al nombre (sin tildes) hasta que se edita a mano.
- Validaciones = las del servidor (inicio ≥ ahora + 2 h en la zona del evento, fin > inicio, ventas que terminan antes del fin del evento, límite 1–50, código ≥ 3, descripción 520 / tier 120, máx. 10 tiers) + tope de precio $10.000 como en Enviar tickets.
- Si el flyer falla después de crear el evento: aviso "el evento está publicado, el flyer no se subió" + "Ir al evento"; el formulario queda bloqueado para no publicar dos veces.

**Diferencias deliberadas con el prototipo (decisión pendiente de Kevin):**
- Ciudad: se mantiene el autocompletado de Google de v1 (el prototipo usa una lista fija por país).
- Fechas: selector nativo del navegador (el prototipo tiene calendario + ruedas propias).
- Tipos de pregunta: los 5 que existen (texto, números, email, fecha, casilla). "Cédula (10 dígitos)" del prototipo no existe en el modelo; agregarla toca el formulario del invitado y la validación del servidor.

**Archivos:** lib `organizer/event-form.ts` (borrador, validación con claves i18n tipadas, payload, slugify, precios con coma, etapas, preguntas; 29 tests) + i18n `eventForm.*` en/es. Web: `v2/organizer/create/{page,CreateEvent}.tsx`, `v2/organizer/event-form/{ui,FlyerPicker,TierFields,QuestionsBuilder}.tsx` (reutilizables para editar evento y editor de tiers), iconos `close`/`camera`, `routes.createEvent`. `__tests__/v2/helpers.tsx`: `mockFetch` acepta cuerpos FormData.
**Tests:** `__tests__/v2/CreateEvent.test.tsx` (18: vacío sin envío, enlace y fin derivados, payload exacto, etapas, mínimo 2 etapas, preguntas por tier con reutilización, RSVP apagado, error 400, flyer ok/falla, archivo grande/no imagen, tier oculto + código + inicio de ventas, español, redirección por rol). Mutaciones (sin guardia de rol, sin aviso de flyer, sin fin sugerido) → 10 fallan. lib 306/306; web v2 80/80; tsc lib y web 0. Revisado visualmente en 1280 y 390 (en/es).

**Fase 1 — pendiente:** editar evento (reutiliza `event-form/*`; nombre, enlace, moneda, zona y RSVP no editables por la API), editor de tiers (agregar/editar con etapas, reducción forzada con confirmación clara), equipo, ajustes, payouts, scanner.

## Fase 1 — Editar evento v2 (2026-10-16)
**Pantalla:** `/v2/organizer/event/[id]/edit?org=` (owner/admin, u organizer asignado; viewer vuelve al evento; mismo criterio que `PATCH /api/events`). El botón "Editar" del detalle de evento v2 ya apunta aquí (`routes.editEvent`).
**Qué se edita (lo que permite la API):** flyer (cambiar o quitar), fechas, lugar, ciudad, descripción. **Solo lectura:** nombre, enlace, moneda, zona horaria, RSVP. **Tiers:** enlace a la pestaña Tiers (el editor de tiers sigue en v1 hasta la próxima entrega).

**Decisiones / diferencias con v1:**
- Se envía **solo lo que cambió**. v1 mandaba siempre las fechas, y como la API re-valida "inicio ≥ ahora + 2 h" cada vez que recibe fechas, en v1 un evento a menos de 2 h (o en curso) no se podía editar en nada, ni el lugar. En v2 eso sigue funcionando; solo las fechas quedan bloqueadas, con aviso.
- Fechas en la **zona horaria del evento**. v1 usaba siempre la hora de Ecuador (`utcToEcuadorLocal`): en un evento de Madrid mostraba y guardaba horas corridas.
- Comparación de fechas al minuto (las fechas guardadas pueden traer segundos; sin esto un evento sin tocar se consideraba "fecha cambiada"). Lo encontró un test.
- Cambiar una fecha pide **confirmación**: la API manda email y push a todos los que tienen ticket.
- Si el nuevo fin queda antes del fin de ventas de algún tier → bloqueado, con los nombres de los tiers (igual que v1, sin `alert`).
- Si el flyer nuevo no sube, no se guarda nada (igual que v1).
- Las preguntas de registro ya no se editan aquí (en v1 sí, a nivel evento): en v2 viven en cada tier → entran con el editor de tiers.
- El prototipo trae "Eliminar evento": no existe endpoint para borrar eventos en la API → no se incluyó.

**Hallazgo (no corregido):** las notificaciones de cambio de fecha (`PATCH /api/events`) leen las órdenes sin paginar → con más de 1000 órdenes completadas, los compradores después de la 1000 no reciben email (el push sí sale, va por otra consulta). Fix simple con `selectAllPages`, pendiente de tu OK porque toca envío de correos.

**Archivos:** lib `organizer/event-form.ts` (parte de edición: `editFormFromEvent`, `datesLocked`, `changedDates`, `tiersSellingPastEnd`, `validateEditEventForm`, `buildUpdateEventPayload`; 15 tests) + i18n. Web: `v2/organizer/event/[id]/edit/{page,EditEvent}.tsx`, `FlyerPicker` con flyer existente, `routes.editEvent`, enlace en `EventAdmin`.
**Tests:** `__tests__/v2/EditEvent.test.tsx` (18: precarga en zona del evento y solo lectura, solo campos cambiados, sin cambios, confirmación de fecha cancelar/confirmar, tiers que venden después del fin, fechas bloqueadas con guardado de otros campos, flyer nuevo/falla/quitar, requeridos, error API, co-organizado, inexistente, español, guardia por rol). Mutaciones (sin confirmación, sin aviso de flyer, sin guardia) → 3 fallan. lib 321/321; web v2 98/98; tsc lib y web 0. Revisado visualmente en 1280 y 390 (en/es).

**Fase 1 — pendiente:** editor de tiers (agregar/editar con etapas, preguntas por tier, reducción forzada con confirmación clara), equipo, ajustes, payouts, scanner.
