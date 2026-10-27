# Fase 1 — Organizador web v2 · pruebas reales

Lista viva: se amplía con cada entrega de la fase 1 (última actualización 2026-10-26, ronda 3: Manage, Ajustes y soporte en la web).
Prueba en tu PC con datos reales de desarrollo (Supabase local, Clerk test, Stripe test).

Marca cada punto con [x] cuando pase. Si algo falla: anota la pantalla, qué hiciste, qué esperabas y qué pasó (y el error de la consola del navegador / terminal si hay).

## Ronda 3 (2026-10-26) · Manage, Ajustes y cola de soporte en la web · 🌐 Web
Reutiliza el diseño de la app (1b.5). Prueba con un owner, un admin, un organizer y una cuenta de soporte.

**Menú y hub Manage**
- [x] Owner/admin: el menú lateral muestra Eventos · RSVPs · **Manage** (ya no Equipo, Pagos ni Ajustes sueltos). Al pie: **Ajustes** (→ `/v2/account`).
- [x] Manage → filas Equipo ("N miembros"), Pagos ("$X disponibles" o "Conecta Stripe para cobrar") y Ajustes. Cada una abre su pantalla; Manage sigue resaltado en el menú.
- [x] Desde Equipo, Pagos o Ajustes de organización, ← y la miga "Manage" vuelven al hub.
- [x] Organizer / viewer: no ven Manage; abriendo `/v2/organizer/manage?org=…` a mano vuelven a Eventos.
- [x] Teléfono (ventana angosta): el cajón del menú muestra lo mismo.

**Ajustes (tu cuenta)** — `/v2/account`
- [x] Título "Ajustes"; nombre y e-mail de solo lectura; "Contraseña, correos y seguridad" abre el perfil de Clerk.
- [x] Idioma cambia al instante y persiste tras recargar (también en la app con la misma cuenta).
- [x] Notificaciones: una cuenta sin organizaciones ve solo "Como asistente"; un organizador ve también "Como organizador". Apagar una → recargar → sigue apagada; en la app (Ajustes) aparece igual. Las obligatorias se ven bloqueadas ("Siempre activa").
- [x] Eliminar cuenta (con una cuenta de prueba desechable): pide dos confirmaciones → cierra sesión y va al inicio; esa cuenta ya no puede entrar. Cancelar en cualquiera de los dos pasos no borra nada.
- [x] Cerrar sesión → inicio.

**Cola de soporte 2.0** — `/v2/support/organizations`
- [x] Cuenta de soporte: Ajustes → "Aprobación de organizadores · N esperando revisión" → pantalla con Pendientes / Rechazadas y sus números.
- [x] Aprobar pide confirmación → sale de Pendientes; el dueño ya puede crear eventos (y recibe el e-mail).
- [x] Rechazar → ventana con motivo opcional → aparece en Rechazadas con "Motivo: …". Eliminar pide confirmación.
- [x] Con más de 4 organizaciones aparece el buscador (nombre o e-mail, sin importar tildes).
- [x] Cuenta normal: no ve la entrada en Ajustes; abriendo la URL a mano ve "Esta pantalla es solo para el soporte de Flame".
- Al rechazar, el dueño recibe una notificación con el motivo (10-27; casos en `FASE_1B_ORGANIZADOR_APP.md` → "10-27"). La organización rechazada deja de aparecer en sus listas.

## Ronda 2 (2026-10-20) — volver a probar tras las correcciones
Correcciones de tu ronda 1. Marca cada una y, si pasa, marca también el caso original de más abajo.
- [x] **Interruptores** (Agotado / Oculto en la pestaña Tiers, interruptores de crear/editar y "Obligatoria" en preguntas): apagado = bolita a la izquierda, encendido = a la derecha, siempre.
- [x] **Logo 740×740** (la misma imagen que falló): ahora se sube. Antes de subir, la imagen se lee y se re-codifica en el navegador (WebP, máx. 1024 px de lado): cualquier tamaño grande funciona y el archivo llega limpio al servidor. Imagen menor a 400×400 → "Esta imagen mide W×H…". Si el servidor la rechaza, el mensaje dice el motivo.
- [x] **Cuenta y organización separadas:** el menú "Ajustes" abre solo los ajustes de la organización (sin pestañas). Tus datos, idioma y cerrar sesión están en **Mi cuenta** (nuevo enlace abajo en el menú y tu avatar arriba a la derecha → `/v2/account`). `/organizer/settings?tab=personal` también lleva a Mi cuenta.
- [x] **Badge de RSVPs del menú:** solo cuenta pendientes de eventos que no terminaron. Un evento pasado con solicitudes pendientes ya no suma (las pantallas de RSVPs siguen mostrando sus números).
- [x] **Modal de co-organizadores:** fondo sólido, se lee bien sobre negro.
- [x] **Código de acceso del tier:** deshabilitado mientras el tier no esté oculto (texto: "Activa 'Ocultar tier' para usar un código"). Al desactivar "Ocultar tier" el código se borra. Un tier visible que ya tenía código lo pierde al guardarlo (no hacía nada: el código solo muestra tiers ocultos).
- [x] **Atajos de URL** (lo que escribiste): `/organizer/create?org=<slug>`, `/organizer/rsvps?org=<slug>`, `/organizer/payouts?org=<slug>` → su pantalla v2. Sin `?org=` no redirigen (son la página pública de una organización con ese slug). Las formas `/organizer?org=<slug>&tab=create-event` / `&tab=rsvps` y `/organizer/settings?org=<slug>&tab=payouts` también deben funcionar: si alguna no, anota la URL exacta.
- [x] **Búsqueda del panel:** busca en las dos pestañas; si lo que buscas está en la otra, aparece "1 coincidencia en Pasados · Ver". Tildes en los dos sentidos ("carnaval" ↔ "Carnával").
- [x] **Evento abierto en el menú:** resaltado más visible (fondo, borde y barra roja a la izquierda).
- [x] **Enviar tickets:** debajo de "Tickets gratis / Transferencias" ahora se explica qué hace cada modo.

**Resultado ronda 2 (Kevin, 2026-10-21/22):** búsqueda del panel, resaltado del menú y explicación de Enviar tickets OK (10-22). interruptores, logo, badge RSVP, co-organizadores y código de tier OK; payout de prueba OK tras cambiar la cuenta bancaria de prueba a `110000000` / `000123456789` (la anterior simula `debit_not_authorized`). La búsqueda con tildes que fallaba era la de **Descubrir en la app** (Expo web), no la del panel.
- [x] **Descubrir (app, `localhost:8081`)**: buscar "carnaval" encuentra "Carnával" y al revés (también en el panel del organizador y RSVPs de la app actual).
- [x] **"Gestionar en Stripe" con error de país**: tras limpiar la organización que quedó con cuenta de Ecuador (ver "Cosas conocidas"), conectar de nuevo con United States funciona.

## 0. Preparación
- [x] **Build de producción:** `pnpm --filter web build` termina sin errores. Si falla en "prerendering page /404" con `Cannot read properties of null (reading 'useContext')`, es React duplicado por la instalación local (ver "Cosas conocidas"); avísame.
- [x] `npm run dev` en `apps/web`. La primera visita a cada pantalla tarda 20–25 s (compila); las siguientes no.
- [x] Usa una organización de prueba con: al menos un evento futuro con RSVP, uno sin RSVP, uno pasado, y un evento con algún ticket vendido (si se puede, uno con etapas de precio).
- [x] Ten a mano 4 usuarios (o cambia el rol en la BD): 
- [x] Stripe en modo test para lo que cobra (RSVP aprobado, reducción forzada).

## 1. Redirección v1 → v2 (nuevo)
- [x] `/organizer` → abre `/v2/organizer` (Mis organizadores).
- [x] `/organizer?org=<slug>` → panel v2 de esa organización.
- [x] `/organizer?org=<slug>&tab=create-event` → crear evento v2. (Atajo `/organizer/create?org=` corregido y OK en ronda 2.)
- [x] `/organizer?org=<slug>&tab=rsvps` → RSVPs v2. (Atajo `/organizer/rsvps?org=` corregido y OK en ronda 2.)
- [x] `/organizer/event/<id>?org=<slug>` → evento v2.
- [x] `/organizer/rsvps/<id>?org=<slug>` → RSVPs de ese evento v2.
- [x] `/organizer/team?org=<slug>` → equipo v2.
- [x] `/organizer/settings?org=<slug>` (y `&tab=organization` / `&tab=personal`) → ajustes v2.
- [x] `/organizer/settings?org=<slug>&tab=payouts` → payouts v2. (Atajo `/organizer/payouts?org=` corregido y OK en ronda 2.)
- [x] Se queda en v1: `/organizer/<slug-publico>` (página pública).
- [x] `/qr-scanner` y `/v2/scanner` → te mandan al inicio (la web ya no escanea).
- ~~Desde ajustes v1, el "volver" al panel termina en v2.~~ Quitado: los ajustes v1 del organizador ya no se abren (redirigen a v2), así que no hay "volver" que probar. `account?tab=settings` es la cuenta del asistente (v1, fase 2).
- [x] Interruptor de emergencia: con `ORGANIZER_V1=true` en `apps/web/.env` (reiniciar dev) vuelve a abrir v1. Quitarlo después. 

## 2. Menú lateral y estructura (nuevo)
Escritorio (ventana ancha):
- [x] El menú lateral queda fijo; solo el contenido hace scroll. La barra superior (título, migas, avatar) queda pegada arriba.
- [x] Logo → Mis organizadores. Selector de organización: muestra rol, lista las otras y "Mis organizadores".
- [x] "Stripe conectado" (o "Termina la configuración de Stripe" → payouts) solo para owner/admin.
- [x] Eventos, RSVPs (con número de pendientes), Equipo y Ajustes según rol; "Crear evento" solo owner/admin. **No** aparece "Escanear".
- [x] Próximos y Pasados (3) abren cada evento; el evento abierto queda resaltado. `//Mejorar el resaltado, mas notable`
- [x] Descubrir → /discover, Mis tickets → /account, tu nombre → /profile. Tu foto/iniciales arriba a la derecha.
Teléfono (o ventana < 1024 px):
- [x] Botón ☰ abre el menú como panel; se cierra con ×, Escape o tocando fuera.
- [x] Barra flotante abajo (Eventos, RSVPs, Equipo, Ajustes según rol), sin "Escanear".
- [x] En crear/editar evento y en el editor de tiers NO aparece la barra flotante; el botón Publicar/Guardar queda abajo.
- [x] Ninguna pantalla se desborda a lo ancho.

## 3. Panel (dashboard)
- [x] KPIs (eventos, ingresos) solo owner/admin; organizer ve "Ves los eventos asignados a ti".
- [x] Pestañas actuales/pasados, búsqueda (sin tildes: "carnaval" encuentra "Carnával").
- [] Ingresos coinciden con v1 (`ORGANIZER_V1=true` para comparar) en una organización con muchas órdenes. `//lo dejaremos para despues`

## 4. Detalle de evento (pestañas)
- [x] Tiers: vendidos/total, reservados, restantes; "Agotado" y "Oculto" de un toque se guardan.
- [x] Tiers: si ocultas todos, aparece el aviso "Todos los tiers están ocultos…".
- [x] Compras: lista y exportación XLSX.
- [x] Desglose: montos por tier; transferencias antiguas (antes del 15-01-2026) sin la comisión inflada.
- [x] Promotores: crear/borrar enlace, ranking.
- [x] Códigos: crear (límite vacío → mensaje claro), borrar con confirmación.
- [x] Enviar tickets: buscar por email exacto, enviar gratis, transferencia con precio personalizado (acepta "25,50"), enviar a email sin cuenta, historial a la derecha. `!!!Como funciona el enviar tickets con otro precio? por ejemplo si el tier stage normal vale $10 y yo quiero enviar una entrada (y me permite modiciar el precio) a $5 no veo en que momento el usuario aceptó el cobro, esto se realiza automatico? no debería ser con pago y si la persna no quiere solo lo ignora? como funciona actualmente`
- [x] Co-organizadores: abre el modal y guarda.
- [x] Organizer asignado: puede todo lo de su evento. Organizer NO asignado: no ve el evento (y por URL directa → "no disponible").

## 5. Crear evento
- [x] Publicar vacío → errores junto a cada campo + "Corrige N campos", salta al primero; no se crea nada.
- [x] Nombre → el enlace se genera solo (sin tildes); si editas el enlace a mano deja de seguir al nombre.
- [x] Al elegir inicio, el fin se pone 5 h después; si cambias el fin a mano ya no se mueve.
- [x] Inicio con menos de 2 h de margen → error.
- [x] Si tu compu está en otra zona horaria que el evento (cambia la zona del evento a Madrid), debajo de las fechas aparece "… en tu hora (…)".
- [x] Flyer: imagen > 4,5 MB → error; PDF → error; imagen válida → vista previa, quitar funciona.
- [x] Tier simple: precio "25,50" → se guarda 25,50; "0" → gratis.
- [x] Etapas ("El precio cambia según se vende"): crea Early Bird/Regular con cupos repartidos; con menos de 2 etapas no deja publicar.
- [x] Código de acceso en minúsculas → se guarda en MAYÚSCULAS; 2 letras → error.
- [x] Fin de ventas después del fin del evento → error.
- [x] Preguntas por tier (con RSVP): agregar, tipo, obligatoria, subir/bajar; en el Tier 2 aparecen chips "Usadas en tiers anteriores".
- [x] Misma pregunta con distinto tipo en dos tiers → error de conflicto.
- [x] Apagar RSVP → las preguntas desaparecen y no se guardan. `//No se como validar eso` → **Cómo:** crea un evento con RSVP, agrega 1–2 preguntas en un tier, apaga RSVP y publica. Abre el evento → pestaña Tiers → Editar ese tier: no debe haber sección de preguntas. En la BD (`events`): `registration_form_config` = `null`; en `ticket_tiers`: `registration_form_fields` = `null`.
- [x] Ocultar el único tier → aviso amarillo (no bloquea).
- [x] Publicar → abre el evento v2; verifica en la BD/v1 que tiers, etapas, preguntas y flyer quedaron bien.
- [x] Organizer (no owner/admin) entrando por URL a crear → vuelve al panel. 

## 6. Editar evento
- [x] Carga con las horas en la zona del evento (prueba un evento con zona distinta a Ecuador).
- [x] Nombre, enlace, moneda, zona y RSVP aparecen como solo lectura.
- [x] Cambiar solo el lugar → guarda sin pedir confirmación.
- [x] Guardar sin cambios → "No hay cambios para guardar".
- [x] Cambiar la fecha → confirmación "todos los que tienen ticket reciben email y notificación"; Cancelar no guarda; Confirmar guarda.
- [x] Revisa el email de cambio de fecha (Brevo): dice la zona horaria del evento ("All times are in the event’s local time zone: …"). `//Revisar levantamiente de brevo (apikey caducada)` → **10-22:** no era Brevo. Fallaba la lectura de compradores (`orders` tiene 3 FK a `users`, embed ambiguo PGRST201) y el reintento lo tapaba con `toLowerCase is not a function`. Corregido; **el correo ya llega (Kevin, 10-22)**. Falta confirmar en el correo el texto de la zona horaria y marcar.
- [x] Fin antes del fin de ventas de un tier → bloqueado y nombra el tier.
- [x] Evento que empieza en menos de 2 h (o ya empezó): fechas bloqueadas con aviso, pero lugar/descripción/flyer sí se guardan.
- [x] Cambiar flyer / quitar flyer.

## 7. Editor de tiers
- [x] Pestaña Tiers → "Nuevo tier" y "Editar" en cada tier.
- [x] Editar solo el nombre → guarda (no toca cupos).
- [x] Cupos por debajo de lo vendido → error antes de guardar.
- [x] Tier con etapas: la etapa con ventas no se puede quitar ni bajar de lo vendido; agregar etapa funciona; el total se actualiza.
- [x] El interruptor de etapas está bloqueado en tiers existentes.
- [x] "Marcar como agotado" funciona.
- [x] Preguntas: las guardadas son de solo lectura; los chips "Preguntas de este evento" las agregan; una pregunta nueva se agrega y los demás tiers NO la heredan (verifica en el registro de un tier distinto).
- [x] Eliminar: deshabilitado si tiene ventas o es el único tier; si no, pide confirmación y borra.
- [x] **Reducción forzada (con cuidado, Stripe test):** tier simple con un RSVP pendiente; bajar cupos por debajo de vendidos+reservados → aparece la confirmación con el detalle. Cancelar → nada cambia. Confirmar → el RSVP queda rechazado, la persona recibe email, se libera la retención de la tarjeta en Stripe, y los otros cambios (p. ej. nombre) también se guardan. 
- [x] Lo mismo en un tier con etapas → NO ofrece reducción forzada, pide revisar RSVPs.
- [x] Ocultar el último tier visible → aviso amarillo.

## 7b. Equipo (nuevo)
- [x] Solo owner/admin entran (organizer por URL → vuelve al panel). En el menú, "Equipo" queda resaltado.
- [x] Lista: dueño, admins, organizers (alfabético); "(tú)" en tu fila; organizers muestran "N eventos asignados" o "Sin eventos asignados"; el dueño no tiene opciones.
- [x] Agregar miembro: email inválido → mensaje; email sin cuenta → "Primero debe registrarse"; email de alguien ya en el equipo → aviso y botón deshabilitado; email válido → elegir rol → aparece en la lista.
- [x] La persona agregada como organizer entra y no ve eventos hasta que se los asignes.
- [x] Cambiar rol (organizer → admin): ahora ve todos los eventos; (admin → organizer): sus asignaciones anteriores se borran.
- [x] Asignar eventos: aparecen propios y co-organizados (marcados), los actuales ya marcados; guardar; el organizer ve exactamente esos.
- [x] Quitar del equipo: confirma; la persona pierde acceso. Quitarte a ti mismo avisa y te lleva a Mis organizadores.
- [x] Teléfono: tarjetas con rol y eventos; el botón + abre "Agregar miembro".

## 7c. Escáner: quién escanea (configuración web; se escanea solo en el celular)
**Antes:** migración `supabase/migrations/20261016150000_event_scanners.sql` aplicada (hecho 10-16).
Web:
- [x] En ningún lugar de la web (menú v2, barra inferior, Navbar v1) aparece una opción para escanear. `/qr-scanner` y `/v2/scanner` → inicio.
- [x] Pestaña **Escáner** del evento: aviso "se escanea con la app en el celular" y dos secciones separadas: **Cuentas que pueden escanear** y **Código de acceso**.
- [x] Cuentas: agregar por email (inválido → mensaje; sin cuenta → "debe registrarse"; miembro → "ya puede escanear"; repetido → aviso; válido → aparece). Quitar → confirma.
- [x] Código, owner/admin: sin código → "Crear código" genera 6 caracteres (sin 0/O/1/I/L). "Copiar" copia. "Nuevo código" y "Quitar código" piden confirmación. "Elegir el mío": `ab` → error local; `door-12` se guarda como `DOOR12`; un código que ya usa otro evento → "Otro evento ya usa este código".
- [x] Organizer asignado: gestiona cuentas pero en Código ve "Solo dueños y admins…" (sin ver el código). Viewer / organizer no asignado: solo explicaciones.
App (celular, build Android):
- [] Ajustes → Scan Tickets → código del evento → escanea ese evento sin cuenta. Tras "Nuevo código" en la web, el código viejo deja de funcionar al siguiente escaneo. `//Esto se valida con telefono app y aún no modificamos nada ahí, guardemos esta prueba para luego`
- [x] Con sesión de un miembro o de una persona agregada: escanea su evento; una persona agregada a otro evento → "You can't scan tickets for this event". `//Esto se valida con telefono app y aún no modificamos nada ahí, guardemos esta prueba para luego` `//Probado en la app (1b.6), aprobado 10-27`
- [x] Expo web (navegador, `localhost:8081`): no aparece "Scan Tickets" en Ajustes ni "QR Scanner" en el panel; `/scanner` → inicio. 
- [x] (Emergencia) `SCANNER_ACCESS_CODES=off` en `.env` y reinicio: el código deja de dar acceso (403). 

## 7d. Ajustes (nuevo)
- [x] Menú "Ajustes" (owner/admin) abre la pestaña Organización y queda resaltado; el botón "Gestionar" del panel también. `//Corregir, separar ajustes de cuenta vs ajustes de orgnanizacion`
- [x] Organización: logo (subir JPG/PNG/WebP/GIF ≤ 4,5 MB; un SVG → mensaje; quitar → confirma), nombre solo lectura, Instagram con "@" (pegar `https://instagram.com/usuario/` lo deja en `usuario`; espacios o símbolos → mensaje), ciudad, descripción con contador /500.
- [x] "Cambios sin guardar" al editar → "Guardar cambios" → "Todo guardado"; recargar y los datos siguen. La página pública `/organizer/<slug>` muestra lo nuevo.
- [x] Organizer / viewer (entrando por URL `/v2/organizer/settings?org=…`): Organización en solo lectura, sin logo editable ni botón guardar.
- [x] Personal: nombre y email de la cuenta (solo lectura), idioma English/Español (cambia al instante y persiste tras recargar), Cerrar sesión.
- [x] App actual: un miembro organizer/viewer que intente cambiar el logo desde la app ahora recibe error (antes podía).

## 7e. Payouts (nuevo) — Stripe en modo test
- [x] Menú "Payouts" solo para owner/admin; organizer por URL `/v2/organizer/payouts?org=…` → vuelve al panel.
- [x] Organización sin Stripe: elegir país → "Conectar con Stripe" abre Stripe; al terminar vuelve a Payouts con "Stripe está conectado". **En tu cuenta de pruebas elige United States** (ver "Cosas conocidas": Ecuador solo está habilitado en la plataforma de producción). `//Stripe error details:
  type: 'StripeInvalidRequestError',
  code: undefined,
  message: 'You are trying to create an account link for a connected account in a country that Connect Onboarding does not yet support.',
  statusCode: 400`
- [x] Organización con Stripe a medias: checklist + "Terminar configuración" abre Stripe.
- [x] Conectada: "Disponible para retirar" y "Disponible pronto" coinciden con el saldo de la cuenta conectada en el dashboard de Stripe (test). Historial y banco (••últimos 4) coinciden.
- [x] Con saldo disponible (en test: pagar con la tarjeta `4000 0000 0000 0077`, que deja el saldo disponible al instante): "Solicitar pago" → confirmación con monto y banco → aviso "Solicitaste…"; el payout aparece en el historial y en Stripe; el saldo baja.
- [x] Solicitar otra vez enseguida → "Ya hay un pago en camino". `//El modal bloquea un reintento inmediato (está bien)`
- [x] Saldo menor a $1 → botón deshabilitado con "El pago mínimo es $1.00".
- [x] "Gestionar en Stripe" abre el dashboard Express.
- [x] Si pruebas por ngrok u otro dominio que no sea `localhost:3000`, "Solicitar pago" responde "CSRF validation failed" salvo que `NEXT_PUBLIC_APP_URL` sea ese dominio (protección de la API, no es un fallo).

## 8. RSVPs
- [x] Lista de eventos con RSVP (propios y co-organizados), actuales/pasados, pendientes por evento.
- [x] Detalle: pestañas con conteo; aprobar (confirmación muestra el cobro; en Stripe test se captura); rechazar (libera retención).
- [x] Aprobar todas: confirmación con total, progreso, botón Detener, resumen final.
- [x] Dos personas aprobando la misma solicitud → la segunda ve "ya gestionada" (no error).
- [x] Exportar pendientes XLSX; ver datos de registro.
- [x] Evento terminado: sin botones de decidir.

## 9. Permisos (rápido, con cada usuario)
- [x] Owner/admin: todo.
- [x] Organizer asignado: solo sus eventos; puede editar evento y tiers; no ve crear evento ni ajustes/equipo.
- [x] Organizer sin asignaciones: panel vacío con el aviso; URLs directas a eventos → no disponible.

## 9b. Errores y carga (nuevo)
- [x] Al abrir cualquier pantalla del organizador por primera vez aparece el esqueleto gris con la forma del menú, no una pantalla en blanco.
- [x] Error de servidor (p. ej. detén Supabase y recarga el panel): sale "Algo salió mal" en estilo v2 y en tu idioma, con "Reintentar" y "Mis organizadores".

## 10. Idioma
- [x] Cambia el idioma en Ajustes → Personal y recorre 2–3 pantallas: textos en español, números y fechas con formato local.

## Cosas conocidas (no son fallos de esta prueba)
- ~~`next build` local y React duplicado~~ **Resuelto (2026-10-19, commit c78d917):** `react`/`react-dom` 19.1.0 en las devDependencies de la raíz; build de producción verificado por Kevin.
- **Stripe Connect con Ecuador en la cuenta de pruebas:** "country that Connect Onboarding does not yet support". No es un fallo del código (es idéntico a producción, `Flme_comp`): Stripe habilitó las cuentas *recipient* de EC/MX para la plataforma de **producción** (ver `connect-countries.ts` y JULY_2026_FIXES). Tu cuenta de pruebas es otra plataforma sin esa habilitación. En pruebas usa United States. Abierto desde el 07-15 (ESTADO_ACTUAL §4.4).
- **Organización que quedó con cuenta Stripe de Ecuador (pruebas):** el primer intento con Ecuador **sí creó** la cuenta conectada en Stripe (falló después, al abrir el formulario) y su id quedó guardado en la organización. Desde entonces "Conectar" / "Gestionar en Stripe" reutilizan esa cuenta y fallan siempre con "country that Connect Onboarding does not yet support". Arreglo en local: en la BD `update organizations set stripe_account_id = null, stripe_charges_enabled = false, stripe_payouts_enabled = false where slug = '<slug>';` y (opcional) borrar esa cuenta en Stripe test → Connected accounts. Luego conectar con United States.
- **Enviar tickets → Transferencias:** no cobra nada ni pide aceptación. Registra una venta que la persona **ya te pagó por transferencia** fuera de Flame: los tickets se emiten al instante y el precio (el del tier o el personalizado) solo queda en ventas y desglose. Cobrar un precio especial con aceptación del comprador (enlace de pago) no existe hoy; sería una función nueva (fase 3/4).
- La app móvil actual tiene 40 errores de tipos heredados (`tsc` en `apps/mobile`); ninguno de los cambios de esta fase. Se atienden en la fase 1b.
- El escaneo vive solo en la app (la actual; la v2 llega en fase 2).
- Payouts no muestra las transferencias bancarias cobradas directamente (sí están en el prototipo).
- ~~El hub "Manage" del prototipo no existe~~ **Hecho el 10-26** (ronda 3).
- Fallo pendiente (fase 3): la reducción forzada también rechaza RSVPs **aprobados** (ya cobrados) sin reembolso. No lo pruebes con dinero real.

## Cierre (2026-10-22): lo que queda abierto
- **Correos:** Brevo renovado y el de cambio de fecha ya llega (10-22, tras corregir la consulta de compradores). Zona horaria (§6) y RSVP rechazado por reducción forzada (§7): OK (Kevin, 10-22). **Correos de la fase 1 cerrados.**
- **Push:** en local nadie tiene `push_tokens` (ninguna app registrada en un celular), así que `[push] No registered devices…` es lo esperado y los push no se pueden verificar en la web. Pasan a la fase 1b.
- **Diferido por Kevin:** ingresos v2 = v1 con muchas órdenes (§3). **v1 no se borra** mientras tanto (además está `Flme_comp/`).
- **Pasa a fase 1b (app):** escaneo con código y con cuentas, `SCANNER_ACCESS_CODES=off` (§7c); búsqueda con tildes en Descubrir de la app.
- **Sin probar, bajo riesgo (cubiertos por tests automáticos):** saldo < $1, "Gestionar en Stripe" tras limpiar la cuenta EC.
