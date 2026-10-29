# Pruebas reales · Fase 3 (pagos)

Entorno: local con Stripe en modo prueba (tarjeta `4242 4242 4242 4242`, cualquier fecha futura y CVC). En cada prueba se indica el dispositivo. Los arreglos de la 3.1 aplican **también a la v1** (no dependen del interruptor del asistente).

## 3.1 · Arreglos B2, B10, B3, B4

### B10 · El promotor se valida por el servidor y se ve antes del checkout
- [x] 🌐 Teléfono y PC: abrir `/events/<slug>?promoter=CODIGO` → debajo de los tiers, **antes** de elegir nada: "Comprobando el código de promotor CODIGO…" y luego la etiqueta verde **"Promotor CODIGO"** con ✕.
- [x] 🌐 Con un código que no existe (`?promoter=NOEXISTE`) → etiqueta roja "El código de promotor NOEXISTE no es válido para este evento".
- [x] 🌐 PC (DevTools → Red): se ve la llamada a `/api/promoter-validate?event_id=…&code=CODIGO` y **ninguna** a `…/rest/v1/promoter_links`.
- [x] 📱 Celular (app): abrir el evento desde el enlace del promotor → la misma etiqueta verde en la pantalla del evento, antes de la hoja de pago; la hoja también lo tiene aplicado.

### Abrir el enlace en la app (desde el navegador del celular)
Una página web no puede ver qué apps tienes instaladas; la comprobación la hace el teléfono:
- [x] 📱 Android, Chrome, con la app instalada: abrir `https://<tu-ngrok o dominio>/events/<slug>?promoter=CODIGO` → aparece abajo "¿Abrir en la app de Flame?" → **Abrir en la app** → se abre la app en ese evento y con la etiqueta "Promotor CODIGO".
- [ ] 📱 Android sin la app (o desinstalada): **Abrir en la app** → vuelves a la misma página con el aviso "No pudimos abrir la app en este teléfono. Puedes seguir aquí." `//Por validar, probé desde navegadro con pantlalla reducidasa un error "Failed to launch 'intent://events/acto-acto-pide-contacto?promoter=PIRILIN#Intent;scheme=project-flame;package=com.projectflame.app;S.browser_fallback_url=http%3A%2F%2Flocalhost%3A3000%2Fevents%2Facto-acto-pide-contacto%3Fpromoter%3DPIRILIN%26noapp%3D1;end' because the scheme does not have a registered handler."`
- [x] 📱 Android/iPhone: **Seguir en el navegador** → el aviso desaparece y no vuelve mientras sigas en esa pestaña.
- [ ] 📱 iPhone, Safari, con la app instalada: **Abrir en la app** → Safari pregunta "¿Abrir en Flame?" → Abrir → la app en el evento. Sin la app: Safari muestra un error de dirección y al volver la página dice que no pudo abrirla.
- [x] 💻 PC: el aviso no aparece.
- Nota: con la app de la tienda/TestFlight en iPhone, tocar un enlace `flme.co/events/…` en WhatsApp o Instagram ya abre la app sola (enlaces universales, ya configurados). En Android eso **no** está configurado todavía (ver "Pendiente").

### B2 · El promotor no se pierde por comprar rápido
- [x] 🌐 PC: DevTools → Red → "Slow 3G". Abrir el enlace del promotor, elegir tier y abrir el checkout enseguida → "Continuar" queda en "…" (deshabilitado) hasta que el promotor aparece; comprar → en el panel del organizador la venta tiene el promotor.
- [x] 🌐 PC: DevTools → bloquear la URL `/api/promoter-validate` (Network request blocking) → en la página y en la hoja: "No pudimos validar el código (puedes comprar igual) · Reintentar". Continuar está habilitado. Desbloquear y tocar Reintentar → aparece "Promotor CODIGO".
- [x] 📱 Celular: con el enlace del promotor y red lenta (o modo avión un instante), el botón de pagar de la hoja dice "Checking promoter code…" y no responde hasta terminar; si falla: "We couldn’t check the code (you can still pay) · Retry".

### B3 + reloj · La reserva de 30 minutos
**Qué es:** al tocar Continuar se **reservan** tus tickets por 30 minutos (nadie más puede comprarlos). La hora en que vence esa reserva se guarda en la base, en la tabla `holds`, columna `expires_at` (fecha y hora de vencimiento). Antes, si la reserva vencía mientras Stripe cobraba, podías quedar cobrado y reembolsado sin tickets. Ahora, al tocar **Pagar**, la reserva se marca "pago en curso" y se alarga 10 minutos.

**Lo que ves en la web (`/purchase`):** arriba de la página, fijo, **"Tickets reservados por 29:41"** contando hacia atrás. En los últimos 5 minutos se pone amarillo con "Te quedan menos de 5 minutos para pagar". Al llegar a 0: "Tu reserva venció · Volver a elegir" y el botón de pagar se bloquea. Al tocar Pagar, el reloj **sube 10 minutos** (es el alargue del servidor).
**En la app** todavía no hay reloj: la reserva se crea en el mismo toque de "Pagar" y enseguida se abre la hoja de Stripe, que tapa la pantalla. El reloj de la app llega con la pantalla de pago (3.3).

- [ ] 🌐 PC: elegir tier → Continuar → en `/purchase` aparece el reloj cerca de 30:00 y baja cada segundo.
- [ ] 🌐 PC: tocar **Pagar** con `4242…` → antes de que termine, el reloj sube ~10 minutos; la compra termina con tickets.
- [ ] 🌐 PC, **simular el vencimiento** (no hace falta esperar 30 min): con `/purchase` abierto, en Supabase Studio local (`http://127.0.0.1:54323` → Table Editor → `holds`) buscar la fila de tu reserva (la más reciente con tu usuario y sin `order_id`) y cambiar `expires_at` a **2 minutos en el futuro** (hora UTC). Recargar `/purchase` → el reloj muestra ~02:00 en amarillo. Pagar antes de que llegue a 0 → **tickets emitidos** (esto antes podía terminar en reembolso).
- [ ] 🌐 PC: repetir pero dejar que llegue a 0 → "Tu reserva venció", el botón Pagar no responde y **no** aparece ningún cobro en Stripe. "Volver a elegir" lleva al evento.
- [ ] Verificación en la base tras pagar: en `holds`, tu reserva tiene `payment_in_progress = true`, `payment_started_at` con la hora del pago y `datafast_checkout_id = stripe:pi_…` (el id del pago en Stripe).
- [ ] 📱 Celular: compra normal con `4242…` → tickets; en `holds` la misma marca. Con la reserva vencida a mano no se puede (en la app la reserva nace al tocar Pagar).
- [ ] Tarjeta rechazada (`4000 0000 0000 0002`) y reintentar con `4242…` antes de 10 minutos → funciona y el reloj **no** vuelve a subir.

### B4 · Una segunda reserva no borra un pago en curso
- [ ] 🌐 PC: pestaña A → elegir tier → `/purchase` → tocar Pagar con una tarjeta 3DS (`4000 0027 6000 3184`) y dejar abierta la ventana de autenticación. Pestaña B (misma cuenta, mismo tier) → Continuar → "Ya tienes un pago en curso para este ticket…" (no crea reserva). Volver a A, autenticar → **tickets emitidos**.
- [ ] 🌐 PC: abandonar una compra en `/purchase` **sin** tocar Pagar y volver a comprar el mismo tier → funciona como siempre (la reserva abandonada se reemplaza).
- [ ] 📱 Celular + 🌐 PC con la misma cuenta: empezar a pagar en uno (hoja de Stripe abierta en el celular después de tocar pagar) e intentar reservar el mismo tier en el otro → el segundo recibe el aviso.

## 3.3 · Pantalla de pago nueva (3.2 unida)
Con `stripe listen` corriendo (si no, el pago se cobra pero los tickets no se crean: ver el caso del 10-28).

**Web · 🌐 teléfono y PC**
- [ ] Evento → elegir tier → −/+ → **Ir al pago** (o "Continuar al pago" abajo) → se abre directamente `/purchase` (sin hoja intermedia) con: reloj "Tickets reservados por 29:xx", flyer y datos del evento, "2 × Tier", desglose (Tickets, Comisión de servicio con ⓘ, Total), formulario de tarjeta y **Pagar $X**.
- [ ] Con enlace de promotor: en el pedido "Promotor CODIGO ✓" y sin campo. Sin enlace: campo "Código de promotor (opcional)" → código malo = aviso; bueno = aparece en el pedido y el campo desaparece. Pagar → en el panel del organizador la venta tiene ese promotor.
- [ ] Descuento: aplicar → línea "Descuento CODIGO −$X", el total y el botón Pagar bajan; Quitar → vuelve.
- [ ] Pagar con 4242 → "Pago recibido" → `/purchase/success`: "You’re in" con el evento, N tickets, **Ver tickets** (abre el QR), Compartir, Listo.
- [ ] **B5:** pagar con `stripe listen` **apagado** → la página de éxito NO muestra error: a los ~10 s "Pago recibido · tus tickets se están preparando" con "Ir a mis tickets". Encender `stripe listen` y reenviar el evento → al rato "You’re in".
- [ ] Ticket gratis: Ir al pago → "Gratis: no hace falta pagar" + **Obtener ticket gratis** → "Tu ticket gratis está listo".
- [ ] "Cancelar y liberar los tickets" → vuelve al evento y el tier recupera el cupo.
- [ ] RSVP: "Solicitar" sigue abriendo la hoja de siempre (la 3.4 la cambia).
- [ ] `ATTENDEE_V1=true`: `/purchase` es la página de siempre.

**App · 📱 celular**
- [ ] Evento → tier → −/+ → **Ir al pago** → pantalla "Checkout" (sin la isla de pestañas) con reloj, evento, pedido, promotor (✓ o campo), descuento, desglose y **Pagar $X** abajo.
- [ ] Pagar → se abre la hoja de Stripe → 4242 → "You’re in" · "Tus tickets se están preparando" → **Ver tickets** abre Mis tickets (el ticket aparece cuando el webhook lo crea).
- [ ] Cerrar la hoja de Stripe sin pagar → vuelves a la pantalla de pago, el reloj sigue, puedes pagar de nuevo.
- [ ] **Volver** (flecha) → vuelves al evento y la reserva se libera (en la base `holds` ya no está).
- [ ] Promotor escrito en la pantalla y descuento → igual que en la web; la venta queda con ese promotor.
- [ ] Reserva vencida (en Studio poner `expires_at` 1 min en el futuro y esperar) → "Tu reserva venció · Volver a elegir" y Pagar bloqueado.
- [ ] Ticket gratis → "Obtener ticket gratis" → "You’re in".
- [ ] RSVP: "Solicitar" sigue con la hoja de siempre.

## Pendiente
- **Datos por ticket** en compras pagadas (formulario del organizador por cada entrada): entrega aparte con migración (decisión de Kevin 10-28).
- **Android App Links** (que un enlace `flme.co/events/…` abra la app directo, como ya pasa en iPhone): hace falta agregar `intentFilters` con `autoVerify` en `app.json` y publicar `/.well-known/assetlinks.json` con la huella SHA-256 del certificado de firma (de Play Console o del keystore). Requiere una compilación nueva de la app. Kevin decide cuándo (producción se centra en iOS).

## Pendiente para la salida (fase 5)
- B11: quitar la política `"Anyone can look up promoter codes for validation"` de `promoter_links` cuando las versiones viejas de la app ya no estén en uso.
