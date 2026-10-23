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
- [ ] **Diseño de teléfono (prototipo), sin menú lateral.** Arriba: ← (vuelve al perfil), nombre de la organización con ▾, botón blanco "+" (crear evento, owner/admin) y tu avatar (→ perfil). Abajo: **Eventos · RSVPs · Escanear · Manage** (organizer: Eventos · RSVPs · Escanear; viewer: Eventos · RSVPs) con el número de RSVPs pendientes.
- [ ] Tocar el nombre de la organización → hoja desde abajo con tus organizaciones aprobadas (la actual con ✓) y "Mis organizadores". Elegir otra abre su panel.
- [ ] Panel: tarjeta con el logo sobre su color, nombre, rol (si no eres owner), "✓ Stripe conectado" o "Termina la configuración de Stripe", y Total de ingresos / Total de eventos (owner/admin). El chip "Gestionar" ya no está (eso es la pestaña Manage).
- [ ] Organización con eventos solo actuales (o solo pasados): sin el selector Actuales/Pasados, solo el título con el número. Con ambos: el selector. La búsqueda aparece solo con más de 4 eventos.
- [ ] **Manage** (owner/admin): "Gestionar organización", con una frase y tres filas: Equipo (N miembros), Pagos ($… disponibles, o "Conecta Stripe para cobrar") y Ajustes. Cada fila abre su pantalla **v1** por ahora (Equipo, Pagos y Ajustes pasan a v2 en la 1b.5). Finanzas y Comunicaciones del prototipo no se muestran: aún no existen.
- [ ] **Escanear** abre el escáner de la app actual (el v2 llega en la 1b.6).
- [ ] **Idioma:** cambia el idioma en la web (🌐 Mi cuenta), vuelve a la app (que pase a segundo plano y regrese): el organizador v2 cambia de idioma sin cerrar la app. Si no cambia, en la terminal de Metro aparecerá `[i18n] Failed to read the saved language…`: pégamelo.

## 1b.0 · Base (idioma, fuentes, interruptor) · 📱 Celular
- [ ] Con tu cuenta en español (Mi cuenta en la web → Español), el organizador v2 de la app sale en español; en inglés, en inglés. El resto de la app (v1) no cambia. `//Ronda 1: la parte de asistente sigue en inglés (esperado: se traduce en la fase 2) y el organizador v2 no tomaba el idioma → corregido, ver Ronda 1.`
- [x] Textos del organizador v2 con la tipografía nueva (Inter / Inter Tight), no Poppins. `//Ronda 1: era una copia de la web reducida; rehecho con el diseño de teléfono del prototipo (ver Ronda 1).`
- [ ] Interruptor de emergencia: `EXPO_PUBLIC_ORGANIZER_V1=true` en `apps/mobile/.env` y reiniciar Metro con `--clear` → al tocar una organización abre el panel v1 de siempre. Quitarlo después.

## 1b.1 · Panel del organizador · 📱 Celular
- [x] Perfil → Mis organizadores → tocar una organización aprobada → abre el panel v2 (sin la barra de pestañas de asistente ni el encabezado de la app). Atrás vuelve al perfil.
- ~~Una organización pendiente de aprobación no se abre.~~ Quitado: la prueba era sobre tus organizaciones; lo que viste es la **cola de aprobación de soporte** del perfil (está bien que se gestione desde el celular). Pasa a estilo 2.0 en la 1b.5.
- [ ] Notificación de organizador → al tocarla abre el panel v2 de esa organización. **Cómo provocarla:** ver "Notificaciones de organizador" abajo.
- [x] Owner/admin: KPIs (total de eventos = propios + co-organizados; ingresos solo de los propios). **Compara los números con el panel web v2** de la misma organización.
- [x] Organizer asignado: solo sus eventos, aviso "Ves los eventos asignados a ti", sin KPIs ni "+". Organizer sin asignaciones: lista vacía con el aviso.
- [x] Búsqueda: "carnaval" ↔ "Carnával"; si lo buscado está en la otra pestaña aparece "1 coincidencia en Pasados · Ver".
- [ ] Cada evento: flyer, fecha · hora · lugar, ingresos y asistentes; chip rojo de RSVP con pendientes; chip "Co-organizado con …". Tocarlo abre el detalle de evento **v2** (1b.2a).
- [x] Deslizar hacia abajo recarga. Sin conexión con la web → "Algo salió mal" + "Reintentar".
- ~~Menú ☰~~ Quitado: el menú lateral ya no existe en la app (diseño de teléfono, ver Ronda 1).
- [x] Nada se corta ni se esconde detrás de la barra inferior o del notch.

### Notificaciones de organizador · 📱 Celular + 🌐 Web
Hoy existen dos, y se guardan en la app aunque el celular no reciba push (Android sin Firebase): aparecen en la **campana** del encabezado de la app (lado asistente: Inicio / Perfil), no dentro del organizador.
- [ ] **Nueva solicitud de RSVP** (`new_rsvp_request`, va a owner/admin de la organización): con **otra cuenta** (otro navegador o ventana privada en 🌐), pide entrar a un evento RSVP tuyo. En tu celular, sal del organizador (avatar) → campana: aparece la solicitud. Tocarla → abre las RSVPs.
- [ ] **Ticket vendido** (`ticket_sold`): con otra cuenta compra un ticket (Stripe test `4242 4242 4242 4242`) → campana.
- Comprobación en la BD si no aparece: `select type, title, created_at from notifications where user_id = '<tu id de users>' order by created_at desc limit 5;`

## 1b.2a · Detalle de evento: marco, Tiers, Compras, Desglose · 📱 Celular
Compara cada número con el **mismo evento en la web v2** (🌐 `localhost:3000/v2/organizer/event/<id>?org=<slug>`).
- [x] Panel → tocar un evento → abre el detalle v2: flyer con su color desenfocado detrás, estado (Publicado / Borrador / Terminado), chip RSVP, nombre, fecha · hora · lugar. Atrás vuelve al panel.
- [x] KPIs: Tickets (capacidad), Solicitados (RSVPs pendientes), Vendidos, Ingresos (neto). Igual que la web.
- [x] Botones: "Co-organizadores" (owner/admin del dueño → abre la pantalla v1 del evento por ahora), "Gestionar RSVPs" con pendientes (eventos RSVP → RSVPs v1), "Editar evento" (owner/admin/organizer asignado → edición v1).
- [x] Pestañas deslizables: Tiers, Compras, Desglose, Enlaces de promotor, Códigos, Enviar tickets, Escáner; la activa con raya roja y siempre visible al cambiar. La barra de pestañas queda pegada arriba al hacer scroll.
- [x] **Tiers:** vendidos/total con barra, "N pendientes" (reservas), restantes, ingresos del tier. Interruptores "Agotado" y "Oculto" guardan al tocarlos (compruébalo en la web: el cambio aparece). Si ocultas todos, aparece el aviso amarillo.
- [x] Tiers: "Editar" y "Nuevo tier" abren la edición v1 (el editor v2 llega en la 1b.4).
- [x] Viewer (si lo usas): ve los tiers con etiquetas "Agotado"/"Oculto", sin interruptores ni "Editar evento".
- [x] **Compras:** lista (comprador, email, tier · cantidad · fecha, "Escaneado"/"Sin escanear", monto). Buscar por nombre, email o tier.
- [x] Compras → "Exportar XLSX": se abre el menú de compartir del celular con el `.xlsx`; ábrelo (Drive / Excel) y compara con el exportado desde la web (mismas columnas, incluidas las preguntas de registro si el evento las tiene).
- [x] **Desglose:** Tarjeta (pagado por compradores, comisiones, para ti), Transferencia (cobrado por ti), Gratis; total; ventas por tier y por promotor. Igual que la web.
- [x] Evento co-organizado (de otra organización): aviso "Co-organizas este evento…"; Compras y Desglose dicen que solo los ve el dueño; sin "Editar evento".
- [x] Pestañas Enlaces de promotor, Códigos, Enviar tickets y Escáner: tarjeta "Esta herramienta sigue en la versión anterior" + "Abrir versión anterior" → pantalla v1 del evento (pasan a v2 en la 1b.2b).
- [x] Deslizar hacia abajo recarga. Un evento que no es de tu organización (enlace viejo) → "Este evento no está disponible…" + Atrás.

## Heredado de la fase 1 (necesita la app) · 📱 Celular
- [x] Ajustes → Scan Tickets → código del evento → escanea ese evento sin cuenta. Tras "Nuevo código" en la web, el código viejo deja de funcionar al siguiente escaneo.
- [x] Con sesión de un miembro o de una persona agregada: escanea su evento; una persona agregada a otro evento → "You can't scan tickets for this event".
- [x] (Emergencia) `SCANNER_ACCESS_CODES=off` en `apps/web/.env` y reinicio: el código deja de dar acceso (403).
- [x] Descubrir (`localhost:8081`): "carnaval" encuentra "Carnával" y al revés (también en el panel del organizador y RSVPs de la app actual).

## Cosas conocidas
- Mientras dura la 1b, las pantallas que aún no son v2 (herramientas del evento de la 1b.2b, RSVPs, crear/editar, equipo, ajustes, payouts, escáner) abren su versión v1; al volver, regresas al panel v2.
- "Mis organizadores" en la app sigue siendo la sección del Perfil (el rediseño del perfil es de la fase 2).
- Errores del XLSX ("Export failed", "Sharing unavailable") salen en inglés: vienen del exportador v1 que se reutiliza.
- Push en Android: sin FCM el build no obtiene token (`[notifications] Failed to get Expo push token` en consola). No es fallo; ver la sesión 2026-10-22.
