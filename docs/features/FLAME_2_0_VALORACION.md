# Flame 2.0 — Valoración de impacto y plan

**Fecha:** 2026-10-08 · **Fuente analizada:** `flame-2.0/index.html` (prototipo HTML, 4.294 líneas, datos mock) + `flame-2.0/img/` (18 imágenes).
**Comparado contra:** copia de trabajo (`apps/`, `supabase/migrations`, 66 migraciones) y `docs/EstadoActual/ESTADO_ACTUAL.md`.

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
| Numeración de tickets correlativa (1, 2, 3…) | [Seguro] `tickets` no tiene número | Columna + backfill + asignación **dentro del RPC de compra** → toca el camino de pago endurecido |
| Ajustes de usuario (ciudad, idioma, preferencias de notificación) | [Probable] parcial | Campos en `users` / tabla de preferencias |

---

## 3. Plan sencillo (por fases)

Principio: **primero lo que no toca pagos ni BD; lo nuevo, detrás de una feature flag.**

| Fase | Contenido | Toca BD | Toca pagos | Esfuerzo [Adivinando] |
| --- | --- | --- | --- | --- |
| **0. Decidir** | Resolver D1–D4 (§4). Sacar del prototipo los design tokens (colores, tipografía Inter/Inter Tight, radios, espaciados) a `packages/ui` | No | No | 2–3 días |
| **1. Organizador web** | Rediseño 1:1 del panel (dashboard, tabs de evento, RSVPs, equipo, ajustes, scanner, crear/editar) + responsive con barra inferior. Hacer antes el fix batch del N+1 | No | No | 3–4 semanas |
| **2. Asistente** | Home, explore, evento, wallet, ticket, perfil, ajustes, inbox (con `notifications`). En web y/o app según D1 | No | No | 3–4 semanas |
| **3. Checkout y códigos** | Selector de tickets por tier, discount en checkout, promoter con check. **Corregir antes el bug de promoter** y correr los tests de pago web | No | **Sí** | 1–2 semanas |
| **4. Funcionalidad nueva** | Follow, saved, categorías, line-up, búsqueda ampliada, invitaciones de equipo, breakdown, numeración de tickets. Una migración por ítem, con RLS revisada | **Sí** | Parcial (numeración, breakdown) | 4–6 semanas |
| **5. Salida** | QA manual mobile (no hay tests), release iOS, monitoreo | — | — | 1–2 semanas |

**Total [Adivinando]: 3–4,5 meses con una persona a tiempo completo**, asumiendo que la app conserva sus herramientas de organizador. Si D1 = "organizador solo en web", se ahorra parte de la fase 2 en mobile, pero se suma el trabajo de completar la paridad iOS→web **antes** de quitar nada de la app.

---

## 4. Decisiones que tiene que tomar Kevin

- **D1 — ¿Dónde vive el organizador?** (a) solo web responsive, como en el prototipo; (b) web + app como hoy. Con (a), primero hay que portar a web los 19+ ítems "crucial" que hoy solo tiene iOS, o los organizadores **pierden funciones**.
- **D2 — ¿Qué pasa con `Flme_comp/`?** Hoy es la versión base que manda. Flame 2.0 la **cambia** a propósito: hay que decidir si 2.0 se desarrolla en una rama y la versión base se actualiza al hacer release, o si convive.
- **D3 — ¿Ambiente de prueba?** No hay staging: el entorno local es el único lugar de prueba y mobile no tiene tests. Las fases 3–4 no deberían ir a producción sin staging o, como mínimo, tests de los RPC tocados.
- **D4 — Idioma.** El prototipo está en inglés y Flame opera en Ecuador. Definir si se agrega i18n (hoy no hay ninguna librería de traducción en mobile).

---

## 5. Riesgos principales

1. **[Seguro] Camino de pago.** Numeración de tickets, discount en checkout y atribución de promoter tocan el flujo más crítico, que además tiene un bug de promoter sin corregir.
2. **[Seguro] Mobile sin red de seguridad.** Cero tests unitarios y acoplamiento extremo de auth/logger: un rediseño grande de pantallas multiplica el riesgo de romper cosas que solo se ven en runtime.
3. **[Probable] Regresión de funciones de organizador** si se sigue el prototipo al pie de la letra (organizador solo web) sin completar la paridad.
4. **[Probable] Dos sistemas de estilos.** Tailwind 4 en web y NativeWind/Tailwind 3 en mobile: los tokens se pueden compartir, las clases no del todo.
5. **[Adivinando] Datos existentes.** Ciudades en texto libre y eventos con price stages necesitan migración o compatibilidad hacia atrás.

## 6. Recomendación

Hacerlo **por fases, empezando por el organizador web (fase 1)**: es el cambio con mejor relación valor/riesgo (UX claramente mejor, cero BD, cero pagos) y sirve para validar el sistema de diseño antes de tocar la app. Dejar la fase 4 (funcionalidad nueva) como un proyecto aparte, ítem por ítem, y no como parte del "rediseño".
