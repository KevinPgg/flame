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

## Decisiones planteadas (respondidas abajo)
1. **Página de evento:** (a, recomendado) se rediseña en la fase 2 dejando dentro el bloque de compra actual, y la fase 3 lo reemplaza; o (b) toda la página de evento pasa a la fase 3 junto con el checkout (fase 2 más chica, pero el asistente convive más tiempo con la página vieja).
2. **URLs públicas en la web:** (a, recomendado) la v2 se sirve en las **mismas URLs** (`/`, `/events/[slug]`, `/organizer/[slug]`) detrás de un interruptor, para no perder SEO ni enlaces compartidos; o (b) rutas `/v2/...` con redirección como en el organizador.
3. **Home:** "flyer completo" o "cuadrado" (el prototipo deja comparar ambos).
4. **Datos en la app:** (a, recomendado) en la fase 2 se reutilizan los hooks que ya funcionan (Supabase con RLS) y solo se pasa a la API lo que haga falta; o (b) todo el asistente por la API web, como el organizador (más trabajo y riesgo, más consistencia).
5. **Bandeja en la web:** ¿se agrega la campana a la web (lectura por API) o queda solo en la app?
6. **Ciudad elegida:** ¿se recuerda por dispositivo (sin BD) o en la cuenta (columna nueva = fase 4)?

## Decisiones de Kevin (10-27)
1. Página de evento: **(a)** se rediseña en la fase 2 con el bloque de compra actual dentro; la fase 3 lo reemplaza.
2. Web pública: **mismas URLs** (`/`, `/events/[slug]`, `/organizer/[slug]`, `/discover`, `/account`, `/profile`) mostrando la v2 detrás de un interruptor. Nada de `/v2/` para el asistente.
3. Home: **flyer completo** (Kevin, 10-27; no se hace la variante cuadrada).
4. Datos en la app: **reutilizar los hooks que ya funcionan**.
5. Bandeja en la web: **sí**, adaptada a PC (no copia de la app): panel desplegable desde la campana en pantallas anchas, página completa en el teléfono.
6. Ciudad: **no se recuerda** (ni en el dispositivo ni en la cuenta). Es un filtro en memoria; la lista sale de las ciudades con eventos (no de Google Places, que era el autocompletado de crear evento). Al abrir se aplica la ciudad por defecto del catálogo como en v1 (Quito si tiene eventos, regla W0-Q3 de producción); si no, todas.

Pruebas de la 1b (ronda 3), web Manage (ronda 3) y arreglos 10-27: **aprobadas por Kevin (10-27)**.

## Entregas

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

## Entrega 2.1 (2026-10-27): marco del asistente + campana web
**Cómo se sirve la v2 en las mismas URLs (web):** el middleware **reescribe** (no redirige: la dirección no cambia) cada URL pública que ya tiene pantalla v2 hacia `app/v2/attendee/…` (`app/lib/utils/attendee-v2-rewrite.ts`; cada entrega agrega sus rutas). Así la v2 conserva su carpeta, fuentes e idioma (`app/v2/layout.tsx`). `ATTENDEE_V1=true` lo apaga (las páginas que solo existen en v2 van al inicio). Ojo para la 2.2: `/v2(.*)` exige sesión en el middleware; las pantallas públicas (Home, evento, organizador) tendrán que quedar fuera de esa regla y con metadatos indexables (el layout v2 pone `noindex`).

**App** (interruptor `EXPO_PUBLIC_ATTENDEE_V1=true` → v1)
- `components/v2/attendee/AttendeeTabBar.tsx`: barra flotante del prototipo Inicio · Explorar · Tickets · Tú (mismas rutas de hoy; Tickets y Tú sin sesión → iniciar sesión; se oculta con el teclado; tocar Inicio estando en Inicio sube al principio).
- `AttendeeTopBar.tsx`: logo; buscar (→ Explorar), campana con número de no leídas, Ajustes (se queda aquí hasta "Tú" en la 2.6). Mismo alto que la barra v1, para que las pantallas v1 de debajo no se muevan.
- `RoleResolutionGate`: usa estas dos en vez de `Header`/`CustomTabBar` fuera de `/v2`.
- Las pantallas siguen siendo v1 por dentro hasta su entrega (2.2–2.6).

**Web**
- `app/v2/attendee/AttendeeShell.tsx`: en PC, barra superior con las 4 secciones (en sus URLs públicas), buscar, campana y Ajustes; en teléfono, la barra flotante de la app. Sin sesión: "Iniciar sesión", y Tickets/Tú llevan a iniciar sesión.
- **Campana adaptada a PC** (decisión 5): en pantalla ancha abre un **panel desplegable** bajo la campana (Esc, clic fuera o abrir una notificación lo cierran; "Ver todas" → página); en teléfono es un enlace a la página **`/notifications`** (nueva, reescrita a `/v2/attendee/notifications`). En PC cada notificación tiene su botón de borrar (la app desliza). Mismas reglas que la app: "Borrar todo" pregunta solo si hay no leídas. Miniatura del flyer cuando la notificación es de un evento. Se refresca cada minuto y al volver a la pestaña.
- **API nueva `/api/me/notifications`** (GET últimas 50 con `href` y `image`; PATCH marcar leídas `{ids}|{all}`; DELETE `{ids}|{all}`), siempre sobre las filas propias. `app/lib/notifications/web-link.ts` decide adónde abre cada tipo en la web (organizador → pantallas v2 con `?org=slug`; asistente → Mis tickets o la página del evento; rechazo → nada).
- La app sigue leyendo notificaciones directo de Supabase (decisión 4).

**Tests:** app 113/113 (+9 `AttendeeShell`); web v2 204 + API organizador (incluye `me-notifications` 4, `attendee-lib` 7, `AttendeeShell` 11 nuevos); lib 377; tsc web 0, app 40 (heredados). **Causa de los renders vacíos en tests de la app** (10-27): en esta versión de Testing Library `fireEvent.press` es asíncrono; sin `await` los `act()` se solapan. Corregido en `Inbox` y `AttendeeShell` (sin reordenar tests). **No verificado:** aspecto real en navegador y celular.

**Siguiente:** 2.2 Home (las dos variantes de tarjeta para comparar, hoja de ciudades sin recordar).

## Ronda 2.1 de Kevin (10-27)
- 📱 La campana del encabezado no se veía (el número la tapaba o no aparecía). [Adivinando] causa: las clases de posición negativas del número dentro del botón redondo en Android. Rehecho con estilos fijos como el encabezado v1 (ícono centrado, número de 18 px en la esquina con borde negro). **Pendiente de confirmar en el celular.**

## Entrega 2.2 (2026-10-27): Home con flyer completo
- **Reglas compartidas** (`packages/lib/src/utils/home-feed.ts`, 7 tests): `groupEventsByDay` (primero "Ahora mismo" = empezados sin terminar, luego Hoy / Mañana / fechas, en la zona horaria de cada evento), `cityCounts`, `priceSummary` (Gratis / precio / Desde / Agotado / Tickets pronto), `feedWhen` ("vie, 31 oct · 22:00") y `feedDayTitle`. `getLowestPrice` (texto v1 en inglés) ahora usa `lowestPriceInfo` sin cambiar su resultado.
- **App:** `components/v2/attendee/home/` — `HomeFeed` (lista por día, refrescar deslizando, subir arriba con Inicio, vacío por ciudad con "Ver todas las ciudades", error con reintentar), `EventFeedCard` (organizador + compartir `flme.co/events/{slug}`; flyer 4:5 con degradado; título, fecha · hora y precio sobre el flyer; etiqueta RSVP), `CitySheet` (Todas + ciudades con su número). El botón de ciudad reemplaza al logo en el encabezado cuando estás en Inicio (`contexts/AttendeeCityContext.tsx`, en memoria). `useAppEvents` ahora trae el logo del organizador y devuelve también los eventos sin mapear (`rawEvents`); v1 igual. `(tabs)/index.tsx` muestra la v2 salvo `EXPO_PUBLIC_ATTENDEE_V1=true`.
- **Web:** `/` se reescribe a `app/v2/attendee/home` (pública e indexable: los metadatos SEO de la home v1 pisan el `noindex` del layout v2). `app/lib/home-events.ts` (misma consulta que la home v1 + logo, sin tiers ocultos, caché 60 s). `HomeView`: mismas reglas; **adaptada a PC** con las tarjetas en cuadrícula (1 / 2 / 3 por fila); ciudad en un botón arriba que abre un selector; compartir con el menú del sistema o copiando el enlace ("Enlace copiado").
- **Pie de página** en el marco web del asistente con los mismos enlaces legales y de contacto que el v1 (Privacidad, Términos, Términos de compra, Acuerdo de organizador, Cookies, FAQs, Contacto, reembolso). **Anotado para Kevin:** en el pie v1 el teléfono que se ve ("+593 (04) 2510 9060") no coincide con el enlace (`tel:+59342510906`); se copió igual, falta saber cuál es el correcto.
- Fuera de la Home (como el prototipo): el buscador (está en Explorar) y guardar (fase 4). Agrupar ciudades por país necesita el país en los eventos (fase 4).

**Tests:** app 120/120 (+7 `HomeFeed`); web v2 + API 473 (+5 `HomeView`, +1 pie, +1 reescritura); lib 384 (+7). tsc web 0, lib 0, app 40 (heredados). **No verificado:** aspecto real, flyers reales, compartir en el celular.



## Corrección 2.2 (ronda de Kevin, 10-27)
- **Decisión 6 cambiada (Kevin):** la ciudad con la que abre Inicio **se configura en Ajustes y se guarda solo en el celular** (SecureStore; sin BD ni cuenta, no se comparte con la web ni entre teléfonos). Opciones: Automática (regla de Quito, por defecto), Todas las ciudades o una ciudad. Una ciudad guardada sin eventos próximos → Automática. Lo que se elige en la hoja de Inicio sigue valiendo solo para la sesión; guardar un valor nuevo en Ajustes lo aplica enseguida. La web no cambia (sigue la regla de Quito).
  - `apps/mobile/lib/v2/default-city.ts` (leer/guardar + `resolveDefaultCity`), `AttendeeCityContext` (lee el valor al arrancar, `setDefaultPref`), `HomeFeed` (aplica el valor de Ajustes), bloque "Ciudad de inicio" en `UserSettings` (solo con la v2 del asistente; funciona sin sesión).
- 📱 **Pin encima del nombre** en el botón de ciudad: la fila (pin · nombre · ▾) ahora es su propio `View` con estilos fijos, íconos en cajas de 16 px y el texto sin relleno de fuente. [Adivinando] causa: la fila dependía del estilo-función del `Pressable`; pendiente de confirmar en el celular.
- 🌐 **Dos campanas en el teléfono:** la clase compartida del botón llevaba `inline-flex` y el botón del panel `hidden lg:inline-flex`; con Tailwind 4 ganaba `inline-flex` y se veían las dos. Cada campana pone ahora su propio display (test que lo cuida en `AttendeeShell`).
- 🌐 **Selector de ciudad:** se cierra al hacer clic fuera. Opción nueva `closeOnBackdrop` en el `Modal` v2 (apagada por defecto: en los formularios del organizador un clic fuera perdería lo escrito).
- **Degradado del flyer:** se probó un degradado más corto (.97 → .42 en 20 % → transparente en 60 %) y **Kevin pidió volver al anterior** (10-27): `to top` .97 en 0 %, .82 en 42 %, transparente en 100 %, capa del 60 % de alto, igual en web y app.

**Verificación:** jest app 128/128 (+3 `default-city`, +3 `HomeFeed`, +2 `UserSettings`); vitest web v2 231/231 (+1 `HomeView` clic fuera, bell en `AttendeeShell`); web v2 + API 513/519 — los 6 que fallan son `api/purchase/create-payment-intent` (no tocado en esta ronda; [Probable] depende de variables de Stripe del entorno); lib 384/384; tsc web 0, app 40 (heredados, ninguno en archivos nuevos). **Cómo se verificó:** la VM de esta sesión no tenía espacio para la copia Linux (`/sessions` lleno); se empaquetó el código en `_to_delete/flme-src-verify.tgz` (puedes borrarlo) y se corrió en el contenedor en la nube con `node-linker=hoisted` (sin él, jest no transforma react-native).
**No verificado:** aspecto real en el celular y el navegador, degradado con flyers reales.


## Entrega 2.3 (2026-10-27): Mis tickets + ticket QR deslizable
- **Reglas compartidas** (`packages/lib/src/utils/wallet.ts`, 9 tests): `buildWallet` (una tarjeta por **evento** con todos sus tickets válidos de todos los tiers, en orden de compra; RSVP con su estado —pendiente, aprobado, no aprobado, cancelado, pago fallido— solo de eventos próximos; un RSVP aprobado que ya tiene tickets se oculta como en la v1; contadores iguales a la v1), `walletWhen` (ahora / hoy / mañana / en N días ≤ 7 / fecha, en la zona del evento), `eventTicketSlides` (los tickets del evento que se deslizan; un ticket sin QR abierto desde un enlace viejo se muestra solo al inicio, como la v1), `ticketPrice` (mismas reglas que la pantalla QR v1), `ticketQr` (comprado → su imagen `qr_code`; cortesía → **el mismo JSON que la v1**, con su `ticketNumber` dentro de evento + tier), `walletOrganizer`, `directionsUrl`, `walletDayTime`.
- **Cambio frente a la v1:** la v1 agrupaba y deslizaba por evento **+ tier**; ahora por **evento** (todos los tickets de esa salida juntos, pedido de Kevin). La numeración interna del QR de cortesía no cambia.
- **App:** `components/v2/attendee/tickets/Wallet.tsx` (pestaña Tickets: contadores, Próximos/Pasados, tarjetas, RSVP, vacío, error, deslizar para recargar, subir arriba al tocar la pestaña) y `TicketPager.tsx` (pantalla completa sin barras —`RoleResolutionGate` las oculta en `/ticket/` con la v2—; fondo del flyer difuminado; `FlatList` horizontal con paginado sobre los datos ya cargados: **deslizar o tocar "Ticket N" no navega ni recarga**; QR grande en blanco en un `Modal`; Cómo llegar, Ayuda → `/support`, compartir; precio, lugar y organizador del ticket visible). `(tabs)/dashboard.tsx` y `ticket/[id].tsx` muestran la v2 salvo `EXPO_PUBLIC_ATTENDEE_V1=true`. Íconos nuevos: map, help, share.
- **Web:** `/account` → `app/v2/attendee/tickets` (WalletView, en el marco del asistente; 2 columnas en PC) y `/account/ticket/[id]` → `app/v2/attendee/tickets/[id]` (TicketView, página completa). La reescritura ahora acepta rutas con parámetro (`V2_PATTERNS`) y el middleware protege `/account` y `/account/*` (`attendeeNeedsSignIn`). El cambio de ticket es una tira con *scroll-snap* (deslizar en el teléfono; flechas, "Ticket N" y ←/→ en PC); la dirección sigue al ticket con `history.replaceState` (sin navegar), así F5 reabre el mismo. QR de cortesía dibujado con `qrcode` como en la v1. Pide al navegador mantener la pantalla encendida (Wake Lock) cuando se puede. Ayuda → `/contact`.
- **Fuera de esta entrega:** el botón "Recibo" del prototipo (no hay envío de recibos todavía; no se pone un botón que no hace nada), la búsqueda de tickets de la v1 (el prototipo no la tiene), el aviso "Esperando aprobación" de organización que la v1 mostraba en Mis tickets ([Probable] su lugar es Manage/"Tú", 2.6) y mantener la pantalla encendida en la app (no está instalado `expo-keep-awake`; agregarlo pide un build nuevo). La numeración 1, 2, 3… entre compras sigue siendo fase 4 (aquí "Ticket N" es solo la posición en la pantalla).

**Verificación:** jest app 138/138 (+10 `Tickets`); vitest web v2 + API 520/526 (+6 `Tickets`, +1 reescritura; los 6 que fallan son los mismos de `create-payment-intent`, no tocados); lib 393/393 (+9 `wallet`); tsc web 0, lib 0, app 40 (heredados). Verificado en el contenedor en la nube igual que la corrección 2.2 (`_to_delete/flme-src-verify.tgz`).
**No verificado:** aspecto real, el deslizar en el celular, que el escáner valide los QR desde la pantalla nueva (debería: el contenido es el mismo), y `history.replaceState` con el enrutador de Next en el navegador real.

## Corrección 2.3 (ronda de Kevin, 10-27)
- **Pregunta de Kevin: ¿por qué hay `POST /` en el log?** No es código de Flme (no hay server actions en la Home). Es la *server action* `invalidateCacheAction` de `@clerk/nextjs` (`ClerkProvider` del app router): Clerk la llama cuando activa una sesión (`setActive`: iniciar sesión, cambiar de organización, retomar la sesión) para invalidar la caché de Next; Next la envía como `POST` a la página donde estás y responde con la página renderizada otra vez. Los 7–12 s son del modo dev (compilar y renderizar `/`); en producción es mucho menos. [Adivinando] Puede repetirse al volver a la pestaña si Clerk vuelve a activar la sesión. No hace falta cambiar nada.
- 🌐 **Selector que parpadeaba al saltar (2 → 5):** el desplazamiento suave de la tira disparaba `scroll` en cada ticket intermedio y cada uno movía el selector. Ahora, al saltar con un botón, flecha o tecla, se guarda el destino y las posiciones intermedias se ignoran hasta llegar (o al terminar el desplazamiento — `scrollend` — o 1 s como respaldo); después, deslizar a mano vuelve a mover el selector. La app no lo tenía porque allí el índice solo cambia al terminar el deslizamiento.
- 🌐 **Sin barra de desplazamiento** en la tira de tickets ni en los botones "Ticket N": clase `.v2-no-scrollbar` en `v2.css` (`scrollbar-width: none` + `::-webkit-scrollbar { display: none }`) y `scrollbarWidth: none` en línea. [Probable] la clase arbitraria de Tailwind que había no se generaba.
- Tests: web v2 240/240 (+2: salto sin parpadeo y tiras sin barra). tsc web 0.

## Entregas 2.4–2.7 (2026-10-27, Kevin: "avancemos con lo que falta de la fase 2")
**2.4 Página de evento + perfil de organizador**
- Decisión 1a aplicada: **el bloque de compra es la v1 por dentro**. Web: `EventDetail` recibe `header` y `footer` opcionales; sin ellos es idéntico a la v1. Con ellos pinta la cabecera v2 en lugar de (volver · flyer · organizador · título · fecha/lugar) y deja intactos tiers, códigos, cantidad, checkout, RSVP y modales. Como el marco v2 desplaza un contenedor propio (no la ventana), la píldora "Buy Tickets" se esconde con un `IntersectionObserver` y lleva a los tickets con `scrollIntoView`; en el teléfono sube encima de la barra flotante. App: `app/event/[id].tsx` cambia solo la cabecera (`EventHeader` v2) y agrega "Más de…" con la v2; sin barra de arriba en `/event/` y `/organizer/` (traen su propia fila atrás/compartir).
- Web: datos y metadatos del evento movidos tal cual a `app/lib/event-page.ts` (la v1 y la v2 los comparten; se agregó `logo_url` del organizador). `/events/[slug]` → `app/v2/attendee/events/[slug]` (indexable, JSON-LD igual). `/organizer/[slug]` → `app/v2/attendee/organizer/[slug]` con `app/lib/organizer-public.ts` (propios + co-organizados, como la v1); **la reescritura excluye** `/organizer/settings|team|rsvps|event` (pantallas del organizador).
- "Cuándo" en una línea si el evento dura menos de 24 h (las noches que pasan de medianoche).
- `EventTile` (tarjeta chica) en web y app: "Más de", perfil y Explorar.

**2.5 Explorar**
- `packages/lib/src/utils/explore.ts`: `searchExplore` (eventos por nombre, lugar, ciudad u organizador; organizadores por nombre o ciudad; sin tildes ni mayúsculas; todas las palabras), `featuredFirst`. Web `/discover` → `app/v2/attendee/explore` (organizadores en `app/lib/explore-data.ts`; `home-events` ahora trae `is_featured`). App `app/discover.tsx` → `Explore`.
- "Organiza tus eventos": web con las mismas rutas que el `HostBanner` v1; app con la hoja `BecomeOrganizerSheet` v1 (oculta si ya tienes una organización aprobada, como la v1). Organización en revisión → mensaje en la tarjeta (antes la v1 mandaba a Mis tickets, donde estaba el aviso que la 2.3 quitó).
- **Arreglo encontrado:** desde la 2.2 `/?onboarding=true` (adonde mandan `/onboarding`, `/organizer` sin organización, `HostBanner`…) ya no abría la ventana de crear organización porque `/` es la Home v2. `OnboardingFromUrl` en la Home v2 la abre con la misma ventana de la v1.
- FAQs: el contenido compartido de la v1 (`faqs`, solo inglés).

**2.6 Tú, bandeja y bienvenida**
- Tú (web `/profile` → `app/v2/attendee/you`, app `(tabs)/profile` → `You`): foto, nombre, correo, Editar perfil y **Ajustes** (salen de la barra de arriba con sesión; en la app siguen arriba sin sesión), Eventos (asistidos) y Organizadores, Mis organizadores (Gestionar → misma ruta que la v1 / En revisión / Nuevo organizador), aprobación de organizadores para soporte, eventos pasados.
- Bandeja en la app: `InboxCard` v2 dentro del mismo panel (mismas acciones); flyer del evento si está en memoria (lee la caché de eventos, no consulta), tiempo relativo traducido sin `Intl.RelativeTimeFormat` (Hermes). La web ya tenía su bandeja v2 (2.1).
- Bienvenida: web `/sign-in` y `/sign-up` con `WelcomeFrame` (collage de flyers, frase en el idioma del navegador, Clerk en oscuro con `appearance`), `ATTENDEE_V1=true` → página blanca de siempre. App: collage + frase detrás del inicio de sesión existente (Apple/Google/correo sin cambios).

**2.7 Cierre**
- Interruptor revisado: app — cada pantalla mira `attendeeV2Enabled()` (Inicio, evento, organizador, Explorar, Mis tickets, ticket, Tú, inicio de sesión, bandeja, barras); web — `attendeeV2Route` no reescribe nada con `ATTENDEE_V1=true` (y `/notifications` → `/`), y las páginas de Clerk vuelven a la v1.
- **Verificación:** jest app 152/152 (23 suites); vitest web v2 + API 537/543 (los 6 de `create-payment-intent` fallan por sus datos de prueba: "Hold missing reservation currency" — la ruta ahora exige moneda y el test no la manda; no se tocó); lib 397/397; tsc web 0, lib 0, app 40 (los mismos heredados). Verificado en el contenedor en la nube; los archivos se pasaron a la carpeta con `_to_delete/fase2-sync.tgz` (comprobado con md5).
- **No verificado:** todo lo visual y los flujos reales (comprar desde la página nueva, iniciar sesión con Apple/Google sobre el fondo nuevo, Clerk en oscuro, escanear QR).

**Siguiente:** pruebas reales de la fase 2 (`PruebasReales/FASE_2_ASISTENTE.md`, 2.2 a 2.7) y luego la fase 3 (pagos: hoja de tickets, códigos, checkout, RSVP).
