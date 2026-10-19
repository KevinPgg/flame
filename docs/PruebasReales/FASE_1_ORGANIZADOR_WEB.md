# Fase 1 — Organizador web v2 · pruebas reales

Lista viva: se amplía con cada entrega de la fase 1 (última actualización 2026-10-18, cierre de la fase).
Prueba en tu PC con datos reales de desarrollo (Supabase local, Clerk test, Stripe test).

Marca cada punto con [x] cuando pase. Si algo falla: anota la pantalla, qué hiciste, qué esperabas y qué pasó (y el error de la consola del navegador / terminal si hay).

## 0. Preparación
- [ ] **Build de producción:** `pnpm --filter web build` termina sin errores. Si falla en "prerendering page /404" con `Cannot read properties of null (reading 'useContext')`, es React duplicado por la instalación local (ver "Cosas conocidas"); avísame.
- [ ] `npm run dev` en `apps/web`. La primera visita a cada pantalla tarda 20–25 s (compila); las siguientes no.
- [ ] Usa una organización de prueba con: al menos un evento futuro con RSVP, uno sin RSVP, uno pasado, y un evento con algún ticket vendido (si se puede, uno con etapas de precio).
- [ ] Ten a mano 4 usuarios (o cambia el rol en la BD): **owner**, **admin**, **organizer asignado** a un evento, **organizer sin asignaciones**. El viewer no está en uso, se puede omitir.
- [ ] Stripe en modo test para lo que cobra (RSVP aprobado, reducción forzada).

## 1. Redirección v1 → v2 (nuevo)
- [ ] `/organizer` → abre `/v2/organizer` (Mis organizadores).
- [ ] `/organizer?org=<slug>` → panel v2 de esa organización.
- [ ] `/organizer?org=<slug>&tab=create-event` → crear evento v2.
- [ ] `/organizer?org=<slug>&tab=rsvps` → RSVPs v2.
- [ ] `/organizer/event/<id>?org=<slug>` → evento v2.
- [ ] `/organizer/rsvps/<id>?org=<slug>` → RSVPs de ese evento v2.
- [ ] `/organizer/team?org=<slug>` → equipo v2.
- [ ] `/organizer/settings?org=<slug>` (y `&tab=organization` / `&tab=personal`) → ajustes v2.
- [ ] `/organizer/settings?org=<slug>&tab=payouts` → payouts v2.
- [ ] Se queda en v1: `/organizer/<slug-publico>` (página pública).
- [ ] `/qr-scanner` y `/v2/scanner` → te mandan al inicio (la web ya no escanea).
- [ ] Desde ajustes v1, el "volver" al panel termina en v2.
- [ ] Interruptor de emergencia: con `ORGANIZER_V1=true` en `apps/web/.env` (reiniciar dev) vuelve a abrir v1. Quitarlo después.

## 2. Menú lateral y estructura (nuevo)
Escritorio (ventana ancha):
- [ ] El menú lateral queda fijo; solo el contenido hace scroll. La barra superior (título, migas, avatar) queda pegada arriba.
- [ ] Logo → Mis organizadores. Selector de organización: muestra rol, lista las otras y "Mis organizadores".
- [ ] "Stripe conectado" (o "Termina la configuración de Stripe" → payouts) solo para owner/admin.
- [ ] Eventos, RSVPs (con número de pendientes), Equipo y Ajustes según rol; "Crear evento" solo owner/admin. **No** aparece "Escanear".
- [ ] Próximos y Pasados (3) abren cada evento; el evento abierto queda resaltado.
- [ ] Descubrir → /discover, Mis tickets → /account, tu nombre → /profile. Tu foto/iniciales arriba a la derecha.
Teléfono (o ventana < 1024 px):
- [ ] Botón ☰ abre el menú como panel; se cierra con ×, Escape o tocando fuera.
- [ ] Barra flotante abajo (Eventos, RSVPs, Equipo, Ajustes según rol), sin "Escanear".
- [ ] En crear/editar evento y en el editor de tiers NO aparece la barra flotante; el botón Publicar/Guardar queda abajo.
- [ ] Ninguna pantalla se desborda a lo ancho.

## 3. Panel (dashboard)
- [ ] KPIs (eventos, ingresos) solo owner/admin; organizer ve "Ves los eventos asignados a ti".
- [ ] Pestañas actuales/pasados, búsqueda (sin tildes: "carnaval" encuentra "Carnával").
- [ ] Ingresos coinciden con v1 (`ORGANIZER_V1=true` para comparar) en una organización con muchas órdenes.

## 4. Detalle de evento (pestañas)
- [ ] Tiers: vendidos/total, reservados, restantes; "Agotado" y "Oculto" de un toque se guardan.
- [ ] Tiers: si ocultas todos, aparece el aviso "Todos los tiers están ocultos…".
- [ ] Compras: lista y exportación XLSX.
- [ ] Desglose: montos por tier; transferencias antiguas (antes del 15-01-2026) sin la comisión inflada.
- [ ] Promotores: crear/borrar enlace, ranking.
- [ ] Códigos: crear (límite vacío → mensaje claro), borrar con confirmación.
- [ ] Enviar tickets: buscar por email exacto, enviar gratis, transferencia con precio personalizado (acepta "25,50"), enviar a email sin cuenta, historial a la derecha.
- [ ] Co-organizadores: abre el modal y guarda.
- [ ] Organizer asignado: puede todo lo de su evento. Organizer NO asignado: no ve el evento (y por URL directa → "no disponible").

## 5. Crear evento
- [ ] Publicar vacío → errores junto a cada campo + "Corrige N campos", salta al primero; no se crea nada.
- [ ] Nombre → el enlace se genera solo (sin tildes); si editas el enlace a mano deja de seguir al nombre.
- [ ] Al elegir inicio, el fin se pone 5 h después; si cambias el fin a mano ya no se mueve.
- [ ] Inicio con menos de 2 h de margen → error.
- [ ] Si tu compu está en otra zona horaria que el evento (cambia la zona del evento a Madrid), debajo de las fechas aparece "… en tu hora (…)".
- [ ] Flyer: imagen > 4,5 MB → error; PDF → error; imagen válida → vista previa, quitar funciona.
- [ ] Tier simple: precio "25,50" → se guarda 25,50; "0" → gratis.
- [ ] Etapas ("El precio cambia según se vende"): crea Early Bird/Regular con cupos repartidos; con menos de 2 etapas no deja publicar.
- [ ] Código de acceso en minúsculas → se guarda en MAYÚSCULAS; 2 letras → error.
- [ ] Fin de ventas después del fin del evento → error.
- [ ] Preguntas por tier (con RSVP): agregar, tipo, obligatoria, subir/bajar; en el Tier 2 aparecen chips "Usadas en tiers anteriores".
- [ ] Misma pregunta con distinto tipo en dos tiers → error de conflicto.
- [ ] Apagar RSVP → las preguntas desaparecen y no se guardan.
- [ ] Ocultar el único tier → aviso amarillo (no bloquea).
- [ ] Publicar → abre el evento v2; verifica en la BD/v1 que tiers, etapas, preguntas y flyer quedaron bien.
- [ ] Organizer (no owner/admin) entrando por URL a crear → vuelve al panel.

## 6. Editar evento
- [ ] Carga con las horas en la zona del evento (prueba un evento con zona distinta a Ecuador).
- [ ] Nombre, enlace, moneda, zona y RSVP aparecen como solo lectura.
- [ ] Cambiar solo el lugar → guarda sin pedir confirmación.
- [ ] Guardar sin cambios → "No hay cambios para guardar".
- [ ] Cambiar la fecha → confirmación "todos los que tienen ticket reciben email y notificación"; Cancelar no guarda; Confirmar guarda.
- [ ] Revisa el email de cambio de fecha (Brevo): dice la zona horaria del evento ("All times are in the event’s local time zone: …").
- [ ] Fin antes del fin de ventas de un tier → bloqueado y nombra el tier.
- [ ] Evento que empieza en menos de 2 h (o ya empezó): fechas bloqueadas con aviso, pero lugar/descripción/flyer sí se guardan.
- [ ] Cambiar flyer / quitar flyer.

## 7. Editor de tiers
- [ ] Pestaña Tiers → "Nuevo tier" y "Editar" en cada tier.
- [ ] Editar solo el nombre → guarda (no toca cupos).
- [ ] Cupos por debajo de lo vendido → error antes de guardar.
- [ ] Tier con etapas: la etapa con ventas no se puede quitar ni bajar de lo vendido; agregar etapa funciona; el total se actualiza.
- [ ] El interruptor de etapas está bloqueado en tiers existentes.
- [ ] "Marcar como agotado" funciona.
- [ ] Preguntas: las guardadas son de solo lectura; los chips "Preguntas de este evento" las agregan; una pregunta nueva se agrega y los demás tiers NO la heredan (verifica en el registro de un tier distinto).
- [ ] Eliminar: deshabilitado si tiene ventas o es el único tier; si no, pide confirmación y borra.
- [ ] **Reducción forzada (con cuidado, Stripe test):** tier simple con un RSVP pendiente; bajar cupos por debajo de vendidos+reservados → aparece la confirmación con el detalle. Cancelar → nada cambia. Confirmar → el RSVP queda rechazado, la persona recibe email, se libera la retención de la tarjeta en Stripe, y los otros cambios (p. ej. nombre) también se guardan.
- [ ] Lo mismo en un tier con etapas → NO ofrece reducción forzada, pide revisar RSVPs.
- [ ] Ocultar el último tier visible → aviso amarillo.

## 7b. Equipo (nuevo)
- [ ] Solo owner/admin entran (organizer por URL → vuelve al panel). En el menú, "Equipo" queda resaltado.
- [ ] Lista: dueño, admins, organizers (alfabético); "(tú)" en tu fila; organizers muestran "N eventos asignados" o "Sin eventos asignados"; el dueño no tiene opciones.
- [ ] Agregar miembro: email inválido → mensaje; email sin cuenta → "Primero debe registrarse"; email de alguien ya en el equipo → aviso y botón deshabilitado; email válido → elegir rol → aparece en la lista.
- [ ] La persona agregada como organizer entra y no ve eventos hasta que se los asignes.
- [ ] Cambiar rol (organizer → admin): ahora ve todos los eventos; (admin → organizer): sus asignaciones anteriores se borran.
- [ ] Asignar eventos: aparecen propios y co-organizados (marcados), los actuales ya marcados; guardar; el organizer ve exactamente esos.
- [ ] Quitar del equipo: confirma; la persona pierde acceso. Quitarte a ti mismo avisa y te lleva a Mis organizadores.
- [ ] Teléfono: tarjetas con rol y eventos; el botón + abre "Agregar miembro".

## 7c. Escáner: quién escanea (configuración web; se escanea solo en el celular)
**Antes:** migración `supabase/migrations/20261016150000_event_scanners.sql` aplicada (hecho 10-16).
Web:
- [ ] En ningún lugar de la web (menú v2, barra inferior, Navbar v1) aparece una opción para escanear. `/qr-scanner` y `/v2/scanner` → inicio.
- [ ] Pestaña **Escáner** del evento: aviso "se escanea con la app en el celular" y dos secciones separadas: **Cuentas que pueden escanear** y **Código de acceso**.
- [ ] Cuentas: agregar por email (inválido → mensaje; sin cuenta → "debe registrarse"; miembro → "ya puede escanear"; repetido → aviso; válido → aparece). Quitar → confirma.
- [ ] Código, owner/admin: sin código → "Crear código" genera 6 caracteres (sin 0/O/1/I/L). "Copiar" copia. "Nuevo código" y "Quitar código" piden confirmación. "Elegir el mío": `ab` → error local; `door-12` se guarda como `DOOR12`; un código que ya usa otro evento → "Otro evento ya usa este código".
- [ ] Organizer asignado: gestiona cuentas pero en Código ve "Solo dueños y admins…" (sin ver el código). Viewer / organizer no asignado: solo explicaciones.
App (celular, build Android):
- [ ] Ajustes → Scan Tickets → código del evento → escanea ese evento sin cuenta. Tras "Nuevo código" en la web, el código viejo deja de funcionar al siguiente escaneo.
- [ ] Con sesión de un miembro o de una persona agregada: escanea su evento; una persona agregada a otro evento → "You can't scan tickets for this event".
- [ ] Expo web (navegador, `localhost:8081`): no aparece "Scan Tickets" en Ajustes ni "QR Scanner" en el panel; `/scanner` → inicio.
- [ ] (Emergencia) `SCANNER_ACCESS_CODES=off` en `.env` y reinicio: el código deja de dar acceso (403).

## 7d. Ajustes (nuevo)
- [ ] Menú "Ajustes" (owner/admin) abre la pestaña Organización y queda resaltado; el botón "Gestionar" del panel también.
- [ ] Organización: logo (subir JPG/PNG/WebP/GIF ≤ 4,5 MB; un SVG → mensaje; quitar → confirma), nombre solo lectura, Instagram con "@" (pegar `https://instagram.com/usuario/` lo deja en `usuario`; espacios o símbolos → mensaje), ciudad, descripción con contador /500.
- [ ] "Cambios sin guardar" al editar → "Guardar cambios" → "Todo guardado"; recargar y los datos siguen. La página pública `/organizer/<slug>` muestra lo nuevo.
- [ ] Organizer / viewer (entrando por URL `/v2/organizer/settings?org=…`): Organización en solo lectura, sin logo editable ni botón guardar.
- [ ] Personal: nombre y email de la cuenta (solo lectura), idioma English/Español (cambia al instante y persiste tras recargar), Cerrar sesión.
- [ ] App actual: un miembro organizer/viewer que intente cambiar el logo desde la app ahora recibe error (antes podía).

## 7e. Payouts (nuevo) — Stripe en modo test
- [ ] Menú "Payouts" solo para owner/admin; organizer por URL `/v2/organizer/payouts?org=…` → vuelve al panel.
- [ ] Organización sin Stripe: elegir país → "Conectar con Stripe" abre Stripe; al terminar vuelve a Payouts con "Stripe está conectado".
- [ ] Organización con Stripe a medias: checklist + "Terminar configuración" abre Stripe.
- [ ] Conectada: "Disponible para retirar" y "Disponible pronto" coinciden con el saldo de la cuenta conectada en el dashboard de Stripe (test). Historial y banco (••últimos 4) coinciden.
- [ ] Con saldo disponible (en test: pagar con la tarjeta `4000 0000 0000 0077`, que deja el saldo disponible al instante): "Solicitar pago" → confirmación con monto y banco → aviso "Solicitaste…"; el payout aparece en el historial y en Stripe; el saldo baja.
- [ ] Solicitar otra vez enseguida → "Ya hay un pago en camino".
- [ ] Saldo menor a $1 → botón deshabilitado con "El pago mínimo es $1.00".
- [ ] "Gestionar en Stripe" abre el dashboard Express.
- [ ] Si pruebas por ngrok u otro dominio que no sea `localhost:3000`, "Solicitar pago" responde "CSRF validation failed" salvo que `NEXT_PUBLIC_APP_URL` sea ese dominio (protección de la API, no es un fallo).

## 8. RSVPs
- [ ] Lista de eventos con RSVP (propios y co-organizados), actuales/pasados, pendientes por evento.
- [ ] Detalle: pestañas con conteo; aprobar (confirmación muestra el cobro; en Stripe test se captura); rechazar (libera retención).
- [ ] Aprobar todas: confirmación con total, progreso, botón Detener, resumen final.
- [ ] Dos personas aprobando la misma solicitud → la segunda ve "ya gestionada" (no error).
- [ ] Exportar pendientes XLSX; ver datos de registro.
- [ ] Evento terminado: sin botones de decidir.

## 9. Permisos (rápido, con cada usuario)
- [ ] Owner/admin: todo.
- [ ] Organizer asignado: solo sus eventos; puede editar evento y tiers; no ve crear evento ni ajustes/equipo.
- [ ] Organizer sin asignaciones: panel vacío con el aviso; URLs directas a eventos → no disponible.

## 9b. Errores y carga (nuevo)
- [ ] Al abrir cualquier pantalla del organizador por primera vez aparece el esqueleto gris con la forma del menú, no una pantalla en blanco.
- [ ] Error de servidor (p. ej. detén Supabase y recarga el panel): sale "Algo salió mal" en estilo v2 y en tu idioma, con "Reintentar" y "Mis organizadores".

## 10. Idioma
- [ ] Cambia el idioma en Ajustes → Personal y recorre 2–3 pantallas: textos en español, números y fechas con formato local.

## Cosas conocidas (no son fallos de esta prueba)
- `next build` local y React duplicado: la raíz del monorepo declara `next` sin `react`, y con `node-linker=hoisted` queda una copia de React 19.1.4 dentro de `node_modules/next` (la app usa 19.1.0). Rompe el prerender de `/404` en el build local; en producción (Vercel, sin hoisted) no aplica. Arreglo propuesto, pendiente de tu OK: agregar `react` y `react-dom` 19.1.0 a las devDependencies de la raíz y correr `pnpm install`.
- La app móvil actual tiene 40 errores de tipos heredados (`tsc` en `apps/mobile`); ninguno de los cambios de esta fase. Se atienden en la fase 1b.
- El escaneo vive solo en la app (la actual; la v2 llega en fase 2).
- Payouts no muestra las transferencias bancarias cobradas directamente (sí están en el prototipo).
- El hub "Manage" del prototipo no existe (Payouts y Ajustes son entradas del menú).
- Fallo pendiente (fase 3): la reducción forzada también rechaza RSVPs **aprobados** (ya cobrados) sin reembolso. No lo pruebes con dinero real.
