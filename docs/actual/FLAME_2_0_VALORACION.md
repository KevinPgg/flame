# Flame 2.0 — Valoración de impacto y plan

**Fecha:** 2026-10-08 · **Fuente analizada:** `flame-2.0/index.html` (prototipo HTML, 4.294 líneas, datos mock) + `flame-2.0/img/` (18 imágenes).
**Comparado contra:** copia de trabajo (`apps/`, `supabase/migrations`, 66 migraciones) y `docs/actual/ESTADO_ACTUAL.md`.

> Leyenda de confianza: **[Seguro]** verificado en código/BD · **[Probable]** inferencia fuerte · **[Adivinando]** estimación.

---

## 0. Lo que hay que saber primero

1. **[Seguro] Flame 2.0 no es código reutilizable, es una especificación visual.** Es un único HTML con JS vanilla y CSS propio. Producción es Next.js 15 + Tailwind 4 (web) y Expo 54 + NativeWind/Tailwind 3 (mobile). Se aprovecha el diseño, los textos y las reglas de UX; **se reescribe el 100 % del front**.
2. **[Seguro] El prototipo cambia la arquitectura de producto, no solo el look.** En el prototipo el organizador vive en la **web responsive** (con barra inferior en teléfono) y la app es **solo asistente**: el botón "Manage" de la app abre la vista web. Hoy la app iOS **sí** tiene herramientas de organizador (dashboard, crear/editar evento, scanner, RSVP, miembros: ~5.200 líneas en `apps/mobile/app`) y además va **por delante** de la web (19+ ítems "crucial" pendientes de portar iOS→web). Esta es la decisión que más condiciona todo lo demás (ver §4, D1).
3. **[Seguro] La mayoría del alcance es solo front.** El propio prototipo marca cada cambio como `keep` (igual), `imp` (mejor), `fix` (corrige) o `add` (nuevo). La gran mayoría son `keep`/`imp` → no tocan BD ni pagos. El riesgo real está en un puñado de ítems.

---

## 1. Qué propone Flame 2.0 (resumen)

**Stage 1 (lo que se valora aquí):** "today's Flame, same features, redesigned". **Stage 2** (flag `FX`, apagado): transferencias, social/amigos, recaps, mapa, add-ons → **fuera de alcance**.

| Área | Pantallas |
| --- | --- |
| Asistente (app) | Splash/sign-in, Home (feed por ciudad), Explore, Evento, selector de tickets, Checkout, Confirmación, RSVP, Mis tickets, Ticket QR, Notificaciones, Perfil, Perfil de organizador, Siguiendo, Ajustes |
| Organizador (web responsive) | Mis organizadores, Dashboard, Evento (tabs: Tiers, Purchases, Breakdown, Promoter links, Promotions, Send tickets), Co-hosts, Crear/Editar evento, RSVPs + detalle, Equipo, Ajustes/Payouts, Scanner QR |

---

## 2. Impacto por cambio

### 2.1 Solo front (sin migración, bajo riesgo)

[Seguro] Rediseño de todas las pantallas con el mismo dato: feed, explore, página de evento, wallet, ticket QR full-screen, perfil único, dashboard en tabla, tabs de evento, RSVP en tabla con aprobar/rechazar en fila, equipo, ajustes, scanner con resultado por color, crear evento en orden lógico, validaciones de promoter links / códigos, confirmaciones antes de borrar, input numérico real (fix "25"→"125"), sign-in a pantalla completa (Clerk con UI propia).

### 2.2 Front + lógica, apoyado en datos que ya existen (riesgo medio)

| Cambio | Ya existe en BD | Impacto |
| --- | --- | --- |
| Bandeja de notificaciones in-app | [Seguro] tabla `notifications` (+ `push_tokens`) | Pantalla + marcar leído. Verificar que todo push escribe también en la tabla |
| Últimos escaneos en scanner | [Seguro] tabla `checkins` | Query + UI |
| Tab Tiers con toggles Sold out / Hidden | [Seguro] migración `tier_visibility_and_manual_sold_out` | Sacar tiers del form de Edit; regla "no bajar cantidad por debajo de lo vendido" |
| **Breakdown financiero** (tarjeta vs transferencia vs comps, fees Stripe, neto) | [Probable] `stripe_fee_cents` y transferencias existen | Es **nuevo** (`add`). Agrega consultas sobre órdenes → **agrava el N+1 de revenue** ya documentado si no se hace batch primero |
| Ciudad desde lista por país | [Seguro] `events.city` es `varchar` libre | UI fácil, pero los eventos existentes tienen ciudades escritas a mano → normalizar datos o aceptar ambos |
| Quitar price stages de la creación | [Seguro] `ticket_stages` está en uso por la lógica de precio y holds | Ocultarlo en UI está bien; **no** borrar la funcionalidad (eventos existentes la usan) |
| Discount code en checkout / promoter en selector | [Seguro] existen | Mover de sitio. **Ojo:** toca el camino de pago y el bug de promoter ya confirmado (sesión 2026-07-09) |

### 2.3 Requiere migración / backend nuevo (riesgo alto)

| Cambio | Hoy | Qué implica |
| --- | --- | --- |
| Seguir organizadores + contador de seguidores | [Seguro] no existe | Tabla `follows` + RLS (Clerk JWT) + endpoints web y mobile + contador |
| Guardar eventos (corazón) | [Seguro] no existe | Tabla `saved_events` + RLS + endpoints |
| Line-up con artistas (IG/Spotify/SoundCloud) | [Seguro] no existe | Tabla o `jsonb` en eventos + campos en Crear evento |
| Categorías (Concert, Celebration…) | [Seguro] no existe | Columna en `events` + filtro |
| Búsqueda de eventos, venues, organizadores y artistas | [Probable] hoy solo por nombre de evento | Endpoint de búsqueda nuevo (depende de line-up) |
| Miembro "Invited" hasta aceptar | [Seguro] `organization_members` no tiene estado ni invitaciones | Tabla/estado de invitación + email + aceptar. Toca RLS de miembros (zona con fixes recientes de PII) |
| Numeración de tickets | **Corregido 2026-11-02**: el prototipo numera los tickets **de cada persona** por evento ("Ticket 1 de 2"), ya hecho en la fase 2.3; no pide correlativo por evento | Nada. Una serie por evento (#0001…) sería opcional: trigger en `tickets`, evaluar junto al proceso de compra |
| Ajustes de usuario (ciudad, idioma, preferencias de notificación) | [Probable] parcial | Campos en `users` / tabla de preferencias |

---

## 3. Plan sencillo (por fases) — v2, con decisiones del 2026-10-08

Principio: **primero lo que no toca pagos ni BD; lo nuevo, detrás de una feature flag.** El organizador se construye **dos veces** (web y app nativa) a partir del mismo diseño.

| Fase | Contenido | Toca BD | Toca pagos | Esfuerzo [Adivinando] |
| --- | --- | --- | --- | --- |
| **0. Base** ✅ 2026-10-08 | Design tokens del prototipo (colores, Inter/Inter Tight, radios, espaciados) en `packages/ui`. Montar i18n en web y app (inglés por defecto + español). Tests de los RPC de compra (§7) | Mínimo (columna `users.language`) | No (solo tests) | 1,5–2 semanas |
| **1. Organizador web** | Rediseño 1:1 del panel + responsive. Fix batch del N+1 antes del dashboard | No | No | 3–4 semanas |
| **1b. Organizador app** | Mismas pantallas en Expo, a partir de la vista teléfono del prototipo. Se reescriben las pantallas actuales (~5.200 líneas), no se parte de cero. Cerrar de paso la paridad iOS↔web | No | No | 3–4 semanas |
| **2. Asistente** | Home, explore, evento, wallet, ticket, perfil, ajustes (con selector de idioma), inbox, en web y app | No | No | 3–4 semanas |
| **3. Checkout y códigos** | Selector por tier, discount en checkout, promoter con check. **Corregir antes el bug de promoter** | No | **Sí** | 1–2 semanas |
| **4. Funcionalidad nueva** | Follow, saved, categorías, line-up, búsqueda, invitaciones de equipo, breakdown, numeración de tickets. Una migración por ítem | **Sí** | Parcial | 4–6 semanas |
| **5. Ensayo y salida** | Ensayo en staging (§7), TestFlight interno, release iOS + web, Flame 2.0 pasa a ser la versión base | — | — | 1,5–2 semanas |

**Total [Adivinando]: 4,5–6 meses con una persona a tiempo completo** (antes 3–4,5). La diferencia es el organizador nativo (+3–4 semanas) y la i18n (+1–2 semanas).

---

## 4. Decisiones tomadas (2026-10-08)

- **D1 — Organizador visible y funcional desde la app.** Se descarta "organizador solo web" del prototipo. El botón "Manage" de la app abre pantallas nativas, no la web. La vista teléfono del prototipo es la especificación de esas pantallas.
- **D2 — Flame 2.0 es código nuevo; `Flme_comp/` no se toca.** Queda como referencia de la versión antigua: todo lo marcado `keep` en el prototipo tiene que comportarse igual que en `Flme_comp/`.
- **D3 — Entorno de pruebas.** Este proyecto ya es el entorno de desarrollo (fuera del git de producción, con commits propios que Kevin pasará a limpio). Qué falta encima de eso: ver §7.
- **D4 — Idioma.** Inglés por defecto, como el prototipo, con opción de cambiar el idioma en Ajustes (inglés/español).

### Implicaciones del idioma (D4)

- [Seguro] Hoy no hay librería de traducción en mobile. Hay que montarla en las dos apps (p. ej. `next-intl` en web, `i18next` + `expo-localization` en mobile) y escribir todos los textos con claves, desde la fase 0. Hacerlo después obliga a repasar cada pantalla dos veces.
- [Probable] La preferencia se guarda en `users.language` para que web, app, **emails y push** salgan en el idioma del usuario. Emails y notificaciones son los que se suelen olvidar.
- [Seguro] El contenido que escriben los organizadores (nombre del evento, descripción, preguntas del formulario) **no se traduce**: se muestra tal cual.

---

## 5. Riesgos principales

1. **[Seguro] Camino de pago.** Numeración de tickets, discount en checkout y atribución de promoter tocan el flujo más crítico, que además tiene un bug de promoter sin corregir.
2. **[Seguro] Mobile sin red de seguridad.** Cero tests unitarios y acoplamiento extremo de auth/logger: un rediseño grande de pantallas multiplica el riesgo de romper cosas que solo se ven en runtime.
3. **[Probable] Doble implementación del organizador** (web + app): riesgo de que diverjan otra vez. Mitigación: lógica en `packages/lib`, pantallas de cada plataforma solo de presentación.
4. **[Probable] Dos sistemas de estilos.** Tailwind 4 en web y NativeWind/Tailwind 3 en mobile: los tokens se pueden compartir, las clases no del todo.
5. **[Adivinando] Datos existentes.** Ciudades en texto libre y eventos con price stages necesitan migración o compatibilidad hacia atrás.

## 6. Recomendación

Hacerlo **por fases**: fase 0 (tokens + i18n + tests de compra), luego organizador web y app (1/1b). Dejar la fase 4 (funcionalidad nueva) como un proyecto aparte, ítem por ítem, y no como parte del "rediseño".

---

## 7. Entorno de pruebas (D3)

[Seguro] Este proyecto local **sí** es el entorno de desarrollo; no hace falta otro para las fases 0–2. Lo que no cubre son tres cosas que solo aparecen al acercarse a producción:

1. **Pruebas automáticas del flujo de compra** (fase 0, antes de la fase 3). Tests de integración (Vitest, ya instalado en web) que corren contra el Supabase local y ejercitan los RPC de holds, compra, promoter y numeración. Hoy ese flujo solo se valida a mano en mobile. Es lo que más reduce el riesgo, y no cuesta infraestructura.
2. **Ensayo de migraciones contra algo parecido a producción** (fase 5). En local las migraciones se aplican sobre una BD que el propio proyecto creó. En producción caen sobre datos reales con 66 migraciones previas. El ensayo es: aplicar las migraciones nuevas sobre una copia reciente de producción (o un proyecto Supabase de staging en la nube) y comprobar que la app de producción **actual** sigue funcionando contra esa BD durante la transición.
3. **Prueba de la app nativa** (fase 5). `npx expo start` + `localhost:8081` es Expo **web** en el navegador: sirve para iterar pantallas, pero pago Stripe nativo, cámara del scanner, push y secure-store no se comportan igual. Para lo nativo: build local Android (ya resuelto). Producción es solo iOS y no hay Mac → antes de publicar, un build iOS con EAS instalado vía TestFlight (la app de Apple para betas internas), apuntando a staging.

Mínimo recomendado: el punto 1 siempre, y los puntos 2 y 3 solo para el ensayo final. Un staging en la nube encendido todo el tiempo no hace falta.

**Ojo al "pasar a limpio" los commits:** las migraciones nuevas se pueden reagrupar antes de llevarlas a producción, pero **nunca** se debe tocar una migración que ya esté aplicada en producción, y el orden por timestamp tiene que quedar posterior a la última de producción (`20260622232556`).
