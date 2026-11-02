# Pruebas reales · Fase 4 (funcionalidad nueva)

Creada el 2026-11-02. `[x]` = ya probado y sigue valiendo; `[ ]` = falta o **cambió** y hay que repetirlo.
Dispositivos: 💻 PC (navegador) · 🌐📱 navegador del celular · 📱 app.
Orden de la fase (decisión 11-02, por riesgo): 4.0 promotores + etiquetas + CSRF de la app → 4.1 Guardar eventos → 4.2 Seguir organizadores → 4.3 Line-up → Line-up → Búsqueda → Invitaciones de equipo → Numeración de tickets. Categorías: descartadas.

---

## 0. Preparación (una vez por sesión de pruebas)

1. **Migración nueva** (Guardar eventos, §4): `supabase migration up` (o `supabase db reset`). Archivo: `supabase/migrations/20261102120000_saved_events.sql`. Sin ella, el corazón no guarda (la API responde 500) y "Guardados" en Tú queda vacío.
2. **Tests automáticos** antes de probar a mano (no se pudieron correr en la nube):
   - `pnpm --filter @project-flame/lib test` (nuevos: `promoter-batch`, `saved-events`).
   - Web (`apps/web`): `pnpm test:run -- EventAdminTabs promoter-links-bulk payouts-create-csrf saved-events SavedEvents You`.
   - App (`apps/mobile`): `pnpm test -- EventTools SavedEvents You`.
   - Tipos: `npx tsc --noEmit` en `apps/web` y en `apps/mobile`.
3. Reinicia `pnpm dev` (web) y Metro con `npx expo start -c` (textos nuevos en/es).
4. Cuenta **owner** de una organización aprobada con al menos un evento publicado; una segunda cuenta **sin organización** para el corazón; y una sesión **sin iniciar** (incógnito).
5. Supabase Studio local: `http://127.0.0.1:54323` → Table Editor (`promoter_links`, `saved_events`).

---

## 1. "Solicitar pago" desde la app (CSRF)

- [ ] 📱 Manage → Pagos → **Solicitar pago** con saldo disponible → ya no sale "CSRF validation failed"; en la terminal de `pnpm dev` no aparece `CSRF validation failed { origin: null … }`.
- [ ] 💻 Pagos v2 en la web → Solicitar pago sigue funcionando igual.
- [ ] 💻 (opcional, seguridad) DevTools → consola en **otra** página (p. ej. `about:blank`): `fetch("http://<ip>:3000/api/organizer/payouts/create",{method:"POST",credentials:"include",body:"{}"})` → 403 o error de CORS, nunca un pago.
- Nota: **no hace falta** añadir la IP del celular a `.env`; la app no envía Origin.

## 2. Promotores: pegar lista y QR

### 2.1 Pegar lista
- [ ] 💻 / 📱 Evento → pestaña **Promotores** → selector **Un promotor / Pegar lista** (sin rol de edición no aparece).
- [ ] Pega:
  ```
  1. David Camacho
  2) Juan León, Alejandra Pérez
  - david camacho
  ```
  → "Nombres detectados: 3" (el repetido no cuenta) → **Crear links**.
- [ ] Salen los códigos **DAVIDC**, **JUANL**, **ALEJANDRAP** con el nombre al lado; tarjeta verde "3 links listos".
- [ ] Repite con "David Cedeño" → código **DAVIDC2** (no choca con el existente).
- [ ] **Copiar todo** → pega en WhatsApp/Notas: una línea por promotor `Nombre: https://…/events/<slug>?promoter=CODIGO`.
- [ ] Más de 100 nombres → aviso "Hasta 100 promotores a la vez" y no crea nada.
- [ ] Studio → `promoter_links`: filas nuevas con `promoter_name` y `created_by` = tu usuario.
- [ ] Cuenta **organizer** no asignada al evento → no puede crear (403 / no ve el formulario).

### 2.2 QR
- [ ] 💻 Botón **QR** en una fila → ventana con el QR, el código grande y el link. **Copiar link**, **Compartir** (si el navegador lo permite) y **Descargar QR** (PNG `qr-CODIGO.png`).
- [ ] 📱 Botón QR → hoja con el QR; **Compartir** abre el menú del sistema con el link; captura de pantalla del QR → se ve completo.
- [ ] Escanea el QR con la cámara de otro celular → abre el evento con la etiqueta verde **Promotor CODIGO** (fase 3).
- [ ] Una compra hecha por ese link suma en la fila del promotor (tickets e ingresos).

## 3. Etiquetas de estado (StatusTag)

Estilo nuevo: esquinas casi rectas, muesca de color a la izquierda, texto pequeño en mayúsculas. Revisa que se lean bien y que el color tenga sentido:
- [ ] 💻 / 📱 Evento (cabecera): **Publicado** (verde) / **Borrador** (ámbar) / **Terminado** (gris) y **RSVP** (rojo Flame).
- [ ] 💻 Panel (dashboard) y Pagos: **Stripe conectado** (verde); con Stripe incompleto: **Completa la configuración de Stripe →** (ámbar; es la etiqueta más larga, revisa que no se corte en el celular) y al tocarla va a Pagos.
- [ ] 📱 Panel de la organización: igual que arriba.
- [ ] Promociones: **Activo** (verde) / **Agotado** (gris).
- [ ] RSVPs: pendiente (ámbar) / aprobada y comprada (verde) / rechazada (rojo).
- [ ] Tiers y Enviar tickets: **Agotado** (rojo), **Oculto** (gris), **Actual** (verde).
- [ ] Equipo y panel: roles Dueño (rojo Flame) / Admin (ámbar) / Organizador (gris).
- [ ] Idioma español: los textos largos no se cortan.

## 4. Guardar eventos (corazón) — 4.1

### 4.1 Corazón
- [ ] 💻 / 🌐📱 / 📱 Inicio: cada tarjeta tiene el corazón abajo a la derecha del flyer; el título no queda tapado.
- [ ] Toca el corazón → se llena (disco blanco, corazón rojo) al instante; tocar el corazón **no** abre el evento.
- [ ] Explorar, "Más de {organizador}" y perfil del organizador: corazón en cada tarjeta (no en eventos pasados del perfil).
- [ ] Página del evento: corazón junto a **Compartir** arriba; queda lleno si ya lo guardaste desde Inicio.
- [ ] Guardar en la web → abre la app (misma cuenta) → tira para recargar en Tú → aparece (y al revés).
- [ ] Sin conexión / API caída (apaga `pnpm dev` un momento en la web) → el corazón vuelve a vacío.
- [ ] Studio → `saved_events`: una fila por evento guardado (`user_id`, `event_id`); quitar el corazón la borra.

### 4.2 Sin sesión
- [ ] 💻 Incógnito → corazón → va a **Iniciar sesión** y, al entrar, vuelve a la misma página.
- [ ] 📱 Sin sesión → corazón → pantalla de inicio de sesión.

### 4.3 Tú → Guardados
- [ ] 💻 / 📱 Tú → sección **Guardados** con el número; próximos primero (el más cercano primero), luego los terminados con la etiqueta **Terminado**.
- [ ] Sin guardados → "Toca el corazón de cualquier evento para guardarlo."
- [ ] Quitar el corazón desde Guardados → desaparece de la lista sin recargar.
- [ ] Un evento que el organizador pasa a **borrador** deja de verse en Guardados (vuelve si se publica otra vez).
- [ ] Privacidad: con la **otra cuenta** no se ven los guardados de la primera.

## 5. Seguir organizadores — 4.2

Preparación: migración `supabase/migrations/20261102150000_organization_follows.sql` aplicada. Tests nuevos: web `following`, `EventOrganizer`, `You`; app `Following`, `EventOrganizer`, `You`.

### 5.1 Perfil del organizador
- [ ] 💻 / 🌐📱 / 📱 Perfil de un organizador (`/organizer/<slug>` o desde un evento): botón **Seguir** (blanco) a la derecha del logo y "**N** seguidores" junto a la ciudad.
- [ ] Toca **Seguir** → pasa a **Siguiendo** (oscuro) y el número sube en 1 al instante; vuelve a tocar → **Seguir** y baja en 1.
- [ ] Con la **otra cuenta**, sigue al mismo organizador → el número sube a 2 (recarga el perfil con la primera cuenta).
- [ ] Sin sesión: 💻 Seguir → Iniciar sesión y vuelve al perfil; 📱 → pantalla de inicio de sesión. El número de seguidores sí se ve sin sesión.
- [ ] Organizador **en revisión** (no aprobado): su perfil no es público, no se puede seguir.
- [ ] Studio → `organization_follows`: una fila por persona y organizador; dejar de seguir la borra.

### 5.2 Tú → Siguiendo
- [ ] 💻 / 📱 Tú: contador **Siguiendo** (primero de los tres); en la web lleva a la sección.
- [ ] Sección **Siguiendo**: logo, nombre, "Ciudad · N seguidores" y botón **Siguiendo**; tocar la fila abre el perfil.
- [ ] Dejar de seguir desde ahí → la fila desaparece.
- [ ] Sin seguir a nadie → "Todavía no sigues a nadie" + **Buscar organizadores** (va a Explorar).
- [ ] Seguir en la web → app (tira para recargar en Tú) → aparece, y al revés.
- [ ] Privacidad: nadie ve **quién** te sigue ni a quién sigues; solo el número.

## 6. Line-up — 4.3

Preparación: migración `supabase/migrations/20261102170000_events_lineup.sql` aplicada. Tests nuevos: lib `lineup`; web `events-lineup`, `CreateEvent`, `EditEvent`, `EventOrganizer`; app `EventForms`, `Lineup`.

### 6.1 Crear / editar evento
- [ ] 💻 / 📱 Crear evento → sección **Line-up** (después de "Acerca de") → **Agregar artista** → tarjeta con Nombre, Instagram, Spotify y SoundCloud (opcionales).
- [ ] Instagram acepta `@usuario`, `usuario` o el link del perfil; Spotify solo `open.spotify.com/…` o `spotify.link/…`; SoundCloud el link o solo el usuario.
- [ ] Link equivocado (p. ej. YouTube en Spotify) → mensaje bajo el campo y no publica / no guarda.
- [ ] Tarjeta con un link pero sin nombre → "Escribe el nombre del artista (o quita la tarjeta)". Tarjeta vacía → se ignora al guardar.
- [ ] Subir / bajar / quitar artista; el orden se respeta en la página del evento. Con 20 artistas desaparece "Agregar artista".
- [ ] Editar evento: el line-up aparece cargado; cambiar solo el line-up guarda (sin pedir confirmación de fechas); sin cambios → "No hay cambios".
- [ ] Studio → `events.lineup`: JSON normalizado (`instagram` sin @, links `https://…`).

### 6.2 Página del evento
- [ ] 💻 / 🌐📱 / 📱 Evento con line-up → sección **Line-up** después de los tiers: tarjetas cuadradas con iniciales (sin fotos), nombre y botones de Instagram / Spotify / SoundCloud que abren el perfil fuera de Flame.
- [ ] Desliza horizontal si hay muchos artistas.
- [ ] Evento sin line-up → la sección no aparece.
- [ ] La app vieja (build anterior) sigue abriendo eventos con line-up sin errores.

### 6.3 Foto del artista (11-02, tarde)
- [ ] 💻 / 📱 En cada tarjeta de artista: miniatura (iniciales o foto) con un **lápiz** en la esquina; no ocupa más espacio.
- [ ] Lápiz → opciones: **Usar la foto de Spotify** y **Usar la foto de SoundCloud** (activas solo si ese link del artista es válido), **Foto de Instagram (no disponible)** desactivada, **Subir una foto**, **Quitar foto** (si ya tiene).
- [ ] Spotify con link de artista (`open.spotify.com/artist/…`) → la miniatura muestra su foto. Si sale "No se pudo obtener la foto", anota el link: Spotify a veces no da foto por el oEmbed público (se puede activar `SPOTIFY_CLIENT_ID`/`SECRET`, ver `guias/SETUP_ENTORNO_DEV.md`).
- [ ] SoundCloud con usuario o link → su avatar; perfil sin avatar → "That profile has no photo we can use." / mensaje equivalente.
- [ ] Subir: 💻 elige JPG/PNG → se recorta cuadrado; 📱 galería con recorte 1:1. GIF → rechazado.
- [ ] Funciona **antes** de publicar (crear evento) y al editar; al guardar, la foto aparece en la página del evento (tarjeta cuadrada) en web y app.
- [ ] Studio → Storage `event-images/artists/<id de la organización>/…`: un archivo por foto elegida. `events.lineup[].photo_url` apunta ahí.
- [ ] Rol **viewer** no puede (403).

## 7. Ajustes generales (11-02)
- [ ] 💻 El logo de Flame lleva al **Inicio** desde cualquier pantalla: barra del asistente, menú lateral del organizador (antes iba a "Mis organizadores") y pantallas de inicio de sesión / registro. 📱 En la app el logo de la barra superior ya iba a Inicio.
- [ ] 💻 / 📱 Tú → **Mis organizadores**: cada organización muestra tu **rol** (Dueño / Admin / Organizador / Viewer) junto al número de eventos, también en las que están en revisión.
- [ ] 💻 `/v2/organizer` (Mis organizadores): ahora dentro del marco del asistente (barra superior con las secciones, barra inferior en el celular, pie de página); botón **Tú** para volver; rol en cada tarjeta.

---

## Cosas conocidas (no son fallo)
- Las tarjetas de eventos pasados (perfil del organizador, historial) no llevan corazón, salvo en Guardados.
- El organizador no ve cuántas personas guardaron su evento (no entra en este paso).
- Web: el QR se genera en el navegador; si una extensión bloquea `canvas`, la imagen no aparece pero el link sí.
- Seguir a un organizador todavía **no** envía avisos cuando publica un evento (pendiente de decisión).
- Instagram no permite leer fotos de perfil: la opción aparece desactivada a propósito.
- Fotos de artistas que se suben y luego no se guardan quedan en Storage (sin limpieza automática por ahora).
