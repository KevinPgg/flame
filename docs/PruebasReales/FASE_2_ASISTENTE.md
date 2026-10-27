# Fase 2 — Asistente (web + app) · pruebas reales

Lista viva: se amplía con cada entrega de la fase 2 (última actualización 2026-10-27, 2.4–2.7: fase 2 completa).
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
- [x] Botón de ciudad en Inicio: 📍, nombre y ▾ en una sola línea, centrados en la píldora (el pin ya no queda encima del nombre). Probar con "Quito" y con "Todas las ciudades".
- [x] Ajustes (engranaje) → bloque **"Ciudad de inicio"** → "Abrir Inicio en": Automática (por defecto), Todas las ciudades y cada ciudad con eventos. Se ve **con y sin sesión**.
- [x] Elegir Guayaquil → volver a Inicio: ya muestra Guayaquil (aunque antes hayas elegido otra en la hoja).
- [x] Cerrar la app del todo y abrir: Inicio abre en Guayaquil. Elegir otra ciudad en la hoja vale solo hasta cerrar la app.
- [x] Ajustes → Todas las ciudades → cerrar y abrir: Inicio abre en "Todas las ciudades". Automática → vuelve la regla de Quito.
- [ ] (Si puedes) una ciudad guardada que hoy no tiene eventos: Inicio usa Automática; en Ajustes sigue apareciendo la ciudad guardada. `//Si la ciudad no tiene eventos entonces no se muestra en el listado`

**Web · 🌐 Teléfono (o ventana estrecha) y PC**
- [x] Teléfono, con sesión: **una sola campana** arriba; lleva a `/notifications`. En PC una sola campana que abre el panel.
- [x] Selector de ciudad: se cierra con la ✕, con Esc y **tocando fuera de la ventana**; tocar dentro (el texto, el espacio entre opciones) no lo cierra.

## 2.3 · Mis tickets y ticket QR
Necesitas una cuenta con: un evento próximo con **2 o más tickets** (mejor si son de dos tiers distintos o incluyen una cortesía), un RSVP pendiente y un evento pasado con ticket escaneado.

**App · 📱 Celular**
- [x] Pestaña Tickets: título "Mis tickets", contadores Total · Comprados · Pendientes (mismos números que la v1), selector Próximos / Pasados.
- [x] Próximos: una tarjeta por evento con flyer, cuándo ("En 3 días", "Hoy", "Mañana", "Ahora mismo" o la fecha), hora · lugar, "3 tickets · GA, VIP" y botón QR blanco. Los RSVP aparecen con su estado ("RSVP · pendiente" y una línea que lo explica) y "Ver evento".
- [x] Pasados: eventos que ya terminaron, con "Asististe" si escaneaste. Sin tickets → "Aún no tienes tickets" + "Buscar eventos". Deslizar hacia abajo recarga.
- [x] Tocar una tarjeta abre el ticket **a pantalla completa** (sin barra de arriba ni de abajo), sobre los colores del flyer: ticket blanco con flyer, fecha, hora, entrada (tier · etapa) y titular, y el QR.
- [x] **Deslizar a los lados cambia de ticket sin recargar** (sin pantalla de carga ni parpadeo); "Ticket 2 de 3" y los botones "Ticket 1/2/3" arriba se mueven con él; tocar un botón también cambia.
- [x] Debajo, el precio, el lugar y el organizador cambian con el ticket que se ve (una cortesía dice "Cortesía").
- [x] Tocar el QR → QR grande sobre blanco con el nombre del evento; tocar en cualquier parte lo cierra. **Escanéalo con el escáner** (un ticket comprado y una cortesía): debe validar igual que antes.
- [x] "Cómo llegar" abre Maps con el lugar; "Ayuda" abre soporte; compartir manda `https://flme.co/events/…`. Atrás vuelve a Mis tickets.
- [x] Un ticket ya escaneado dice "Ya se usó en la puerta" (y sigue mostrando el QR, como la v1).
- [ ] Interruptor `EXPO_PUBLIC_ATTENDEE_V1=true`: vuelven Mis tickets y el ticket de siempre.

**Web · 🌐 PC y teléfono**
- [x] `http://localhost:3000/account` (con sesión): la dirección sigue siendo `/account`; se ve Mis tickets nuevo dentro de la barra del asistente (en PC tarjetas de 2 en 2). Sin sesión → iniciar sesión.
- [x] Tarjeta → `/account/ticket/<id>`, a página completa sobre los colores del flyer.
- [x] Teléfono: deslizar a los lados cambia de ticket. PC: flechas a los costados, botones "Ticket N" y teclas ← →. **La página no recarga**, y la dirección cambia al ticket que se ve: recargar (F5) abre ese mismo ticket.
- [x] Clic en el QR → QR grande sobre blanco; se cierra con clic o Esc. Escanear una cortesía desde la pantalla: valida.
- [x] "Cómo llegar" abre Google Maps en otra pestaña; "Ayuda" → `/contact`; compartir abre el menú del sistema (teléfono) o copia el enlace (PC).
- [x] (Teléfono, si el navegador lo permite) la pantalla no se apaga mientras está abierto el ticket.
- [ ] `ATTENDEE_V1=true` → `/account` y `/account/ticket/…` vuelven a ser los de siempre.

## Corrección 2.3 (ronda de Kevin, 10-27)
**Web · 🌐 PC y teléfono** (`/account/ticket/<id>` de un evento con 3 o más tickets)
- [ ] Saltar con los botones de Ticket 2 a Ticket 5: el selector pasa directo a 5, sin parpadear por 3 y 4. Lo mismo con las flechas y las teclas ← →.
- [ ] Después del salto, deslizar con el dedo (o el trackpad) sigue moviendo el selector al ticket que queda.
- [ ] No se ve barra de desplazamiento ni bajo los tickets ni bajo los botones "Ticket N" (Chrome, Edge, Safari y Firefox si los tienes).

## 2.4 · Página de evento y perfil de organizador
**App · 📱 Celular**
- [ ] Abrir un evento desde Inicio: sin la barra de arriba; atrás y compartir en círculos; flyer grande sobre sus colores difuminados; logo y nombre del organizador (y co-organizadores "A & B") → toca y abre su perfil; título grande.
- [ ] "Cuándo" en una línea para eventos de una noche ("vie, 30 oct · 22:00 – 03:00"); "Lugar" con botón **Cómo llegar** (abre Maps); si pide RSVP, la línea "Requiere RSVP…".
- [ ] Descripción en 3 líneas con **Más / Menos**; los enlaces y @instagram siguen tocables.
- [ ] **El bloque de compra es el de siempre** (tiers, códigos de acceso y promotor, cantidad, checkout, RSVP, pago) y funciona igual: compra uno gratis y uno pagado de prueba, y un RSVP. La píldora "Buy Tickets" lleva a los tickets.
- [ ] Debajo, "Más de {organizador}" con sus otros eventos (deslizar a los lados); tocar abre ese evento.
- [ ] Perfil de organizador: portada (o el logo difuminado si no tiene), logo grande, nombre, ciudad, @instagram (abre Instagram), "N eventos próximos", descripción, compartir; Próximos en 2 columnas (incluye los co-organizados); Pasados. Sin seguidores ni "Seguir" (fase 4).
- [ ] Interruptor `EXPO_PUBLIC_ATTENDEE_V1=true`: vuelven la página de evento y el perfil de siempre.

**Web · 🌐 PC y teléfono**
- [ ] `/events/<slug>` (con y sin sesión): misma dirección, página nueva dentro del marco del asistente; el bloque de compra de siempre funciona (comprar, RSVP, códigos). En el teléfono la píldora "Buy Tickets" queda **encima** de la barra flotante.
- [ ] Ctrl+U en `/events/<slug>`: `<title>` y descripción del evento, `og:image` del flyer, el JSON-LD del evento, y **sin** `noindex`.
- [ ] "Más de {organizador}" en cuadrícula. Compartir: menú del sistema o "Enlace copiado".
- [ ] `/organizer/<slug>`: perfil nuevo (como la app); Ctrl+U sin `noindex`. **Las pantallas del organizador** `/organizer`, `/organizer/settings`, `/organizer/team`, `/organizer/rsvps`, `/organizer/event/…` siguen funcionando como antes.
- [ ] `ATTENDEE_V1=true` → página de evento y perfil de siempre.

## 2.5 · Explorar
**App · 📱 Celular** (pestaña Explorar o la lupa)
- [ ] "Explorar", buscador; abajo: Eventos destacados (los marcados como destacados primero), Organizadores destacados (portada + logo → perfil), tarjeta "Organiza tus eventos" y Preguntas frecuentes (la primera abierta) + "Ver todas las preguntas".
- [ ] Buscar por nombre de evento, lugar, ciudad u organizador; sin importar tildes ("cumbia" encuentra "Cúmbia"); también encuentra organizadores. Sin resultados → mensaje y "Borrar búsqueda".
- [ ] "Postular como organizador": sin sesión → iniciar sesión; con sesión → la hoja de solicitud de siempre. Con una organización en revisión → "Tu organización está en revisión…". Con una aprobada → la tarjeta no aparece (como la v1).

**Web · 🌐 PC y teléfono** (`/discover` o la lupa)
- [ ] Lo mismo adaptado a PC (resultados en cuadrícula). Ctrl+U: metadatos de Discover y sin `noindex`.
- [ ] "Postular como organizador": sin sesión → iniciar sesión y luego la creación de organización; con sesión sin organización → **se abre la ventana de crear organización**; aprobada → "Crear un evento" (va al panel del organizador); en revisión → mensaje.
- [ ] **Arreglo importante (venía roto desde la 2.2):** `http://localhost:3000/?onboarding=true` con sesión abre otra vez la ventana de crear organización (es adonde mandan `/onboarding`, `/organizer` sin organización, etc.).

## 2.6 · Tú, bandeja y bienvenida
**App · 📱 Celular**
- [ ] Pestaña Tú: foto, nombre y correo; "Eventos" (a los que asististe) y "Organizadores"; **Editar perfil** y **Ajustes** (Ajustes ya no está arriba con sesión; sin sesión sigue arriba).
- [ ] Mis organizadores: aprobada → "Gestionar" abre su panel (como antes); en revisión → "En revisión"; "Nuevo organizador" abre la hoja de solicitud. Si eres soporte de Flame, la entrada "Aprobación de organizadores".
- [ ] Eventos pasados (5) → abren su ticket; "Historial" → Mis tickets.
- [ ] Campana: cada notificación de un evento próximo muestra su flyer a la izquierda (si no, un ícono); "Hace 5 min", "Ayer"… en tu idioma; punto rojo si no está leída; tocar, deslizar para borrar y "Borrar todo" como antes.
- [ ] Iniciar sesión: detrás, collage de flyers reales que se funde a negro, y "Todas las noches que valen la pena…". **Apple, Google y correo funcionan igual** (iniciar sesión y crear cuenta).

**Web · 🌐 PC y teléfono**
- [ ] `/profile`: lo mismo que la app (Ajustes → `/v2/account`; organizador aprobado → su panel; "Nuevo organizador" abre la ventana de crear organización). Sin sesión → iniciar sesión.
- [ ] El engranaje ya no está en la barra de arriba (está dentro de Tú).
- [ ] `/sign-in` y `/sign-up`: fondo negro con el collage, logo, la frase (en el idioma del navegador) y el formulario de Clerk en oscuro. Iniciar sesión, crear cuenta, Google, "¿olvidaste tu contraseña?" y el código por correo funcionan. El inicio de sesión en ventana emergente (botón "Iniciar sesión" de la v1) sigue igual.

## 2.7 · Cierre de la fase 2
- [ ] Recorrido completo en el celular: Inicio → evento → comprar → Mis tickets → QR → Tú → Ajustes → Explorar → organizador.
- [ ] Recorrido completo en la web (PC y teléfono) con y sin sesión.
- [ ] Interruptor completo: con `EXPO_PUBLIC_ATTENDEE_V1=true` (app) y `ATTENDEE_V1=true` (web) **todo** el asistente vuelve a la v1 (Inicio, evento, organizador, Explorar/Discover, Mis tickets, ticket, Tú/Profile, iniciar sesión) y `/notifications` lleva al inicio.

## Cosas conocidas
- El bloque de compra de la página de evento (tiers, códigos, checkout, RSVP) es el de la v1 por dentro, con su estilo y en inglés: lo reemplaza la fase 3.
- La Home no tiene buscador (está en Explorar) ni guardar (fase 4). Sin seguidores, "Seguir", guardados, categorías, line-up ni búsqueda de artistas (fase 4). Las ciudades no se agrupan por país.
- Las preguntas frecuentes de Explorar están solo en inglés (es el contenido que ya existía, compartido con la v1).
- La pantalla de Tú y Explorar en la web reutilizan la ventana de "crear organización" de la v1 (su estilo es el de siempre).
