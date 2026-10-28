# 2026-10-28 · Corrección: compra en la página de evento (barras fijas, cantidad en la tarjeta, checkout)

**Pedido de Kevin:** al tocar un tier la pantalla saltaba al final. Seguir el prototipo `flame-2.0`: atrás / compartir (luego me gusta / seguir) **fijos arriba**; abajo una barra fija con "Continuar al pago" o, si ya tiene entradas, "Ver mis tickets"; elegir la cantidad al tocar el tier **sin desplazar**; la barra de compra **reemplaza el menú flotante** inferior. En el checkout: el campo de promotor era más alto que los demás (todos iguales) y, en RSVP, distinguir los campos de las preguntas del organizador de los de pago (descuento / promotor).

**Causa del salto (app):** `app/event/[id].tsx` llamaba `scrollToEnd` cada vez que cambiaba el tier (efecto `scrollToCheckout`, para mostrar el botón "Continue to Checkout" que estaba al fondo). En la web no había salto, pero el botón "Continue" quedaba debajo de los tiers.

**Causa del promotor alto (app):** en `CheckoutMainSheet` el promotor era un `View` con `py-3` que envolvía un `TextInput` (que en Android trae su propio relleno); el descuento era un `TextInput` con `py-3` directo. Alturas distintas.

## Qué se hizo (solo con la v2; v1 / producción sin cambios)
- **lib:** `myEventState(rows, eventId)` en `utils/wallet` → tickets de puerta del usuario para ese evento + su solicitud RSVP abierta. Lo usan web y app para la barra inferior. Textos nuevos `event.*` (tickets, onSale, opensNext, salesEnded, maxPer, select, request, unlocked, from, rsvpFrom, youreGoing, viewNTickets, requestSent, requestPending, noTicketsOnSale) y `checkout.continueToCheckout`, `checkout.signInToContinue` (en/es).
- **App:**
  - `components/v2/attendee/event/TierList.tsx` (nuevo): tarjetas del prototipo; al elegir, "Elegir" se vuelve −/+ en la misma tarjeta. Tocar el tier elegido no lo deselecciona.
  - `components/v2/attendee/event/EventChrome.tsx` (nuevo): `EventTopBar` (atrás + compartir, absolutos sobre un degradado) y `BuyBar` (barra inferior).
  - `app/event/[id].tsx`: sin `scrollToEnd` en v2; `TierList` en vez de `TicketSelection`; sin `CheckoutCTA` ni píldora en v2; estados de la barra: tickets → "Ver N tickets" (`/ticket/<id>`); RSVP pendiente → desactivado; tier elegido → "Continuar al pago" (abre la hoja de checkout de siempre); nada → "Desde $X" + "Comprar tickets" (sube a los tiers, no elige solo). `useUserTickets` se pide en v2 para todos los eventos.
  - `EventHeader` (v2): ya no tiene atrás/compartir (deja el hueco de 40 px).
  - `components/event-details/CheckoutMainSheet.tsx` (compartida v1/v2): todos los campos, botones Aplicar y etiquetas "aplicado" a 48 px; las preguntas RSVP en un recuadro propio ("RSVP questions" + "<organizador> asks this to review your request.") y aparte "Payment codes (optional)" / "Codes (optional)" con descuento y promotor (con etiqueta cada uno). En RSVP pagado: "They only apply to the charge if your request is approved." Textos de esta hoja en inglés como el resto de la hoja v1.
- **Web:**
  - `AttendeeShell`: prop `hideTabBar`; la página de evento la usa (sin barra de pestañas en teléfono).
  - `events/[slug]/EventHeader.tsx`: nuevo `EventTopBar` sticky bajo la barra del sitio (no ocupa espacio; el encabezado deja el hueco). Compartir se movió ahí.
  - `events/[slug]/TierCard.tsx` (nuevo): `TierCard`, `BuyBar`, `buyBtn`.
  - `components/EventDetail.tsx` (v2): tarjetas `TierCard` con −/+; la barra inferior con los mismos estados (sin sesión, `SignInButton`); sin el "Continue" bajo los tiers, sin el aviso de iniciar sesión y sin la píldora en v2; título "Tickets"; cambiar de tier borra el descuento aplicado (dependía del subtotal).
  - Ícono `lock` añadido al set v2.

## Verificación
- lib 399/399 (+2 `myEventState`); tsc lib 0, web 0, app 40 (los mismos heredados).
- jest app 161/161 (+7 `EventPurchase`: tarjetas, −/+, barra, checkout con alturas y secciones; `EventOrganizer` ajustado).
- vitest web v2 262/262 (`EventCheckout` +2: cantidad en la tarjeta y barra; "You're going · View 2 tickets"; `EventOrganizer` ajustado: compartir en la barra). Los 3 "errores" que imprime vitest son de `Tickets.test` (jsdom no tiene `scrollTo`), archivo no tocado.
- Corrido en el contenedor en la nube con el código empaquetado; archivos comprobados con md5. Quedaron `_to_delete/flme-src-verify-1028.tgz` y `_to_delete/flme-supabase-dirs-1028.tgz` (no se pudieron borrar desde aquí; puedes eliminarlos).
- **No verificado:** aspecto real en celular y navegador (degradado de la barra superior, la barra inferior con el área segura del iPhone, el sticky de la web con la barra del sitio).

## Relación con la fase 3
Adelanta parte de la 3.2 (selección de cantidad) sin crear la "hoja del tier" del prototipo: aquí la cantidad se elige en la tarjeta y "Continuar al pago" abre la hoja de checkout actual. Los arreglos 3.1 (B2, B10, B3, B4) siguen pendientes — en especial B2 en la app: el botón de pagar no espera la validación del promotor.

Pruebas reales: `docs/PruebasReales/FASE_2_ASISTENTE.md` → "Corrección 10-28".
