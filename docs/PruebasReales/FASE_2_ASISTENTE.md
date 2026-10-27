# Fase 2 — Asistente (web + app) · pruebas reales

Lista viva: se amplía con cada entrega de la fase 2 (última actualización 2026-10-27, 2.3).
Marca `[x]` lo que pase; si algo falla, anota debajo (`//…`): pantalla, qué hiciste, qué esperabas, qué pasó y el error de consola.

## 0. Preparación · 💻 PC
- Web: `apps/web` → `npm run dev`. App: Metro con `-c` (cambian rutas y un archivo nuevo `app/+native-intent.tsx`).
- Interruptores de emergencia: web `ATTENDEE_V1=true` en `apps/web/.env.local` (reiniciar `npm run dev`); app `EXPO_PUBLIC_ATTENDEE_V1=true` en `apps/mobile/.env` (Metro `-c`).

## 2.1 · Marco del asistente
**App · 📱 Celular**
- [x] Abajo, la barra nueva (píldora negra) con Inicio · Explorar · Tickets · Tú y su texto; la sección actual en blanco. Arriba: logo, lupa, campana (con número rojo si hay no leídas) y engranaje.
- [x] Cada botón lleva a su pantalla de siempre (por dentro todavía son las pantallas actuales). Tocar Inicio estando en Inicio sube al principio.
- [x] Sin sesión: Tickets y Tú abren iniciar sesión; Explorar funciona sin sesión.
- [x] Al escribir en un buscador, la barra de abajo se esconde y vuelve al cerrar el teclado.
- [x] Lupa → Explorar; campana → panel de notificaciones (el de siempre); engranaje → Ajustes.
- [x] Con la app en español: Inicio · Explorar · Tickets · Tú.
- [x] Interruptor: `EXPO_PUBLIC_ATTENDEE_V1=true` + Metro `-c` → vuelven la barra y el encabezado de antes. Quitarlo → los nuevos.

**Web · 🌐 PC (ventana ancha)**
- [x] Abre `http://localhost:3000/notifications` con sesión: la dirección **no cambia** y se ve la página nueva con la barra superior (Inicio · Explorar · Tickets · Tú, lupa, campana, engranaje).
- [x] Campana → **panel desplegable** con tus notificaciones (miniatura del flyer si es de un evento, punto rojo si no la leíste, "hace 5 min"). Esc o clic fuera lo cierran.
- [x] Clic en una notificación: se marca leída y abre su pantalla (p. ej. "Ticket vendido" → Compras de ese evento en el organizador v2; RSVP aprobado → Mis tickets). "Organizador no aprobado" no navega y muestra el motivo completo.
- [x] Pasar el mouse por una notificación muestra la ✕ para borrarla sola.
- [x] "Marcar todo como leído" quita los puntos y el número de la campana. "Borrar todo": con no leídas pregunta; con todas leídas borra directo. Recargar: no vuelven.
- [x] Lo que hagas en la web se ve igual en la campana de la app (y al revés) tras refrescar.
- [x] Sin sesión, `/notifications` pide iniciar sesión.

**Web · 🌐 teléfono (ventana angosta o el navegador del celular)**
- [x] Abajo la barra flotante como en la app; la campana lleva a la página `/notifications` (no abre panel).
- [x] Interruptor: `ATTENDEE_V1=true` → `/notifications` lleva al inicio.

## Corrección 2.1 · 📱 Celular
- [x] La campana del encabezado se ve (ícono blanco en su círculo) con y sin notificaciones; con no leídas, un número rojo pequeño en la esquina que no tapa la campana.

## 2.2 · Home (flyer completo)
**App · 📱 Celular**
- [x] En Inicio, arriba a la izquierda el botón de ciudad (📍 Quito ▾ si Quito tiene eventos; si no, "Todas las ciudades") en lugar del logo; en otras pestañas vuelve el logo.
- [x] Eventos agrupados: "Ahora mismo" (los que ya empezaron), "Hoy", "Mañana" y luego fechas ("Viernes, 31 de octubre"), cada grupo con "N eventos".
- [x] Cada tarjeta: logo y nombre del organizador + botón compartir; flyer completo (vertical) con título, "vie, 31 oct · 22:00" y precio ("Desde $15.00", "Gratis", "Agotado", "Tickets pronto") sobre el flyer; "RSVP" arriba a la derecha si pide solicitud.
- [x] Tocar el flyer abre el evento; tocar el organizador abre su página; compartir abre el menú del celular con `https://flme.co/events/…`.
- [x] Botón de ciudad → hoja "¿Dónde sales?" con Todas las ciudades y cada ciudad con su número. Elegir una filtra; Todas muestra todo. Una ciudad sin eventos → mensaje y "Ver todas las ciudades".
- [x] Cerrar la app del todo y abrir: la ciudad vuelve al valor por defecto (no se recuerda). *(Cambiado en la corrección 2.2: el valor por defecto se elige en Ajustes.)*
- [x] Deslizar hacia abajo recarga; tocar Inicio estando en Inicio sube al principio.
- [ ] Interruptor `EXPO_PUBLIC_ATTENDEE_V1=true`: vuelve la Home de siempre.

**Web · 🌐 PC y teléfono**
- [x] `http://localhost:3000/` (con y **sin** sesión): la dirección sigue siendo `/`, se ve la Home nueva con la barra del asistente. En PC, tarjetas en 3 columnas (2 en ventana mediana, 1 en teléfono).
- [x] Mismos grupos, tarjetas, precios y RSVP que en la app; flyer → `/events/…` (la página de evento actual); organizador → `/organizer/…`.
- [x] Botón de ciudad → selector con números; elegir filtra; recargar la página vuelve al valor por defecto.
- [x] Compartir: en el celular abre el menú del sistema; en PC copia el enlace y muestra "Enlace copiado".
- [x] Abajo, el pie con Privacidad, Términos, Términos de compra, Acuerdo de organizador, Cookies, FAQs, Contacto. **Confirma el teléfono correcto** (el v1 muestra "+593 (04) 2510 9060" pero el enlace llama a +59342510906).
- [x] Ver el código fuente de `/` (Ctrl+U): el `<title>` y la descripción son los de siempre y **no** hay `noindex`.
- [ ] `ATTENDEE_V1=true` → vuelve la Home de siempre en `/`.

## Corrección 2.2 (ronda de Kevin, 10-27)
**App · 📱 Celular**
- [ ] Botón de ciudad en Inicio: 📍, nombre y ▾ en una sola línea, centrados en la píldora (el pin ya no queda encima del nombre). Probar con "Quito" y con "Todas las ciudades".
- [ ] Ajustes (engranaje) → bloque **"Ciudad de inicio"** → "Abrir Inicio en": Automática (por defecto), Todas las ciudades y cada ciudad con eventos. Se ve **con y sin sesión**.
- [ ] Elegir Guayaquil → volver a Inicio: ya muestra Guayaquil (aunque antes hayas elegido otra en la hoja).
- [ ] Cerrar la app del todo y abrir: Inicio abre en Guayaquil. Elegir otra ciudad en la hoja vale solo hasta cerrar la app.
- [ ] Ajustes → Todas las ciudades → cerrar y abrir: Inicio abre en "Todas las ciudades". Automática → vuelve la regla de Quito.
- [ ] (Si puedes) una ciudad guardada que hoy no tiene eventos: Inicio usa Automática; en Ajustes sigue apareciendo la ciudad guardada.

**Web · 🌐 Teléfono (o ventana estrecha) y PC**
- [ ] Teléfono, con sesión: **una sola campana** arriba; lleva a `/notifications`. En PC una sola campana que abre el panel.
- [ ] Selector de ciudad: se cierra con la ✕, con Esc y **tocando fuera de la ventana**; tocar dentro (el texto, el espacio entre opciones) no lo cierra.

## 2.3 · Mis tickets y ticket QR
Necesitas una cuenta con: un evento próximo con **2 o más tickets** (mejor si son de dos tiers distintos o incluyen una cortesía), un RSVP pendiente y un evento pasado con ticket escaneado.

**App · 📱 Celular**
- [ ] Pestaña Tickets: título "Mis tickets", contadores Total · Comprados · Pendientes (mismos números que la v1), selector Próximos / Pasados.
- [ ] Próximos: una tarjeta por evento con flyer, cuándo ("En 3 días", "Hoy", "Mañana", "Ahora mismo" o la fecha), hora · lugar, "3 tickets · GA, VIP" y botón QR blanco. Los RSVP aparecen con su estado ("RSVP · pendiente" y una línea que lo explica) y "Ver evento".
- [ ] Pasados: eventos que ya terminaron, con "Asististe" si escaneaste. Sin tickets → "Aún no tienes tickets" + "Buscar eventos". Deslizar hacia abajo recarga.
- [ ] Tocar una tarjeta abre el ticket **a pantalla completa** (sin barra de arriba ni de abajo), sobre los colores del flyer: ticket blanco con flyer, fecha, hora, entrada (tier · etapa) y titular, y el QR.
- [ ] **Deslizar a los lados cambia de ticket sin recargar** (sin pantalla de carga ni parpadeo); "Ticket 2 de 3" y los botones "Ticket 1/2/3" arriba se mueven con él; tocar un botón también cambia.
- [ ] Debajo, el precio, el lugar y el organizador cambian con el ticket que se ve (una cortesía dice "Cortesía").
- [ ] Tocar el QR → QR grande sobre blanco con el nombre del evento; tocar en cualquier parte lo cierra. **Escanéalo con el escáner** (un ticket comprado y una cortesía): debe validar igual que antes.
- [ ] "Cómo llegar" abre Maps con el lugar; "Ayuda" abre soporte; compartir manda `https://flme.co/events/…`. Atrás vuelve a Mis tickets.
- [ ] Un ticket ya escaneado dice "Ya se usó en la puerta" (y sigue mostrando el QR, como la v1).
- [ ] Interruptor `EXPO_PUBLIC_ATTENDEE_V1=true`: vuelven Mis tickets y el ticket de siempre.

**Web · 🌐 PC y teléfono**
- [ ] `http://localhost:3000/account` (con sesión): la dirección sigue siendo `/account`; se ve Mis tickets nuevo dentro de la barra del asistente (en PC tarjetas de 2 en 2). Sin sesión → iniciar sesión.
- [ ] Tarjeta → `/account/ticket/<id>`, a página completa sobre los colores del flyer.
- [ ] Teléfono: deslizar a los lados cambia de ticket. PC: flechas a los costados, botones "Ticket N" y teclas ← →. **La página no recarga**, y la dirección cambia al ticket que se ve: recargar (F5) abre ese mismo ticket.
- [ ] Clic en el QR → QR grande sobre blanco; se cierra con clic o Esc. Escanear una cortesía desde la pantalla: valida.
- [ ] "Cómo llegar" abre Google Maps en otra pestaña; "Ayuda" → `/contact`; compartir abre el menú del sistema (teléfono) o copia el enlace (PC).
- [ ] (Teléfono, si el navegador lo permite) la pantalla no se apaga mientras está abierto el ticket.
- [ ] `ATTENDEE_V1=true` → `/account` y `/account/ticket/…` vuelven a ser los de siempre.

## Cosas conocidas
- Las pantallas del asistente siguen siendo las actuales hasta su entrega: evento y organizador (2.4), Explorar (2.5), Tú y bienvenida (2.6). En la web, el marco nuevo se ve en `/`, `/notifications` y `/account`.
- La Home no tiene buscador (está en Explorar, la lupa) ni guardar (fase 4). Las ciudades no se agrupan por país: los eventos no guardan el país todavía.
- El engranaje de Ajustes sigue arriba hasta que "Tú" (2.6) lo lleve dentro, como el prototipo.
