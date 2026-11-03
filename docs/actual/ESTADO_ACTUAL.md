# Flame — Estado Actual

**Fecha:** 2026-07-15 (§0 actualizado 2026-10-22) · Consolida `ESTADO_ACTUAL_2026-07-07.md` (general) y
`ESTADO_ACTUAL_MOBILE_2026-07-08.md` (mobile).

> **Convención del proyecto:** `Flme_comp/` es el **baseline intacto de producción** y manda
> sobre cualquier otra copia. El resto del árbol (`apps/`, `packages/`, `supabase/`) es la
> copia de trabajo levantada para el **entorno local de pruebas** (Supabase de desarrollo,
> Clerk test, Stripe test). El objetivo del entorno es reproducir el estado real de la app,
> no evolucionarla por su cuenta. Arquitectura de producción: `docs/actual/ARQUITECTURA.md`.

---

## 0. Flame 2.0 — dónde estamos (2026-10-18)

El rediseño Flame 2.0 se construye en esta copia (código nuevo, `Flme_comp/` no se toca). Plan y
decisiones: `docs/actual/FLAME_2_0_VALORACION.md`. Detalle de cada entrega:
`docs/sesiones/2026-10-08-valoracion-flame-2.0.md`.

| Fase | Estado |
| --- | --- |
| 0. Base (tokens, i18n en/es, tests de compra) | Hecha (10-08) |
| 1. Organizador web | **Hecha (10-18)** · pruebas reales ejecutadas (10-22): `docs/PruebasReales/FASE_1_ORGANIZADOR_WEB.md`. Abiertos: correos sin verificar (Brevo), ingresos v1↔v2 |
| 1b. Organizador app (Expo) | **Cerrada (10-26, decisión de Kevin; ronda 3 de pruebas reales en curso).** Hecho: 1b.0 base, 1b.1 panel, 1b.2a detalle de evento (marco, Tiers, Compras, Desglose); 10-23: rehecho con el diseño de teléfono del prototipo (barra Eventos · RSVPs · Escanear · Manage, hub Manage, sin menú lateral). 10-23: 1b.2b (Promotores, Códigos, Enviar tickets, Escáner, Co-organizadores) y **1b.6 adelantada** (escáner por cuenta, sin código) + Compras con origen y escaneados x/N (web y app). 10-23: **1b.3 RSVPs** (lista y solicitudes v2, aprobar/rechazar/todas, detalles, exportar). 10-23: **1b.4** crear/editar evento + editor de tiers en la app (pruebas reales de 1b.3 y 1b.4 pendientes, juntas). 10-23: **1b.5a** Manage → Equipo, Pagos, Ajustes de organización + búsqueda de personas restringida (migración `20261023180000_search_org_people.sql`, **Kevin debe aplicarla**). 10-26: **1b.5b Ajustes únicos** (`/v2/settings`, notificaciones por API). **Ronda 3 de pruebas reales en curso** (1b.3, 1b.4, 1b.5a, 1b.5b; orden al inicio de `PruebasReales/FASE_1B_ORGANIZADOR_APP.md`). 10-26: **cierre de la 1b** (buscador restringido en Enviar tickets/Escáner/Equipo web y app, cola de soporte 2.0, notificación de venta → Compras v2). **Código de la 1b completo; falta la ronda 3 de pruebas reales.** 10-26: **web v2 alineada** — hub Manage en el menú, Ajustes únicos en `/v2/account` (notificaciones, eliminar cuenta, soporte) y cola de soporte 2.0 (`docs/sesiones/2026-10-26-manage-web-v2.md`; pruebas reales pendientes). 10-27: arreglos antes de la fase 2 — "Borrar todo" de notificaciones (no borraba nada), recargar aprobaciones en Perfil, notificaciones de organización aprobada / no aprobada (en el idioma del dueño), "Unmatched Route" al volver de Google (también en producción). Pruebas de la 1b y de Manage web **aprobadas (10-27)**. 10-23 ronda 3: fix fechas por defecto de tiers (web) y hoja de co-organizadores con teclado; mejoras anotadas (búsqueda de personas unificada — pendiente de decisión por privacidad —, Mis tickets con swipe en fase 2): ver la sesión 1b. Plan: `docs/sesiones/2026-10-22-fase-1b-organizador-app.md` |
| 2. Asistente | **Código completo (10-27), pruebas reales pendientes.** 2.0 plan + decisiones de Kevin (mismas URLs públicas vía reescritura del middleware, hooks de la app reutilizados, campana web adaptada a PC, ciudad sin recordar — desde la corrección 2.2 la app guarda en el celular la ciudad de inicio elegida en Ajustes —, Home con flyer completo). **2.1** marco del asistente (app `EXPO_PUBLIC_ATTENDEE_V1`, web `ATTENDEE_V1`) + campana web + `/api/me/notifications`. **2.2** Home con flyer completo (web: `/` servida por v2) + corrección 2.2. **2.3** Mis tickets + ticket QR deslizable. **2.4–2.7** página de evento (compra v1 dentro) y perfil de organizador, Explorar, Tú + bandeja + bienvenida, cierre. Web servida por v2 en `/`, `/events/[slug]`, `/organizer/[slug]`, `/discover`, `/account`, `/account/ticket/[id]`, `/profile`, `/notifications`, `/sign-in`, `/sign-up` (interruptor `ATTENDEE_V1`). **Código completo; faltan las pruebas reales.** Siguiente: fase 3 (pagos). Sesión: `docs/sesiones/2026-10-27-fase-2-asistente.md`; pruebas: `PruebasReales/FASE_2_ASISTENTE.md` |
| 3. Checkout y códigos | **Código completo (10-29), pruebas reales pendientes para cerrar.** 3.1 B2/B10/B3/B4; 3.2+3.3 pantalla de pago nueva web y app (B5, B7), compra en curso flotante; 3.4 RSVP por invitado, B12, cron de conciliación; 3.5 cierre: `force-reduce` ya no rechaza RSVPs aprobadas ni borra pagos en curso, `approve` rechaza eventos terminados, paridad de exportes y pantalla de pago. Decisión pendiente: crons solo-POST en producción. 10-29: ronda de pruebas → aviso de reemplazo de reserva, "Cancelar reserva" explícito, reloj ≤ 30 min, preguntas RSVP por entrada como opción del tier (**migración `20261029120000_tier_registration_per_ticket.sql`, Kevin debe aplicarla**). Pruebas: `PruebasReales/FASE_3_PAGOS.md`. Historia: 3.0 análisis y plan en `actual/FASE_3_PAGOS.md`: decisiones de Kevin (corregir antes B2+B10, B3+B4, B5+B7; B8/B9 fuera por ahora; descuento en el checkout; prototipo completo en web y app). Hallazgo nuevo B11: la RLS de `promoter_links` deja leer todos los códigos sin sesión (cerrar en la salida). Siguiente: 3.1 arreglos. Sesión: `docs/sesiones/2026-10-27-fase-3-pagos.md` |
| 4. Funcionalidad nueva | **Código completo (11-02).** Orden por riesgo: Guardar eventos → Seguir organizadores → Line-up → Búsqueda → Invitaciones de equipo → Numeración de tickets; categorías descartadas. Hecho: fix CSRF de "Solicitar pago" en la app, promotores en lote + QR, etiquetas `StatusTag`, **4.1 Guardar eventos** (migración `20261102120000_saved_events.sql`), **4.2 Seguir organizadores** (migración `20261102150000_organization_follows.sql`; avisos a seguidores hechos 11-02), **4.3 Line-up** (migración `20261102170000_events_lineup.sql`; foto del artista desde Spotify/SoundCloud o subida, Instagram no disponible), **4.4 Búsqueda** (artistas, seguidores en Explorar, búsquedas recientes; en el cliente). **4.5 Invitaciones de equipo** (migración `20261102190000_organization_invitations.sql`; correo vía Brevo sin verificar). 11-02 noche: aviso a seguidores al crear evento (`followed_org_event`), diagnóstico Brevo (bloqueo de IPs autorizadas; remitente gmail), **4.6 cerrada sin cambios** (el prototipo numera por persona, hecho en 2.3), fix insignia de la campana en la app (2 cifras). **Código de la fase 4 completo**; tests en local y pruebas reales pendientes. Sesión: `docs/sesiones/2026-11-02-promotores-lote-qr-estados-csrf-app.md`; pruebas: `PruebasReales/FASE_4_FUNCIONALIDAD_NUEVA.md` |
| 5. Ensayo y salida | **Siguiente (inventario 11-02).** **A. Cerrar lo construido:** pruebas reales de fases 2, 3 y 4 (1 y 1b ya aprobadas); tests y `tsc` de web/app en local; aplicar migraciones pendientes (`20261029120000` preguntas por entrada, `20261102120000` guardados, `…150000` seguidores, `…170000` line-up, `…190000` invitaciones, `…210000` perfil, `…220000` lugar del evento); llave de Google Places (`guias/GOOGLE_PLACES_API_KEY.md`, una para dev y otra para producción). **B. Evaluación del proceso de compra** (plan de Kevin, después de Flame 2.0). **C. Seguridad antes de salir:** B11 RLS de `promoter_links` (lee todos los códigos sin sesión), rate limit de `validate-code`, auditoría RLS de la app. **D. Decisiones pendientes:** crons solo-POST en producción; tope del cargo fijo en tickets baratos (sesión 10-31); comparar ingresos v1↔v2 antes de borrar el organizador v1; cuándo apagar los interruptores v1 (`ATTENDEE_V1`, `EXPO_PUBLIC_ATTENDEE_V1`, flag del organizador). **E. Servicios:** Brevo (quitar bloqueo de IPs, dominio autenticado, revisar 401 en producción); `EXPO_ACCESS_TOKEN` y push iOS en producción. **F. Ensayo:** migraciones sobre copia de producción o staging (timestamps > `20260622232556`, nunca tocar las ya aplicadas), commits pasados a limpio, build iOS con EAS → TestFlight contra staging, release iOS + web. |

- El organizador web vive en `/v2/organizer…`; las URLs v1 del organizador redirigen ahí (`ORGANIZER_V1=true` para volver).
- Escaneo de tickets solo desde la app en el celular; la web solo configura quién escanea (cuentas + código de acceso por evento).
- Abiertos de la fase 1: rate limit de `validate-code`; ~~`force-reduce` rechaza RSVPs aprobados~~ y ~~`approve` sin validar evento terminado~~ resueltos (fase 3.5, 10-29); auditoría RLS móvil; correos sin verificar (Brevo); ingresos v1↔v2 pendientes (v1 se conserva). ~~React duplicado en build web~~ resuelto (c78d917).


## 1. Producción (= `Flme_comp/`)

Plataforma de ticketing en producción (`www.flme.co` + app iOS v1.0.13 en App Store),
funcionalmente muy completa: descubrimiento, checkout con holds, RSVP con códigos/preguntas,
precios por etapas, promo codes, promoter tracking, multi-organización, co-hosts, equipos con
roles, scanner QR, payouts Stripe Connect multi-país.

**Semáforo (validado contra el grafo de código, 2026-07-07):**

| Área | Estado | Nota |
| --- | --- | --- |
| Funcionalidad core (compra/ticket/QR) | 🟢 | Camino de pago muy endurecido, con tests |
| Backend / Supabase / RLS | 🟢 | 66 migraciones, RLS con Clerk trabajado a fondo |
| Paridad iOS ↔ Web | 🟡 | 19+ items "crucial" pendientes de portar a web (`docs/historico/todos/CRUCIAL_IOS_TO_WEB_TODOS.md`): #16 miembros de equipo, #17 fork dashboard por rol, #18 event assignment/co-host, #15 form builder… |
| TypeScript mobile | 🟡 | Baseline tolerado ~103–109 errores `tsc`; regla: 0 nuevos en archivos tocados |
| Tests | 🟡 | Web bien (17 archivos, pago/holds/stages); mobile sin tests unitarios (solo tsc + QA manual) |
| Deuda documental | 🟠 | ~147 `.md` en `docs/` con solapamiento/legacy |
| Datafast (legacy) | 🟠 | Deprecado pero presente en env/rutas/código |

**Riesgos estructurales conocidos:**

1. ~~**N+1 en revenue de organizador**~~ — **resuelto 2026-10-15** en `/api/organizer/data`
   (número fijo de consultas: 13 con 2 eventos y con 42; antes 17 y 137) con
   `fetchEventPurchasesForEvents` + `rsvp-stats.ts`, y todas las lecturas de varios eventos
   paginadas (`lib/utils/supabase-pagination.ts`), porque PostgREST corta en 1000 filas sin error.
   El SSR de v1 (`app/organizer/page.tsx`) conserva su propio cálculo de compras (ya paginado);
   se conserva: v1 no se borra hasta comparar ingresos v1↔v2 (decisión de Kevin, 10-22).
2. **Logger y auth mobile: acoplamiento extremo sin red de seguridad** — `error`/`warn` del
   logger Supabase mobile tienen fan-in 301/90 y `getAuthenticatedClient`/`useOptionalAuth`
   26/69, con **cero tests en mobile**. Un cambio de firma o comportamiento en uno de esos
   archivos toca cientos de call-sites y nadie lo detecta hasta runtime (un solo archivo de
   auth roto tumba toda la app — visto en el incidente del 2026-07-15).
3. **Zod 4 (web) vs Zod 3 (mobile)** — los schemas compartidos en `packages/lib` pueden
   validar distinto por plataforma (Zod 4 cambió errores, defaults y strictness): el mismo
   dato puede pasar en web y fallar en mobile o viceversa, sin error de compilación que lo
   delate. Latente hasta que un schema use una feature divergente.
4. **Trampa `www` vs no-`www`** — `fetch()` descarta `Authorization` en el redirect 307 de
   `flme.co` → `www.flme.co` (cambio de host) → 401 "session expired" en mobile. Ya causó
   incidentes en producción y es estructural porque nada lo previene: cualquier URL nueva
   sin `www` en configs/webhooks lo reintroduce en silencio. Mitigación pendiente: regla de
   lint/test sobre configs.

**Mobile en producción:** SOLO iOS. No hay pipeline Android (sin `build:android`, submit solo
`ios` en `eas.json`). Limitación de alcance de negocio, no técnica.

**Métricas de referencia (2026-07-07):** 557 archivos TS · 82 rutas API web · 66 migraciones ·
45 hooks mobile · 17 archivos de test web · iOS v1.0.13.

---

## 2. Entorno de desarrollo — estado a 2026-07-15

| Pieza | Estado |
| --- | --- |
| Supabase local | 🟢 Corriendo (127.0.0.1:54321), 66 migraciones + seed de prod normalizado y anonimizado (~54k filas, PII limpiada). `clerk_id` del seed siguen siendo de prod salvo remapeos manuales |
| Web local | 🟢 `localhost:3000` con `.env` completo (Clerk test, Stripe test, webhook `stripe listen`) |
| Clerk (test) | 🟢 Instancia `upright-peacock-32.clerk.accounts.dev`, webhook vía ngrok. ⚠️ **Sin JWT template `supabase`** → causa del bug activo de mobile (ver §4) |
| Stripe (test) | 🟡 Connect activado; Ecuador choca con Accounts v2 (`recipient` agreement) → workaround: orgs de prueba con país US |
| Mobile Android local | 🟢 Build local `expo run:android` compila, instala y conecta a Metro (EAS descartado: sin staging, cola free tier). Cadena nativa resuelta: JDK 17 pineado, hoisted node_modules, adb reverse |
| Mobile runtime JS | 🔴 Bug activo: `fetchUserProfile` falla por JWT template (ver §4). Previo (React duplicado 19.1.0/19.1.4) con fix indicado vía `pnpm.overrides` |

## 3. Divergencias de la copia de trabajo vs `Flme_comp/` (diff real, 2026-07-15)

### 3.1 Adaptaciones de entorno (intencionales, mantener)

| Archivo | Cambio | Motivo |
| --- | --- | --- |
| `apps/{web,mobile}/.env` | creados | Supabase local, Clerk/Stripe test, IP LAN para device |
| `apps/mobile/eas.json` | Stripe pk_test propia + perfil `development-staging` | claves de la cuenta de pruebas de Kevin |
| `apps/mobile/app.config.ts` | EAS projectId propio (`75f6c24d…`) | el original pertenece a otra cuenta (hello@flme.co) |
| `apps/mobile/app.json` | plugin `expo-build-properties` (`packagingOptions.exclude` META-INF) | conflicto de jars en build Android |
| `apps/mobile/package.json` | `expo-build-properties` añadido; versiones realineadas por `expo install --fix` | build Android local |
| `apps/web/next.config.ts` | `remotePatterns` http 127.0.0.1/localhost:54321 (solo `NODE_ENV !== production`) | `next/image` con storage local |
| `apps/web/.../StripePaymentForm.tsx` | log de campos primitivos del error de Stripe | el overlay de Next serializa el error cross-origin como `{}` |
| `packages/lib/src/stripe/connect-countries.ts` | `DEFAULT_CONNECT_COUNTRY` EC → **US** | workaround Stripe Accounts v2 + EC en cuenta test |
| `.npmrc` raíz + `pnpm-lock.yaml` | `node-linker=hoisted`, lockfile regenerado | MAX_PATH de Windows en build nativo RN |
| `apps/mobile/android/` | prebuild local (gitignored) | incluye pin `org.gradle.java.home` → JDK 17 en `gradle.properties` (se pierde con `expo prebuild` limpio) |
| `supabase/seed/` | dump de prod normalizado/anonimizado | datos realistas sin PII |

### 3.2 Divergencia funcional NO alineada a producción (revertir — causa el bug §4)

| Archivo | Qué se cambió |
| --- | --- |
| `apps/mobile/lib/supabase-auth.ts` | `getToken({ template: "supabase" })` → `getToken()` (third-party auth nativa). ⚠️ Archivo además **corrupto en disco** (truncado, termina a media cadena) |
| `apps/mobile/hooks/useUserRole.ts` | Ídem sin template. ⚠️ **Corrupto** (relleno con bytes nulos al final) |
| `supabase/config.toml` | Añadido `[auth.third_party.clerk]` con el dominio de Clerk dev |

Producción usa el **JWT template `supabase` de Clerk** (ver `ARQUITECTURA.md` §4), no la
integración third-party. La migración se hizo sin considerar el escenario real de `Flme_comp`.
Ambos archivos conservan exactamente el mismo tamaño en bytes que el original — patrón de
escritura in-place fallida (posible artefacto de sync); verificar el contenido real local.

## 4. Bugs abiertos

1. **🔴 Mobile — `fetchUserProfile` / auth Supabase:** `No JWT template exists with name:
   supabase` en la instancia Clerk dev. Fix alineado a prod: restaurar los 2 archivos de auth
   desde `Flme_comp`, quitar `[auth.third_party.clerk]` de `config.toml`, y crear el JWT
   template `supabase` en el Clerk dev (HS256, secret del Supabase local, claim
   `role: "authenticated"`). Pasos detallados dados en la sesión 2026-07-15.
2. **🔴 Promoter code desconectado del checkout (web, B1/B2):** el input de promoter en
   `/purchase` es cosmético — nunca se envía; el server siempre prioriza `hold.promoter_code`.
   Atribución de ventas incorrecta en ambos sentidos. Confirmado por código
   (`2026-07-09-analisis-stripe-holds-promotor-bug.md`).
3. **🟠 B3–B10 (auditoría 2026-07-09, pendientes de confirmación de Kevin):** webhook no
   valida `expires_at` del hold; crear hold mata el hold previo del usuario (ghost order);
   página de éxito web se rinde a ~13 s; `complete-hold` código muerto; sin countdown de hold;
   carrera en `usage_limit` de promos; RSVP mobile autoriza tarjeta antes del POST; doble
   camino de validación de promoter.
4. **🟡 Stripe EC + Accounts v2:** no se puede crear cuenta Connect `recipient` para EC en la
   cuenta test (API v1 vs plataforma v2). Workaround activo: país US.
5. **🟡 React duplicado en bundle mobile** (`useContext of null`): fix indicado
   (overrides `react`/`react-dom` 19.1.4) pendiente de confirmar.
6. **🟡 `next build` local falla en el prerender de `/404`** (`useContext of null`, 2026-10-18):
   el `package.json` raíz declaraba `next` sin `react`; pnpm le resolvía React 19.1.4 y con
   `node-linker=hoisted` esa copia quedaba en `node_modules/next/node_modules/react` mientras la app
   usa 19.1.0. Verificado: sin esa copia el build pasa completo. **Fix aplicado 2026-10-19**:
   `react`/`react-dom` `19.1.0` en devDependencies de la raíz. **Pendiente de verificar en local:**
   `pnpm install` → que no exista `node_modules/next/node_modules/react(-dom)` → `pnpm --filter web build`
   pasa → build Android sigue igual. Luego commit propio (ver sesión 2026-10-19) y pasar a 🟢.
   En producción (Vercel, sin hoisted) no aplicaba. Probable misma raíz que el punto 5.

## 5. Recomendaciones vigentes (de prod, siguen aplicando)

Alta: cerrar paridad organizador web (#16/#17/#18) · UI compartida real en `packages/ui` ·
bajar baseline `tsc` mobile. Media: retirar Datafast · ~~batch `fetchEventPurchasesForEvents`~~ (hecho 2026-10-15) ·
tests mobile + RLS en CI · unificar Zod. Higiene: regla lint `www.flme.co`.


## Bug de producción: correos de cambio de fecha no se envían (encontrado 2026-10-22)
[Probable] En producción (`Flme_comp/apps/web/app/api/events/route.ts`, PATCH) el aviso por email de cambio de fecha **no llega a nadie**: la consulta embebe `users!inner` desde `orders`, pero `orders` tiene 3 FK a `users` (`user_id`, `promoter_user_id`, `original_purchaser_user_id`) → PostgREST responde PGRST201 (relación ambigua) y el código ignora el error (`orders` = null → 0 correos, sin log). El push sí sale (otra consulta).
En esta copia el error salía como `TypeError: … toLowerCase is not a function` porque `supabase-retry.ts` asumía `details` string (PGRST201 lo manda como array). Corregido aquí (`users!orders_user_id_fkey!inner` + reintento robusto, test `__tests__/utils/event-recipients.test.ts`). **Para producción:** aplicar el mismo cambio de FK al pasar Flame 2.0, o como hotfix aparte si se quiere antes.
