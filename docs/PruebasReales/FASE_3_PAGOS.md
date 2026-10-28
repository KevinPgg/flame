# Pruebas reales · Fase 3 (pagos)

Entorno: local con Stripe en modo prueba (tarjeta `4242 4242 4242 4242`, cualquier fecha futura y CVC). En cada prueba se indica el dispositivo. Los arreglos de la 3.1 aplican **también a la v1** (no dependen del interruptor del asistente).

## 3.1 · Arreglos B2, B10, B3, B4

### B10 · El promotor se valida por el servidor
- [ ] 🌐 PC (DevTools → Red): abrir `/events/<slug>?promoter=CODIGO` → se ve una llamada a `/api/promoter-validate?event_id=…&code=CODIGO` y **ninguna** a `…supabase.co/rest/v1/promoter_links`.
- [ ] 📱 Celular: abrir el enlace del promotor en la app → la hoja de checkout muestra el promotor aplicado (verde). Sin sesión también se valida (no pide iniciar sesión para eso).

### B2 · El promotor no se pierde por comprar rápido
- [ ] 🌐 PC: DevTools → Red → "Slow 3G". Abrir el enlace del promotor, elegir tier y abrir el checkout enseguida → "Continuar" queda en "…" (deshabilitado) hasta que el promotor aparece; comprar → en el panel del organizador la venta tiene el promotor.
- [ ] 🌐 PC: DevTools → bloquear la URL `/api/promoter-validate` (Network request blocking) → en la hoja: "No pudimos validar el código (puedes comprar igual) · Reintentar". Continuar está habilitado. Desbloquear y tocar Reintentar → aparece "Promotor CODIGO".
- [ ] 🌐 PC: enlace con un código que no existe → "Ese código de promotor no es válido para este evento" (no desaparece en silencio).
- [ ] 📱 Celular: con el enlace del promotor y red lenta (o modo avión un instante), el botón de pagar dice "Checking promoter code…" y no responde hasta terminar; si falla: "We couldn’t check the code (you can still pay) · Retry".

### B3 · Pagar al final de la reserva
- [ ] 🌐 PC: comprar normal con 4242 → tickets emitidos. En la base (Supabase Studio, tabla `holds`) durante el pago o justo después: la reserva tiene `payment_in_progress = true`, `payment_started_at` y `datafast_checkout_id = stripe:pi_…`, y `expires_at` alargado 10 min.
- [ ] 🌐 PC (local): crear la reserva, en Studio poner su `expires_at` a 1 minuto en el futuro, esperar ~50 s y pagar → **tickets emitidos** (antes: cobro + reembolso). Opcional: desde otra cuenta crear otra reserva cualquiera (dispara la limpieza) mientras se paga.
- [ ] 🌐 PC: con la reserva ya vencida (en Studio `expires_at` en el pasado), tocar Pagar → "Your reservation expired" y **no** se cobra (Stripe dashboard sin pago).
- [ ] 📱 Celular: compra normal con 4242 → tickets; en `holds` la marca igual que en la web. Con la reserva vencida a mano: al tocar pagar no se abre la hoja de Stripe y sale el error.
- [ ] Tarjeta rechazada (`4000 0000 0000 0002`) y reintentar con 4242 en menos de 10 min → funciona y la reserva **no** se alarga una segunda vez.

### B4 · Una segunda reserva no borra un pago en curso
- [ ] 🌐 PC: pestaña A → elegir tier → `/purchase` → tocar Pagar con una tarjeta 3DS (`4000 0027 6000 3184`) y dejar abierta la ventana de autenticación. Pestaña B (misma cuenta, mismo tier) → Continuar → "Ya tienes un pago en curso para este ticket…" (no crea reserva). Volver a A, autenticar → **tickets emitidos**.
- [ ] 🌐 PC: abandonar una compra en `/purchase` **sin** tocar Pagar y volver a comprar el mismo tier → funciona como siempre (la reserva abandonada se reemplaza).
- [ ] 📱 Celular + 🌐 PC con la misma cuenta: empezar a pagar en uno (hoja de Stripe abierta en el celular después de tocar pagar) e intentar reservar el mismo tier en el otro → el segundo recibe el aviso.

## Pendiente para la salida (fase 5)
- B11: quitar la política `"Anyone can look up promoter codes for validation"` de `promoter_links` cuando las versiones viejas de la app ya no estén en uso.
