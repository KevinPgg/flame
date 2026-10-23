# Fase 1b — Organizador en la app · pruebas reales

Lista viva: se amplía con cada entrega de la fase 1b. Mismo formato que la fase 1. **Dispositivo principal: 📱 celular**
(build Android local con Metro). Cada sección dice dónde probar.

**Cómo levantar todo (cada vez):**
1. Web (la app lee todo de la API web): en `apps/web` → `npm run dev`. Debe responder en `http://192.168.2.63:3000` (lo que dice `EXPO_PUBLIC_API_URL` en `apps/mobile/.env`), así que el celular tiene que estar en la **misma Wi-Fi** que el PC.
2. Celular por USB: `adb devices` (debe aparecer) y `adb reverse tcp:8081 tcp:8081`.
3. En `apps/mobile` → `npx expo start --dev-client -c` (`-c` limpia la caché: úsalo tras cada entrega). Abre la app **Flame (dev)** en el celular; si no conecta sola, en la terminal de Metro pulsa `a`.
4. Solo si una entrega agrega un módulo nativo (lo diré): `npx expo run:android` para recompilar. Hasta ahora no hace falta.

## 0. Preparación · 💻 PC
- [x] `pnpm --filter @project-flame/mobile test` en Windows: 13 tests en verde (base, marco, panel). Tras la 1b.2a deben ser 23.
- [x] App en el celular (build Android local) o `localhost:8081`, con la web corriendo (la app v2 lee todo de la API web: `EXPO_PUBLIC_API_URL`).

## Ronda 1 (2026-10-23) — volver a probar tras las correcciones · 📱 Celular
Correcciones de tu ronda 1. Lo que ya pasó en la ronda 1 se mantiene marcado más abajo.
- [x] **Diseño de teléfono (prototipo), sin menú lateral.** Arriba: ← (vuelve al perfil), nombre de la organización con ▾, botón blanco "+" (crear evento, owner/admin) y tu avatar (→ perfil). Abajo: **Eventos · RSVPs · Escanear · Manage** (organizer: Eventos · RSVPs · Escanear; viewer: Eventos · RSVPs) con el número de RSVPs pendientes.
- [x] Tocar el nombre de la organización → hoja desde abajo con tus organizaciones aprobadas (la actual con ✓) y "Mis organizadores". Elegir otra abre su panel.
- [x] Panel: tarjeta con el logo sobre su color, nombre, rol (si no eres owner), "✓ Stripe conectado" o "Termina la configuración de Stripe", y Total de ingresos / Total de eventos (owner/admin). El chip "Gestionar" ya no está (eso es la pestaña Manage).
- [x] Organización con eventos solo actuales (o solo pasados): sin el selector Actuales/Pasados, solo el título con el número. Con ambos: el selector. La búsqueda aparece solo con más de 4 eventos.
- [x] **Manage** (owner/admin): "Gestionar organización", con una frase y tres filas: Equipo (N miembros), Pagos ($… disponibles, o "Conecta Stripe para cobrar") y Ajustes. Cada fila abre su pantalla **v1** por ahora (Equipo, Pagos y Ajustes pasan a v2 en la 1b.5). Finanzas y Comunicaciones del prototipo no se muestran: aún no existen.
- [x] **Escanear** abre el escáner de la app actual (el v2 llega en la 1b.6).
- [x] **Idioma (al arrancar):** (Kevin marcó 1b.0: en frío sale en español.) releerlo al volver a la app no funcionó (Kevin, 10-23) → se deja leerlo solo al abrir la app. Prueba en frío: idioma en Español en la web (🌐 Mi cuenta) → en el celular **cierra la app del todo** (deslízala fuera de recientes) y ábrela → el organizador v2 en español. Si sigue en inglés, hay un fallo de lectura: copia lo que diga Metro (`[i18n] Failed to read…` o nada) y dime si tu usuario de la web y el del celular son la misma cuenta.

## 1b.0 · Base (idioma, fuentes, interruptor) · 📱 Celular
- [x] Con tu cuenta en español (Mi cuenta en la web → Español), el organizador v2 de la app sale en español; en inglés, en inglés. El resto de la app (v1) no cambia. `//Ronda 1: la parte de asistente sigue en inglés (esperado: se traduce en la fase 2) y el organizador v2 no tomaba el idioma → corregido, ver Ronda 1.`
- [x] Textos del organizador v2 con la tipografía nueva (Inter / Inter Tight), no Poppins. `//Ronda 1: era una copia de la web reducida; rehecho con el diseño de teléfono del prototipo (ver Ronda 1).`
- [x] Interruptor de emergencia: `EXPO_PUBLIC_ORGANIZER_V1=true` en `apps/mobile/.env` y reiniciar Metro con `--clear` → al tocar una organización abre el panel v1 de siempre. Quitarlo después.

## 1b.1 · Panel del organizador · 📱 Celular
- [x] Perfil → Mis organizadores → tocar una organización aprobada → abre el panel v2 (sin la barra de pestañas de asistente ni el encabezado de la app). Atrás vuelve al perfil.
- ~~Una organización pendiente de aprobación no se abre.~~ Quitado: la prueba era sobre tus organizaciones; lo que viste es la **cola de aprobación de soporte** del perfil (está bien que se gestione desde el celular). Pasa a estilo 2.0 en la 1b.5.
- [x] Notificación de organizador → al tocarla abre el panel v2 de esa organización. **Cómo provocarla:** ver "Notificaciones de organizador" abajo.
- [x] Owner/admin: KPIs (total de eventos = propios + co-organizados; ingresos solo de los propios). **Compara los números con el panel web v2** de la misma organización.
- [x] Organizer asignado: solo sus eventos, aviso "Ves los eventos asignados a ti", sin KPIs ni "+". Organizer sin asignaciones: lista vacía con el aviso.
- [x] Búsqueda: "carnaval" ↔ "Carnával"; si lo buscado está en la otra pestaña aparece "1 coincidencia en Pasados · Ver".
- [x] Cada evento: flyer, fecha · hora · lugar, ingresos y asistentes; chip rojo de RSVP con pendientes; chip "Co-organizado con …". Tocarlo abre el detalle de evento **v2** (1b.2a).
- [x] Deslizar hacia abajo recarga. Sin conexión con la web → "Algo salió mal" + "Reintentar".
- ~~Menú ☰~~ Quitado: el menú lateral ya no existe en la app (diseño de teléfono, ver Ronda 1).
- [x] Nada se corta ni se esconde detrás de la barra inferior o del notch.

### Notificaciones de organizador · 📱 Celular + 🌐 Web
Hoy existen dos, y se guardan en la app aunque el celular no reciba push (Android sin Firebase): aparecen en la **campana** del encabezado de la app (lado asistente: Inicio / Perfil), no dentro del organizador.
- [x] **Nueva solicitud de RSVP** (`new_rsvp_request`, va a owner/admin de la organización): con **otra cuenta** (otro navegador o ventana privada en 🌐), pide entrar a un evento RSVP tuyo. En tu celular, sal del organizador (avatar) → campana: aparece la solicitud. Tocarla → abre las RSVPs.
- [x] **Ticket vendido** (`ticket_sold`): con otra cuenta compra un ticket (Stripe test `4242 4242 4242 4242`) → campana.
- Comprobación en la BD si no aparece: `select type, title, created_at from notifications where user_id = '<tu id de users>' order by created_at desc limit 5;`

## 1b.2a · Detalle de evento: marco, Tiers, Compras, Desglose · 📱 Celular
Compara cada número con el **mismo evento en la web v2** (🌐 `localhost:3000/v2/organizer/event/<id>?org=<slug>`).
- [x] Panel → tocar un evento → abre el detalle v2: flyer con su color desenfocado detrás, estado (Publicado / Borrador / Terminado), chip RSVP, nombre, fecha · hora · lugar. Atrás vuelve al panel.
- [x] KPIs: Tickets (capacidad), Solicitados (RSVPs pendientes), Vendidos, Ingresos (neto). Igual que la web.
- [x] Botones: "Co-organizadores" (owner/admin del dueño, con el número; ver 1b.2b), "Gestionar RSVPs" con pendientes (→ RSVPs v1, v2 en la 1b.3), "Editar evento" (owner/admin/organizer asignado → edición v1, v2 en la 1b.4). `//1b.2b: Co-organizadores ya no abre v1 → volver a probar en 1b.2b.`
- [x] Pestañas deslizables: Tiers, Compras, Desglose, Enlaces de promotor, Códigos, Enviar tickets, Escáner; la activa con raya roja y siempre visible al cambiar. La barra de pestañas queda pegada arriba al hacer scroll.
- [x] **Tiers:** vendidos/total con barra, "N pendientes" (reservas), restantes, ingresos del tier. Interruptores "Agotado" y "Oculto" guardan al tocarlos (compruébalo en la web: el cambio aparece). Si ocultas todos, aparece el aviso amarillo.
- [x] Tiers: "Editar" y "Nuevo tier" abren la edición v1 (el editor v2 llega en la 1b.4).
- [x] Viewer (si lo usas): ve los tiers con etiquetas "Agotado"/"Oculto", sin interruptores ni "Editar evento".
- [x] **Compras:** lista (comprador, email, tier · cantidad · fecha, "Escaneado"/"Sin escanear", monto). Buscar por nombre, email o tier.
- [x] Compras → "Exportar XLSX": se abre el menú de compartir del celular con el `.xlsx`; ábrelo (Drive / Excel) y compara con el exportado desde la web (mismas columnas, incluidas las preguntas de registro si el evento las tiene).
- [x] **Desglose:** Tarjeta (pagado por compradores, comisiones, para ti), Transferencia (cobrado por ti), Gratis; total; ventas por tier y por promotor. Igual que la web.
- [x] Evento co-organizado (de otra organización): aviso "Co-organizas este evento…"; Compras y Desglose dicen que solo los ve el dueño; sin "Editar evento".
- [x] Deslizar hacia abajo recarga. Un evento que no es de tu organización (enlace viejo) → "Este evento no está disponible…" + Atrás.

## 1b.2b · Detalle de evento: Promotores, Códigos, Enviar tickets, Escáner, Co-organizadores · 📱 Celular
Mismo comportamiento que la web v2 (fase 1, §4 y §7c); compara con 🌐 la web del mismo evento.
- [x] **Enlaces de promotor:** crear con código (en mayúsculas; 1 letra → error) y nombre opcional; aparece en la lista ordenada por ventas. "Copiar" → pégalo en el navegador del celular: abre `…/events/<evento>?promoter=<CÓDIGO>` en **www.flme.co** (o lo que diga `EXPO_PUBLIC_APP_URL`). Borrar pide confirmación. Viewer: solo lista.
- [x] **Códigos:** agregar con % (chips 5–100) y límite de uso (0 → "El límite de uso debe ser al menos 1"); tarjeta con barra de uso y Activo / Agotado; borrar con confirmación.
- [x] **Enviar tickets — gratis:** buscar email exacto → elegir persona → tier y cantidad (− / +; aviso si supera lo que queda) → confirmar → "N tickets enviados a …"; aparece en "Enviados" y la persona recibe el ticket/correo. `//Ronda 2 (10-23): se envió pero salió "Algo salió mal" y quedó en Confirmar (1 de 2) → corregido, ver 1b.6/correcciones.`
- [x] **Enviar tickets — transferencias:** email sin cuenta → "Crear orden sin cuenta de Flame"; "Poner un precio propio" (acepta "12,50"); confirmar → orden registrada; en Desglose aparece en Transferencia.
- [x] **Escáner:** "Escanear tickets ahora" (abre el escáner de la app actual). Cuentas: agregar por email (sin cuenta → "debe registrarse"; miembro → "ya puede escanear"; repetido → aviso); quitar con confirmación. Código (owner/admin): crear, copiar, nuevo código y quitar con confirmación, "Elegir el mío" (`door-12` → `DOOR12`; uno de otro evento → "Otro evento ya usa este código"). Organizer: gestiona cuentas, en Código ve "Solo dueños y admins…".
- [x] **Co-organizadores** (botón arriba, owner/admin): hoja desde abajo con los actuales; buscar organización por nombre (solo aprobadas, sin la tuya ni las que ya están); "Agregar"; "Quitar" pide confirmación. En la web el evento muestra los mismos co-organizadores.
- [x] Teclado: al escribir en cualquier campo de estas pestañas, el botón de la acción sigue visible (si el teclado lo tapa, anótalo con la pestaña). `//Ronda 2: sí se tapan → corregido (la barra inferior se oculta al escribir).`

## 1b.6 adelantada + correcciones de la ronda 2 (2026-10-23) · 📱 Celular
**Escáner por cuenta (sin código):**
- [x] Organizador → pestaña **Escanear**: lista "Elige un evento" con los eventos que tu cuenta puede escanear (tus organizaciones, co-organizados y a los que te agregaron), con "Ahora" en el que está en curso; si hay solo uno en curso, se abre directo. **No pide código.**
- [x] Evento → Escáner → "Escanear tickets ahora" → abre el escáner ya en ese evento.
- [x] Escanear un ticket del evento → "Ticket válido" (nombre, tier, "Ticket 2 de 3") → "Registrar entrada" → "Entrada registrada"; aparece en "Escaneos recientes". Volver a escanear el mismo → "Ya registrado" con la hora. Ticket de otro evento → "Este ticket es de otro evento".
- [x] **Flash:** encender y **apagar** varias veces (al apagar, la cámara se reinicia un instante: es a propósito). "Detener cámara" también lo apaga.
- [x] **Persona agregada (no miembro):** en 🌐 web (o en la app) agrega en Escáner → Cuentas una cuenta Flame que **no** sea de tu organización. Entra con esa cuenta en el celular → Ajustes → **Scan Tickets** → ve ese evento en la lista y escanea sin código. Un ticket de otro evento tuyo → "No puedes escanear tickets de este evento".
- [x] Ajustes → Scan Tickets **sin sesión** → escáner con código de acceso (como antes). **Con sesión**, abajo de la lista: "¿Tienes un código de acceso? Escanear con el código" → ese mismo escáner con código.
- [x] Cuenta sin eventos para escanear → "No tienes eventos para escanear… pide al organizador que te agregue…".
- [x] Viewer (si lo usas): también ve Escanear (cualquier miembro puede escanear).

**Compras con asistencia (app 📱 y 🌐 web):**
- [x] Pestaña Compras: aparecen ventas, transferencias y tickets enviados gratis, cada uno con su **origen** (Venta / Transferencia / Envío gratis) y **escaneados "x/N"** (verde completo, amarillo parcial, gris ninguno); abajo "X de Y tickets escaneados". Escanea 1 de una compra de 2 → pasa a "1/2". Compara app y web.

**Enviar tickets:**
- [x] Enviar gratis justo después de reiniciar la web (`npm run dev`, primera llamada lenta): ya no sale "Algo salió mal"; si tarda más de 1 minuto sale "No pudimos confirmar el envío a tiempo… revisa Enviados" y la lista se actualiza.

**Teclado:**
- [ ] Al escribir en cualquier campo del organizador (búsqueda, enlaces, códigos, enviar tickets, escáner), la barra inferior desaparece y los botones quedan visibles; al cerrar el teclado vuelve. ~~En Co-organizadores, la hoja sube con el teclado.~~ `//Ronda 3: la hoja no subía → corregido, ver Ronda 3.`

## Ronda 3 (2026-10-23) — correcciones
**Co-organizadores con teclado · 📱 Celular** (reinicia Metro con `-c`)
- [x] Evento → Co-organizadores → toca "Buscar organización": la hoja **sube entera** encima del teclado; se ven el campo y los resultados con "Agregar". Cierra el teclado → la hoja baja a su sitio, sin hueco abajo.
- [x] Si queda un hueco entre la hoja y el teclado, o el teclado tapa un trozo, anota cuánto (aprox.) y el modelo del celular. `//todo bien`

**Nuevo tier con fechas por defecto · 🌐 Web**
- [x] Evento existente → Tiers → "Nuevo tier": nombre, precio y cantidad; **no toques** inicio ni fin de venta ("Ahora" / "Cuando termina el evento") → Guardar → se crea sin error. El fin de venta del tier = fin del evento.
- [x] Editar un tier con fin de venta propio → "×" para volver a "Cuando termina el evento" → Guardar → sin error.
- [x] (Si alguna vez la API rechaza una fecha) el mensaje es "Revisa las fechas de venta…", no "Invalid input".

## 1b.3 · RSVPs · 📱 Celular (+ 🌐 web para comparar y para pedir solicitudes)
Para tener solicitudes: con **otra cuenta** (🌐 ventana privada) pide entrar a un evento RSVP tuyo, una gratis y otra de pago (Stripe test `4242 4242 4242 4242`). Reinicia Metro con `-c`.
- [ ] Barra inferior → **RSVPs**: lista de tus eventos RSVP (no los normales) con flyer, fecha, lugar y el número de pendientes (rojo si hay). Actuales/Pasados con su número; la búsqueda encuentra "carnaval" ↔ "Carnával". Organizer asignado: solo sus eventos.
- [ ] Tocar un evento → sus solicitudes: abre en **Pendientes** si hay; pestañas Todas / Pendientes / Aprobadas / Rechazadas con números iguales a la web (🌐 `/v2/organizer/rsvps/<id>?org=<slug>`). La barra de pestañas queda pegada arriba al hacer scroll.
- [ ] Cada solicitud: nombre, cédula (o "Sin cédula") · fecha, estado de color, "N tickets · tier", monto (lo que recibes).
- [ ] **Aprobar la de pago:** pide confirmación diciendo que se cobra la tarjeta y cuánto recibes → "… aprobada"; en la web pasa a Aprobadas/Pagada, la persona recibe el ticket y en Stripe test el pago aparece capturado.
- [ ] **Rechazar:** confirmación "se libera la retención…" → pasa a Rechazadas; la persona recibe el correo.
- [ ] **Aprobar todas** (con 2+ pendientes): la confirmación dice cuántas son de pago y el total; muestra "Aprobando 1 de N…" con **Detener**; al final "N solicitudes aprobadas".
- [ ] Dos dispositivos: aprueba en la web una que en el celular sigue pendiente y luego apruébala en el celular → "Otra persona ya gestionó esta solicitud…".
- [ ] Ícono 👁 → hoja "Datos de registro": email, cédula, ticket, monto, fecha, nacimiento (si hay) y las respuestas del formulario (obligatorias con *, sin respuesta → "Sin respuesta").
- [ ] **Exportar pendientes** (solo si hay): menú de compartir con el `.xlsx`; mismas columnas que el exportado desde la web.
- [ ] Evento ya terminado (en Pasados): aviso "Este evento terminó…" y sin botones de aprobar/rechazar.
- [ ] Evento → "Gestionar RSVPs" abre esta misma pantalla v2. Notificación de nueva solicitud (campana) → abre la v2 de ese evento.
- [ ] Deslizar hacia abajo recarga; sin tocar nada, una solicitud nueva aparece sola en ≤15 s.

## Heredado de la fase 1 (necesita la app) · 📱 Celular
- [x] Ajustes → Scan Tickets → código del evento → escanea ese evento sin cuenta. Tras "Nuevo código" en la web, el código viejo deja de funcionar al siguiente escaneo.
- [x] Con sesión de un miembro o de una persona agregada: escanea su evento; una persona agregada a otro evento → "You can't scan tickets for this event".
- [x] (Emergencia) `SCANNER_ACCESS_CODES=off` en `apps/web/.env` y reinicio: el código deja de dar acceso (403).
- [x] Descubrir (`localhost:8081`): "carnaval" encuentra "Carnával" y al revés (también en el panel del organizador y RSVPs de la app actual).

## Cosas conocidas
- Mientras dura la 1b, las pantallas que aún no son v2 (crear/editar, equipo, ajustes, payouts) abren su versión v1; al volver, regresas al panel v2.
- "Mis organizadores" en la app sigue siendo la sección del Perfil (el rediseño del perfil es de la fase 2).
- Errores del XLSX ("Export failed", "Sharing unavailable") salen en inglés: vienen del exportador v1 que se reutiliza.
- `WARN [notifications] Permission not granted for push notifications` al levantar: el permiso de notificaciones del celular está denegado. Inofensivo; sin Firebase tampoco habría push en Android.
- Push en Android: sin FCM el build no obtiene token (`[notifications] Failed to get Expo push token` en consola). No es fallo; ver la sesión 2026-10-22.
