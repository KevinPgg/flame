# 2026-10-27 · Fase 2 (Asistente) — 2.0 inventario y plan

**Alcance (plan del 10-08, `actual/FLAME_2_0_VALORACION.md` §3):** pantallas del asistente en web y app, **sin tocar BD ni pagos**. Antes de empezar se cerraron los arreglos del 10-27 (ver `2026-10-26-manage-web-v2.md`). Las pruebas reales de la 1b (ronda 3) y de la web (Manage) siguen pendientes y se hacen en paralelo.

## Prototipo (`flame-2.0/index.html`, lado asistente)
Barra inferior de 4: **Home · Explore · Tickets · You** (igual que la app hoy). Notificaciones = campana arriba a la derecha (no es pestaña). 13 pantallas + 2 hojas:

| Pantalla | Hoy (web / app) | Qué propone (notas v3 del prototipo) | Necesita BD / pagos |
| --- | --- | --- | --- |
| splash · Iniciar sesión | Pop-up blanco de Clerk / `sign-in.tsx` | Bienvenida a pantalla completa con flyers reales, logo en negro; mismo Clerk | No |
| home | `/` (`HomeContent`) / `(tabs)/index` | Selector de ciudad en el encabezado (hoja con ciudades y nº de eventos), un evento por fila agrupado por día (organizador, flyer, nombre, hora, lugar, precio), compartir y guardar; buscar y campana arriba. "Full flyer" vs "Square" por decidir | **Guardar = fase 4** |
| explore | `/discover` / `discover.tsx` (= home legacy) | Buscar arriba, destacados, organizadores destacados (portada, logo, seguidores), categorías, "Organiza tus eventos", FAQs; búsqueda de eventos, lugares, organizadores y artistas | **Seguidores, categorías y búsqueda de artistas/lugares = fase 4** |
| event | `/events/[slug]` (`EventDetail`) / `event/[id].tsx` (720 líneas, con el checkout dentro) | Flyer sobre sus colores difuminados, organizador sobre título grande; descripción de 3 líneas con "Más"; tickets enseguida; lineup; lugar; "bueno saber"; más eventos del organizador; barra fija con precio y estado (Get tickets / Request to join / Pending / View tickets) | **Lineup = fase 4**; tiers/códigos/compra = **fase 3** |
| sheet-tickets · checkout · success | Tarjetas de tier + Stripe | Hoja por tier, promotor con check, descuento en checkout, una pantalla de pago | **Fase 3** |
| sheet-rsvp | "Request RSVP" + formulario | Formulario, invitados y cuándo se cobra en una hoja | Toca el flujo de RSVP con retención de tarjeta → **fase 3** (recomendado) |
| wallet · Mis tickets | `/account` (`UserDashboard`) / `(tabs)/dashboard` + `history` | Cada evento una tarjeta con flyer, cuenta regresiva y botón QR; RSVP pendientes con su estado; contadores | No |
| ticket · QR | `/account/ticket/[id]` / `ticket/[id].tsx` | Ticket a pantalla completa sobre los colores del flyer, QR grande (tocar → blanco), titular, tier, puertas; indicaciones, ayuda, recibo. **Pedido de Kevin:** cargar todos los tickets de la compra y pasar deslizando sin recargar | **Numeración 1,2,3… = fase 4** |
| inbox | Solo app (panel de la campana) / la web no tiene | Lista con miniaturas del flyer | No (la web necesitaría lectura por API) |
| org · perfil de organizador | `/organizer/[slug]` / `organizer/[slug].tsx` | Portada, logo grande, Instagram, compartir, eventos en cuadrícula, seguidores + Seguir | **Seguir/seguidores = fase 4** |
| profile · You | `/profile` / `(tabs)/profile` | Un solo perfil: si llevas organizaciones, arriba con botón Manage; "Siguiendo", "Eventos" (historial), guardados | **Siguiendo/guardados = fase 4** |
| following | — | Organizadores que sigues | **Fase 4** |
| settings | Ya hecho (1b.5b app `/v2/settings`, web `/v2/account`) | Ciudad, idioma, notificaciones | Ciudad preferida: decidir dónde se guarda |

**Datos que hoy usa el asistente:** la app lee Supabase directo en varios hooks (`useAppEvents`, `useUserTickets` — 7 consultas —, `useNotifications`, `useUserProfile`, `get_event_with_tiers`); el checkout ya va por API (`useCheckout`). La web pública (`/`, `/events/[slug]`, `/organizer/[slug]`) se renderiza en el servidor (SEO y vista previa al compartir). El lado asistente no tiene textos traducidos (D4).

## Frontera con fase 3 y 4 (lo que NO entra en la fase 2)
- **Fase 3 (pagos):** hoja de tickets por tier, códigos (acceso, promotor, descuento), checkout, confirmación, hoja de RSVP. En la fase 2 el bloque de tickets de la página de evento **se conserva tal cual por dentro** (mismos componentes y estado de `useCheckout`/`StripePurchaseFlow`), solo cambia lo que lo rodea.
- **Fase 4 (BD):** guardar, seguir/seguidores, categorías, lineup, búsqueda de artistas y lugares, numeración de tickets. En la fase 2 **no se muestran** (como Finanzas en Manage), en vez de botones que no hacen nada.

## Decisiones que necesito de Kevin antes de la 2.1
1. **Página de evento:** (a, recomendado) se rediseña en la fase 2 dejando dentro el bloque de compra actual, y la fase 3 lo reemplaza; o (b) toda la página de evento pasa a la fase 3 junto con el checkout (fase 2 más chica, pero el asistente convive más tiempo con la página vieja).
2. **URLs públicas en la web:** (a, recomendado) la v2 se sirve en las **mismas URLs** (`/`, `/events/[slug]`, `/organizer/[slug]`) detrás de un interruptor, para no perder SEO ni enlaces compartidos; o (b) rutas `/v2/...` con redirección como en el organizador.
3. **Home:** "flyer completo" o "cuadrado" (el prototipo deja comparar ambos).
4. **Datos en la app:** (a, recomendado) en la fase 2 se reutilizan los hooks que ya funcionan (Supabase con RLS) y solo se pasa a la API lo que haga falta; o (b) todo el asistente por la API web, como el organizador (más trabajo y riesgo, más consistencia).
5. **Bandeja en la web:** ¿se agrega la campana a la web (lectura por API) o queda solo en la app?
6. **Ciudad elegida:** ¿se recuerda por dispositivo (sin BD) o en la cuenta (columna nueva = fase 4)?

## Entregas propuestas (si se aceptan las recomendaciones)
| Entrega | Contenido | Web | App |
| --- | --- | --- | --- |
| 2.0 | Este inventario y plan | — | — |
| 2.1 | Base del asistente: barra Home · Explore · Tickets · You, encabezado con ciudad, buscar y campana, textos traducidos del marco, interruptor v1↔v2 (`EXPO_PUBLIC_ATTENDEE_V1` / variable web), tests | ✓ | ✓ |
| 2.2 | Home: hoja de ciudades, lista por día, compartir | ✓ | ✓ |
| 2.3 | Mis tickets + ticket QR (deslizar entre tickets sin recargar, QR en blanco al tocar, RSVP pendientes) | ✓ | ✓ |
| 2.4 | Página de evento (sin el bloque de compra) + perfil de organizador | ✓ | ✓ |
| 2.5 | Explore (destacados, organizadores, organiza tus eventos, FAQs, búsqueda por nombre como hoy) | ✓ | ✓ |
| 2.6 | You (perfil único con Manage arriba) + bandeja + bienvenida / iniciar sesión | ✓ | ✓ |
| 2.7 | Cierre: paridad, interruptor, PruebasReales `FASE_2_ASISTENTE.md` | ✓ | ✓ |

Mis tickets va antes que la página de evento a propósito: es lo que usa cada asistente en la puerta, no depende de la frontera con pagos y recoge tu pedido de deslizar.

**Riesgos:** [Probable] la página de evento es el punto más delicado (720 líneas con el checkout entrelazado en la app). [Seguro] el SEO de la web pública: la v2 debe seguir generando metadatos y vista previa al compartir. [Probable] el asistente es lo que ve el 100 % de los usuarios: cada entrega va detrás del interruptor hasta probarla.

**Estimación [Adivinando]:** 3–4 semanas (plan del 10-08), más si se decide 4(b).
