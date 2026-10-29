# Pruebas reales · Fase 3 (pagos)

Reescrita el 2026-10-29 tras la ronda de Kevin. `[x]` = ya probado y sigue valiendo; `[ ]` = falta o **cambió** y hay que repetirlo.
Dispositivos: 💻 PC (navegador) · 🌐📱 navegador del celular · 📱 app.

---

## 0. Preparación (una vez por sesión de pruebas)

1. **Migración nueva** (preguntas por entrada, §4): `supabase migration up` (o `supabase db reset` si no te importa la base local). Sin ella, la web y la app fallan al cargar eventos. Archivo: `supabase/migrations/20261029120000_tier_registration_per_ticket.sql`.
2. **Variables** en `apps/web/.env.local` (reinicia `pnpm dev` después de cambiarlas):
   - `CRON_SECRET=flme-local-cron` — **cualquier texto**; es la clave que exige el cron de conciliación (§4.3). Sin ella responde `{"error":"CRON_SECRET not configured"}` (lo que te salió el 10-29).
   - `ATTENDEE_V1` **sin definir** (o `false`) para probar la v2.
3. **Stripe**: en otra terminal `stripe listen --forward-to localhost:3000/api/webhooks/stripe`. **Sin esto se cobra pero no se crean tickets** (caso del 10-28). Solo se apaga a propósito en las pruebas que lo piden.
4. **Tarjetas de prueba** (cualquier fecha futura y CVC): `4242 4242 4242 4242` aprueba · `4000 0000 0000 0002` rechazada · `4000 0027 6000 3184` pide autenticación 3DS (ventana para aprobar/fallar).
5. **Supabase Studio local**: `http://127.0.0.1:54323` → Table Editor. Las horas de la base están en **UTC** (Guayaquil = UTC − 5).
6. Ten a mano **dos sesiones de la misma cuenta**: PC + celular (o dos pestañas).

**Glosario corto**
- **Reserva (hold)**: al tocar "Ir al pago" se apartan tus entradas por **30 min**; nadie más las compra. Tabla `holds`, columna `expires_at` = cuándo vence.
- **Pago en curso**: al tocar **Pagar**, la reserva se marca (`payment_in_progress = true`) para que no venza ni se borre mientras Stripe cobra. Si cierras la hoja de pago o la tarjeta es rechazada, la marca se quita sola.
- **RSVP**: solicitud que el organizador aprueba. Estados: *pendiente* (en revisión; si es pagada, la tarjeta solo está **autorizada**) → *aprobada* (se **cobró**; los tickets se crean cuando llega el webhook de Stripe, normalmente en segundos) → *comprada* (tiene tickets; cuenta como **vendido**). Si `stripe listen` está apagado, se queda en *aprobada* sin tickets: eso arregla la conciliación (§4.3).

---

## 1. Promotor (B10, B2)

- [x] 🌐📱 / 💻 `/events/<slug>?promoter=CODIGO` → antes de elegir nada: "Comprobando…" y luego la etiqueta verde **Promotor CODIGO**.
- [x] 🌐📱 `?promoter=NOEXISTE` → etiqueta roja "no es válido para este evento".
- [x] 💻 DevTools → Red: llamada a `/api/promoter-validate`, ninguna a `…/rest/v1/promoter_links`.
- [x] 📱 Desde el enlace del promotor, la misma etiqueta en el evento de la app.
- [x] 💻 Red lenta (Slow 3G): "Ir al pago" queda en espera hasta que aparece el promotor; la venta queda con el promotor.
- [x] 💻 Bloquear `/api/promoter-validate` → "No pudimos validar el código · Reintentar", sin bloquear la compra.

**Abrir el enlace en la app** (solo en un teléfono **real**; el modo "pantalla de celular" del navegador de la PC no puede abrir apps y da el error `Failed to launch 'intent://…'` que viste — es esperado ahí):
- [x] 📱 Android con la app: "¿Abrir en la app de Flame?" → Abrir en la app → la app en ese evento.
- [ ] 📱 Android **real** sin la app: Abrir en la app → vuelves a la página con "No pudimos abrir la app…".
- [ ] 📱 iPhone con la app: Safari pregunta "¿Abrir en Flame?" → la app en el evento.
- [x] 📱 Seguir en el navegador → el aviso no vuelve en esa pestaña. 💻 PC: el aviso no aparece.

---

## 2. Reserva, reloj y pantalla de pago (B3, B7, 3.3)

### 2.1 Reloj de 30 minutos
- [x] 💻 Ir al pago → `/purchase` con "Tickets reservados por 29:xx" bajando.
- [ ] 💻 / 📱 Tocar **Pagar** → el reloj **ya no sube por encima de lo que mostraba** (antes saltaba +10 min y pasaba de 30:00). Solo si quedaban menos de 10 min sube hasta **10:00** justas, para que alcance a terminar el pago.
  - Cómo forzarlo: en Studio pon `expires_at` de tu reserva a 3 min en el futuro, recarga, toca Pagar → el reloj pasa a ~10:00.
- [x] 💻 Reserva vencida a mano (en Studio, `expires_at` 1–2 min en el futuro y esperar) → "Tu reserva venció · Volver a elegir", Pagar bloqueado, ningún cobro en Stripe.
- [x] Tarjeta rechazada y reintento con 4242 → funciona.

### 2.2 Descuento y pago (corregido el 10-29)
Lo que te pasó: aplicaste un descuento y en ese momento tocaste Pagar en el celular. Aplicar un descuento **reemplaza** el pago en Stripe (cancela el anterior y crea otro); el celular intentó pagar con el anterior → `PaymentSheet cannot set up a PaymentIntent in status 'canceled'`. Arreglo: **Pagar se bloquea mientras se aplica un código** (web y app), y si el pago fue reemplazado en otro dispositivo, la app crea uno nuevo y sigue sola.
- [ ] 💻 Escribir un descuento y tocar Aplicar → mientras dice "…", **Pagar está deshabilitado**; al terminar, Pagar muestra el total con descuento y paga bien.
- [ ] 📱 Lo mismo en la app.
- [ ] 📱 + 💻 con la **misma reserva** abierta en los dos (abre la compra en curso en ambos): aplicar un descuento en la PC y luego tocar Pagar en el celular → la hoja de Stripe se abre sin error (con el monto sin descuento del celular; es correcto: cada pantalla paga lo que muestra).
- [x] Promotor escrito en la pantalla de pago y descuento → la venta queda con ese promotor; "You’re in" y Ver tickets.
- [x] 💻 Pagar con `stripe listen` apagado → nunca error: "Pago recibido · tus tickets se están preparando". Encenderlo y reenviar → "You’re in".
- [x] Ticket gratis → Obtener ticket gratis → listo.
- Aviso de la consola `The package resolves to a different version (2.0.6 / 3.3.1)…`: es de `import-in-the-middle` (Sentry/OpenTelemetry en modo dev), no del descuento. No afecta pagos.

### 2.3 Salir, volver y cancelar (cambió el 10-29)
Ahora **solo el botón "Cancelar reserva" libera la reserva**, y pide confirmación. Atrás (flecha, botón de Android, gesto), cambiar de pestaña, ir a Inicio/Explorar o cambiar de app **no** la tocan: la reserva sigue y aparece "Compra en curso" para volver.
- [ ] 📱 En la pantalla de pago: flecha atrás → vuelves al evento; arriba de la barra aparece **COMPRA EN CURSO · quedan mm:ss · Continuar** → vuelve a la misma pantalla y el reloj siguió.
- [ ] 📱 Android: botón atrás del sistema → igual que la flecha (la reserva **no** se libera).
- [ ] 📱 Cambiar de app (WhatsApp) y volver → sigues en la pantalla de pago; en la consola del servidor **no** aparece `POST /api/holds/cancel`.
- [ ] 📱 / 💻 **Cancelar reserva** (abajo, subrayado) → "¿Cancelar esta reserva? Las entradas se liberan…" → Cancelar reserva → vuelves al evento, el cupo se recupera y desaparece la compra en curso. Con "Atrás"/"Cancelar" en el aviso no pasa nada.
- [ ] 📱 Tocar Pagar y **cerrar la hoja de Stripe** sin pagar → vuelves a la pantalla; sales con la flecha → la compra en curso **sí** aparece (antes no, y además quedabas bloqueado 20 min para volver a comprar ese tier).
- [x] 💻 `/purchase` no muestra el aviso de compra en curso; Inicio/Explorar sí.

---

## 3. Una segunda reserva (B4 + aviso nuevo)

Qué protege cada cosa:
- **B4** (3.1) protege una reserva **cuyo pago ya empezó** (tocaste Pagar). En tu prueba la primera pestaña solo tenía la pantalla abierta, sin tocar Pagar: por eso se reemplazó. Era el comportamiento previsto, sin aviso.
- **Nuevo (10-29)**: cualquier reserva activa del mismo tier, en cualquier dispositivo, **pregunta antes** de reemplazarse.

- [ ] 💻 Pestaña A: Ir al pago (no pagues). Pestaña B, mismo tier → Ir al pago → aviso **"Ya tienes una reserva de N entradas de este tier (quedan mm:ss)"** con: **Ir a mi reserva** (abre la de A) · **Reemplazar reserva** (crea la nueva; la de A ya no se puede pagar) · Cancelar.
- [ ] 📱 + 💻: reserva en el celular, luego mismo tier en la PC → el mismo aviso. Y al revés (PC primero, celular después) → aviso nativo con los mismos tres botones.
- [ ] Reemplazar con otra cantidad (ej. de 2 a 4) → la pantalla de pago muestra 4; en `holds` hay **una** reserva tuya de ese tier.
- [ ] 💻 Pestaña A: Pagar con la tarjeta 3DS y deja abierta la autenticación. Pestaña B, mismo tier → "Ya tienes un pago en curso para este ticket…" (no ofrece reemplazar). Autenticar en A → tickets.
- [ ] Otro tier del mismo evento → no pregunta (las reservas son por tier).

---

## 4. RSVP

### 4.1 Preguntas: por solicitud (por defecto) o por entrada (opción del tier) — cambió el 10-29
Configuración: Organizador → evento RSVP → Tiers → editar tier → interruptor **"Preguntas por cada entrada"** (apagado por defecto). Al crear un evento nuevo el interruptor no está; se activa después editando el tier.
- [ ] 💻 / 📱 Tier con el interruptor **apagado**: Solicitar → subir a 3 invitados → las preguntas aparecen **una sola vez** (sin "Invitado 1 de 3"). Enviar → el organizador ve una sola respuesta.
- [ ] Encender el interruptor en ese tier y guardar → Solicitar con 3 invitados → "Invitado 1 de 3", "2 de 3", "3 de 3", cada uno con las preguntas; un obligatorio vacío → "Obligatorio" y no se envía.
- [ ] Organizador: detalle de la solicitud con bloques "Invitado 2", "Invitado 3"; Exportar pendientes con columnas "Guest 2 · …".
- [x] Pagado: autorización de tarjeta; en la web el promotor del enlace aparece aplicado. 📱 El descuento baja el monto autorizado.

### 4.2 Aprobar
- [x] Aprobar una RSVP pagada → tickets (con `stripe listen` encendido).
- [ ] RSVP de un evento **terminado**: en Studio pon `events.ends_at` en el pasado → el panel no muestra Aprobar. (Prueba técnica opcional: llamar la API `PATCH /api/organizer/rsvps/{id}/approve` con la sesión del organizador → 409 `EVENT_ENDED`, sin cobro en Stripe).

### 4.3 Conciliación (RSVP aprobada que se quedó sin tickets)
Requisito: `CRON_SECRET` en `.env.local` (§0) y el servidor reiniciado.
1. Apaga `stripe listen`.
2. Aprueba una RSVP **pagada** → queda "Aprobada" y sin tickets.
3. Espera 15 min, o en Studio → `rsvps` → esa fila → `approved_at` 20 min antes de ahora (UTC).
4. Llama al cron. En **cmd** de Windows (`$CRON_SECRET` no funciona en cmd; pon el valor tal cual):
   `curl -H "Authorization: Bearer flme-local-cron" http://localhost:3000/api/cron/reconcile-rsvp-payments`
   En **PowerShell** usa `curl.exe` (no `curl`) con la misma línea.
- [ ] Responde `{"checked":1,"created":1,…}`; la RSVP pasa a comprada y aparecen los tickets.
- [ ] Llamarlo otra vez → `"created":0` (no duplica).
- [ ] Sin la cabecera (o con otro valor) → 401.

---

## 5. Organizador: reducir capacidad (`force-reduce`, 3.5)

**Vendido vs aprobado en un tier RSVP:** *vendido* = RSVP que ya tiene tickets (comprada) o tickets de una compra normal; *aprobada* = ya cobrada pero todavía sin tickets (solo pasa unos segundos, o mientras el webhook no llega). Por eso, para ver una "aprobada" quieta hay que apagar `stripe listen`.

Preparación (evento RSVP, tier pagado de 10 cupos):
1. Con `stripe listen` encendido: 1 RSVP de 2 invitados → Aprobar → queda **comprada** = 2 vendidos.
2. Apaga `stripe listen`: otra RSVP de 2 → Aprobar → queda **aprobada** (2 cobrados sin tickets).
3. Una tercera RSVP de 1 → déjala **pendiente**.

- [ ] 💻 Editar el tier a 3 cupos → aviso "no caben…" → Reducir → error **"Cannot reduce capacity below 4: 2 sold, 2 in approved (already charged) RSVPs and 0 being paid right now."** Nada cambia.
- [ ] Editar a 4 → Reducir → OK: la **pendiente** pasa a Rechazada (correo), la **aprobada** sigue Aprobada. Enciende `stripe listen` y reenvía el evento (o corre la conciliación §4.3) → recibe sus tickets.
- [ ] Evento con tickets (no RSVP): alguien con la hoja 3DS abierta (ya tocó Pagar); desde la PC reducir el tier a lo vendido → error "being paid right now"; tras pagar, la compra termina con tickets.
- [ ] Compras → Exportar → columnas "Guest 2 · …" para compras que vinieron de RSVP con invitados.

---

## 6. Compra en curso y tarjetas de organizador
- [x] 🌐 / 📱 Salir de la pantalla de pago (Inicio/Explorar, cerrar y volver a abrir) → "COMPRA EN CURSO · … · Continuar" → misma pantalla con el reloj.
- [x] ✕ oculta el aviso; pagar o vencer lo quitan solos.
- [ ] 🌐 / 📱 Explorar → Organizadores: con evento próximo → su flyer; **sin eventos próximos → el flyer de su último evento** (nuevo 10-29); sin ningún evento con flyer → su foto de perfil difuminada.
- [x] 💻 / 📱 El logo del organizador queda sobre la portada y pasa **por debajo** de las barras al hacer scroll (arreglo 10-29).

---

## 7. Interruptores (la v1 sigue funcionando)
- [ ] 💻 `ATTENDEE_V1=true` y reiniciar → `/events/…` y `/purchase` son la versión de siempre (con su reloj); comprar de punta a punta. (Ahí no hay aviso de reemplazo: la v1 reemplaza en silencio como siempre).
- [ ] 📱 `EXPO_PUBLIC_ATTENDEE_V1=false` → hoja de checkout de siempre; compra completa.

## 8. Punta a punta (para cerrar la fase)
- [x] 🌐 y 📱 compra con promotor por enlace, descuento y reloj → tickets; promotor en Compras.
- [x] 🌐 y 📱 RSVP pagada con 2 invitados (tier "por entrada") → aprobar → tickets; el organizador ve ambos.
- [ ] Repetir las dos con lo cambiado hoy (sin tocar atrás para cancelar; descuento antes de pagar).

---

## Pendiente (fuera de esta fase)
- **Datos por ticket** en compras pagadas: entrega aparte (el interruptor "por entrada" de §4.1 se podrá reutilizar).
- **Android App Links** (enlaces que abren la app directo): requiere la huella SHA-256 y una compilación nueva.
- **B11** (salida, fase 5): quitar la política pública de `promoter_links`.
- **Crons de producción solo-POST** (`monitor-payment-authorizations`, `cleanup-past-event-rsvps`): hoy no corren; decisión de Kevin.
