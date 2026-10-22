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

## 1b.0 · Base (idioma, fuentes, interruptor) · 📱 Celular
- [ ] Con tu cuenta en español (Mi cuenta en la web → Español), el organizador v2 de la app sale en español; en inglés, en inglés. El resto de la app (v1) no cambia.
- [ ] Textos del organizador v2 con la tipografía nueva (Inter / Inter Tight), no Poppins.
- [ ] Interruptor de emergencia: `EXPO_PUBLIC_ORGANIZER_V1=true` en `apps/mobile/.env` y reiniciar Metro con `--clear` → al tocar una organización abre el panel v1 de siempre. Quitarlo después.

## 1b.1 · Panel del organizador · 📱 Celular
- [ ] Perfil → Mis organizadores → tocar una organización aprobada → abre el panel v2 (sin la barra de pestañas de asistente ni el encabezado de la app). Atrás vuelve al perfil.
- [ ] Una organización pendiente de aprobación no se abre (como antes).
- [ ] Una notificación que lleva al panel del organizador abre el v2 de esa organización.
- [ ] Owner/admin: logo con resplandor detrás, KPIs (total de eventos = propios + co-organizados; ingresos solo de los propios) y "Crear evento". **Compara los números con el panel web v2** de la misma organización.
- [ ] Stripe: "Stripe conectado" (verde) o "Termina la configuración de Stripe" (amarillo → abre payouts v1). "Gestionar" abre los ajustes de la organización (v1 por ahora).
- [ ] Organizer asignado: solo sus eventos, aviso "Ves los eventos asignados a ti", sin KPIs ni "Crear evento". Organizer sin asignaciones: lista vacía con el aviso.
- [ ] Pestañas Actuales/Pasados con conteo. Búsqueda: "carnaval" ↔ "Carnával"; si lo buscado está en la otra pestaña aparece "1 coincidencia en Pasados · Ver".
- [ ] Cada evento: flyer, fecha · hora · lugar, ingresos y asistentes; chip rojo de RSVP con pendientes; chip "Co-organizado con …". Tocarlo abre el detalle de evento **v2** (1b.2a).
- [ ] Deslizar hacia abajo recarga. Sin conexión con la web → "Algo salió mal" + "Reintentar".
- [ ] Barra flotante abajo según rol (owner: Eventos, RSVPs, Equipo, Payouts, Ajustes; organizer: Eventos, RSVPs) con el número de RSVPs pendientes. Cada entrada abre su pantalla **v1** por ahora.
- [ ] Menú ☰: logo (→ Mis organizadores), selector de organización (rol, otras organizaciones, Mis organizadores), estado de Stripe (owner/admin), entradas según rol, "Crear evento" (owner/admin), próximos (12) y pasados (3), Descubrir, Mis tickets, Mi cuenta. Se cierra con × o tocando fuera.
- [ ] Cambiar de organización desde el selector abre el panel de la otra (pestaña y búsqueda reiniciadas).
- [ ] Nada se corta ni se esconde detrás de la barra inferior o del notch (prueba un teléfono con muesca si tienes).

## 1b.2a · Detalle de evento: marco, Tiers, Compras, Desglose · 📱 Celular
Compara cada número con el **mismo evento en la web v2** (🌐 `localhost:3000/v2/organizer/event/<id>?org=<slug>`).
- [ ] Panel → tocar un evento → abre el detalle v2: flyer con su color desenfocado detrás, estado (Publicado / Borrador / Terminado), chip RSVP, nombre, fecha · hora · lugar. Atrás vuelve al panel.
- [ ] KPIs: Tickets (capacidad), Solicitados (RSVPs pendientes), Vendidos, Ingresos (neto). Igual que la web.
- [ ] Botones: "Co-organizadores" (owner/admin del dueño → abre la pantalla v1 del evento por ahora), "Gestionar RSVPs" con pendientes (eventos RSVP → RSVPs v1), "Editar evento" (owner/admin/organizer asignado → edición v1).
- [ ] Pestañas deslizables: Tiers, Compras, Desglose, Enlaces de promotor, Códigos, Enviar tickets, Escáner; la activa con raya roja y siempre visible al cambiar. La barra de pestañas queda pegada arriba al hacer scroll.
- [ ] En el menú ☰, el evento abierto aparece resaltado (borde y barra roja).
- [ ] **Tiers:** vendidos/total con barra, "N pendientes" (reservas), restantes, ingresos del tier. Interruptores "Agotado" y "Oculto" guardan al tocarlos (compruébalo en la web: el cambio aparece). Si ocultas todos, aparece el aviso amarillo.
- [ ] Tiers: "Editar" y "Nuevo tier" abren la edición v1 (el editor v2 llega en la 1b.4).
- [ ] Viewer (si lo usas): ve los tiers con etiquetas "Agotado"/"Oculto", sin interruptores ni "Editar evento".
- [ ] **Compras:** lista (comprador, email, tier · cantidad · fecha, "Escaneado"/"Sin escanear", monto). Buscar por nombre, email o tier.
- [ ] Compras → "Exportar XLSX": se abre el menú de compartir del celular con el `.xlsx`; ábrelo (Drive / Excel) y compara con el exportado desde la web (mismas columnas, incluidas las preguntas de registro si el evento las tiene).
- [ ] **Desglose:** Tarjeta (pagado por compradores, comisiones, para ti), Transferencia (cobrado por ti), Gratis; total; ventas por tier y por promotor. Igual que la web.
- [ ] Evento co-organizado (de otra organización): aviso "Co-organizas este evento…"; Compras y Desglose dicen que solo los ve el dueño; sin "Editar evento".
- [ ] Pestañas Enlaces de promotor, Códigos, Enviar tickets y Escáner: tarjeta "Esta herramienta sigue en la versión anterior" + "Abrir versión anterior" → pantalla v1 del evento (pasan a v2 en la 1b.2b).
- [ ] Deslizar hacia abajo recarga. Un evento que no es de tu organización (enlace viejo) → "Este evento no está disponible…" + Atrás.

## Heredado de la fase 1 (necesita la app) · 📱 Celular
- [ ] Ajustes → Scan Tickets → código del evento → escanea ese evento sin cuenta. Tras "Nuevo código" en la web, el código viejo deja de funcionar al siguiente escaneo.
- [ ] Con sesión de un miembro o de una persona agregada: escanea su evento; una persona agregada a otro evento → "You can't scan tickets for this event".
- [ ] (Emergencia) `SCANNER_ACCESS_CODES=off` en `apps/web/.env` y reinicio: el código deja de dar acceso (403).
- [ ] Descubrir (`localhost:8081`): "carnaval" encuentra "Carnával" y al revés (también en el panel del organizador y RSVPs de la app actual).

## Cosas conocidas
- Mientras dura la 1b, las pantallas que aún no son v2 (herramientas del evento de la 1b.2b, RSVPs, crear/editar, equipo, ajustes, payouts, escáner) abren su versión v1; al volver, regresas al panel v2.
- "Mis organizadores" en la app sigue siendo la sección del Perfil (el rediseño del perfil es de la fase 2).
- Errores del XLSX ("Export failed", "Sharing unavailable") salen en inglés: vienen del exportador v1 que se reutiliza.
- Push en Android: sin FCM el build no obtiene token (`[notifications] Failed to get Expo push token` en consola). No es fallo; ver la sesión 2026-10-22.
