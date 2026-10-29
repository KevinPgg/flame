# Fase 3 · Pagos: arreglos previos y flujo nuevo

Documento vivo de la fase 3 (checkout y códigos). Estado al 2026-10-28: 3.0 análisis y plan; **3.1 hecha** (B2, B10, B3, B4 — §5); **3.2 unida a la 3.3 y hecha en código** (pantalla de pago nueva web y app, B5, B7 — §6); pruebas reales pendientes. Siguiente: 3.4 (RSVP).

Fuente de verdad del comportamiento actual: **`Flme_comp/`** (producción). Diagnósticos de origen: `sesiones/2026-07-09-analisis-stripe-holds-promotor-bug.md` y `sesiones/2026-07-09-auditoria-bugs-holds-promoter.md` (B1–B10). Aquí se re-verificó cada uno contra `Flme_comp` y contra la copia de trabajo.

## 0. Decisiones de Kevin (2026-10-27)

1. **Antes del rediseño se corrigen:** B2 + B10 (promotor), B3 + B4 (hold vencido / duplicado), B5 + B7 (éxito y reloj en la web). **Quedan fuera por ahora:** B8 (carrera del último uso de un descuento) y B9 (autorización huérfana del RSVP pagado en la app).
2. **El código de descuento va en el checkout** (pantalla de pago), como el prototipo. La hoja del tier queda con cantidad + promotor.
3. **El checkout sigue el prototipo completo en web y app:** hoja del tier → pantalla de pago (reloj de 30 min, pedido, datos por ticket, descuento, desglose con comisión, Pagar) → éxito "You're in". La app sigue usando la hoja de pago nativa de Stripe; la web, el formulario de Stripe.
4. Las pruebas reales pendientes de la fase 2 se dejan para después (Kevin, 10-27).

## 1. Flujo actual

### 1.1 Producción (`Flme_comp`)
| Paso | Compra directa (web) | RSVP (web) | App |
| --- | --- | --- | --- |
| Elegir | Tarjetas de tier + campos en línea de promotor y código de acceso (`EventDetail.tsx`) | Igual | Tarjetas + `PreCheckoutCodes` (promotor y acceso en línea) |
| Promotor | Se valida desde el navegador contra `promoter_links` (Supabase directo, RLS anon) y se guarda en el **hold** al crearlo | Se guarda en la RSVP al crearla | Igual, Supabase directo (`useCheckout.ts` L224-262) |
| Reserva | `POST /api/holds/create` → RPC `atomic_create_hold_with_stage_validation` (30 min, **borra otros holds activos del mismo usuario y tier**) | Sin hold de inventario | Hold igual que web |
| Pago | `/purchase` (`StripePurchaseFlow` + `StripePaymentForm`): PaymentIntent automático; campo de descuento; **campo de promotor decorativo (B1)**; pre-chequeo `GET /api/holds/validate` antes de pagar; sin reloj | `RsvpPaymentModal`: autorización manual (se cobra al aprobar) | Hoja `CheckoutSheet` + PaymentSheet nativo; pre-chequeo del hold antes de pagar |
| Pedido | **Webhook** `payment_intent.succeeded` → `createOrderAndTicketsFromHold` (lee el hold por id; promotor desde la metadata del PaymentIntent = `hold.promoter_code \|\| body`) | Al aprobar el organizador → captura → webhook | Mismo webhook |
| Éxito | `/purchase/success`: busca el pedido 5 veces (~13 s) y luego muestra error | — | "Tus tickets se están preparando" (honesto) |

### 1.2 Copia de trabajo hoy (lo que ya cambió respecto a `Flme_comp`)
- **Corrección 2.4 (10-27), solo con la v2 del asistente:** la página de evento muestra solo tiers; "¿Tienes un código de acceso?" en una hoja; una **hoja de checkout web** previa al hold con cantidad, promotor (validación existente) y descuento (validado con `/api/purchase/validate-promo-code`, se aplica en `/purchase` vía `?promo=`); en `/purchase` el promotor pasa a **solo lectura**. Esto **cierra B1 en la web** (el promotor ya no se puede "poner" donde no llegaba). Con la decisión 2 de arriba, el descuento se moverá de esa hoja a la pantalla de pago en la 3.3.
- App: con la v2, sin `PreCheckoutCodes`; el promotor y el descuento están en la hoja de checkout de siempre.
- Archivos de cobro **idénticos a producción**: `webhooks/stripe/route.ts`, `holds/create`, `holds/validate`, `purchase/success/page.tsx`, `useCheckout.ts`, `create-payment-intent`. `StripePaymentForm.tsx` solo cambió un log; `orders.ts` solo el `deepLink` de una notificación.

## 2. Bugs a corregir en la 3.1

Formato: **estado en producción** (con evidencia) · **estado en la copia** · **impacto** · **arreglo propuesto** · **riesgo del arreglo** · **mejora** · **cómo se prueba**.

### B2 · Carrera de validación del promotor (web y app) — [Seguro]
- **Producción:** con `?promoter=X`, el estado empieza en "validating" y la validación es asíncrona; el botón de compra **no se bloquea** mientras tanto. `effectivePromoterCode` solo cuenta con "valid" (`EventDetail.tsx` L354-357). Un clic rápido crea el hold **sin promotor**. Si la consulta falla (red), el estado vuelve a "idle" y el código se descarta **sin aviso** (L196-199). La app tiene la misma carrera: el botón de pagar de `CheckoutMainSheet` no mira `promoterStatus` (solo deshabilita el de descuento, L411) y un error de validación también se traga (`useCheckout.ts` L241-244).
- **Copia:** igual en la v1. En la v2 el botón "Continuar" de la hoja tampoco se bloquea durante "validating".
- **Impacto:** ventas que llegan por el enlace del promotor y quedan **sin atribuir**, en silencio. Afecta reportes de promotores y comisiones. Más probable en celulares con red lenta (la validación tarda más que el toque).
- **Arreglo:** (a) "Continuar"/"Pagar" deshabilitados mientras el promotor está "validating" (web v1, web v2, app); (b) si la validación falla por red/servidor, estado "error" visible con "Reintentar" en lugar de descartar; (c) un código del enlace que resulta inválido se muestra como tal (no desaparece).
- **Riesgo:** bajo. Solo front. El caso a vigilar: si el servidor de validación está caído, el botón no debe quedar bloqueado para siempre → el estado "error" **no** bloquea (se puede comprar sin promotor, avisado).
- **Mejora:** atribución fiable desde el primer toque.
- **Pruebas:** web y app — botón deshabilitado durante la validación; error de red → mensaje + reintentar y botón habilitado; enlace con código inválido → aviso. Real: abrir el enlace de un promotor con red lenta (DevTools "Slow 3G") y comprar al instante → el pedido tiene el promotor.

### B10 · Dos caminos de validación del promotor + RLS abierta — [Seguro]
- **Producción:** la web (página de evento) y la app validan con Supabase **directo desde el cliente**; `/purchase` usaba `/api/promoter-validate` (servidor). La consulta del cliente funciona porque existe la política `"Anyone can look up promoter codes for validation" FOR SELECT TO anon, authenticated USING (true)` (`supabase/migrations/20260408011955_fix_rls_security_lints.sql` L56-60).
- **Hallazgo nuevo (B11) [Seguro]:** esa política **no limita columnas ni filas**: cualquiera, sin sesión, puede listar **todos** los `promoter_links` de **todos** los eventos (`promoter_code`, `promoter_name`, `created_by`, `event_id`) con la clave pública de Supabase. No son datos de pago, pero expone nombres de promotores y permite atribuirse a cualquiera.
- **Copia:** igual (la hoja v2 reutiliza la validación directa de `EventDetail`).
- **Impacto:** dos reglas que pueden divergir (mayúsculas, longitud mínima, errores) y una tabla legible por anónimos.
- **Arreglo:** web y app validan **solo** con `GET /api/promoter-validate` (ya existe, usa `supabaseAdmin`). La app lo llama con `apiGet` (ya usa la API web para el organizador). **Después**, con ambas plataformas en la API, una migración que quite la política anon (B11). La migración va **al final de la 3.x**, porque las versiones de la app ya publicadas siguen consultando directo: quitarla antes rompe la atribución en esas versiones. Recomendación: dejarla para la salida (fase 5), cuando la versión vieja de la app deje de usarse, y documentarla como pendiente.
- **Riesgo:** bajo para el cambio de cliente. La migración tiene el riesgo de versiones viejas de la app (por eso se pospone).
- **Mejora:** una sola regla de validación; camino para cerrar la tabla.
- **Pruebas:** tests de que web y app llaman a `/api/promoter-validate` con `event_id` y `code`; el endpoint ya tiene su lógica (mayúsculas, mínimo 3).

### B3 · Hold vencido durante el pago → resultado no determinista — [Seguro]
- **Producción:** el webhook busca el hold por id y **no mira `expires_at`** (`webhooks/stripe/route.ts` L782-786). Si el hold venció mientras el comprador pagaba: (a) si la fila sigue, emite los tickets; (b) si otro usuario disparó la limpieza (`cleanup_expired_holds`, se ejecuta al crear cualquier hold), la fila ya no existe → **"ghost order" + reembolso automático**: el comprador ve el cobro y el reembolso, sin tickets. **Causa raíz:** el flujo de Stripe **nunca marca el hold como "pago en curso"**. La base ya lo soporta: `mark_hold_payment_started(hold, checkout_id, +10 min)` pone `payment_in_progress = true`, `payment_started_at` y alarga el vencimiento; `cleanup_expired_holds` respeta 15 min de gracia a esos holds (`baseline.sql` L2403-2465 y L515-536). Hoy **solo lo usa Datafast** (`datafast/create-checkout/route.ts` L796).
- **Copia:** idéntica.
- **Impacto:** pagos al límite de los 30 min terminan en reembolso sin tickets (o en tickets, según la suerte). Bajo volumen, alto costo de confianza y de soporte.
- **Arreglo:** en el pre-chequeo antes de pagar (web `StripePaymentForm`, app antes del PaymentSheet), un `POST /api/holds/start-payment` nuevo que valida el hold (dueño, no vencido, sin pedido) y llama a `mark_hold_payment_started` con el id del PaymentIntent (+10 min). El webhook **mantiene** su conducta de honrar el pago si la fila existe (el tope de capacidad de `increment_tier_quantity_sold` evita sobreventa, L2280-2329); el cambio hace que la fila **sí exista** durante el pago. Sin migración: la función ya está en la base.
- **Riesgo:** medio-bajo. Toca el camino de pago, pero solo agrega un paso previo que ya usa Datafast. Casos a cuidar: el pago se abandona → `cleanup_abandoned_payments` limpia la marca a los 20 min (ya existe); el pre-chequeo falla por red → no se paga (como hoy con `holds/validate`).
- **Mejora:** quien empezó a pagar con el hold vigente recibe sus tickets; se acaban los reembolsos "fantasma" por vencimiento.
- **Pruebas:** test del endpoint (dueño, vencido, con pedido, sin sesión); tests de que web y app lo llaman antes de confirmar. Real: crear hold, esperar ~29 min (o acortar en local), pagar → tickets emitidos.

### B4 · Un segundo hold borra el primero → cobro + reembolso sin tickets — [Seguro]
- **Producción:** el RPC de crear hold **borra los holds activos del mismo usuario en el mismo tier** antes de crear el nuevo (`20260414222258_revert_hold_rpc_jwt_assertion.sql` L110-117; motivo original: no bloquear a quien cerró la app a mitad de compra). Con dos pestañas o dos dispositivos, pagar en el primero → el webhook no encuentra el hold → ghost order + reembolso.
- **Copia:** idéntica.
- **Impacto:** raro pero muy confuso para el comprador; además puede ocurrir al volver atrás y reintentar mientras el primer pago se procesa.
- **Arreglo (sin migración):** en `POST /api/holds/create`, **antes** de llamar al RPC, si el usuario tiene un hold activo de ese tier con `payment_in_progress = true` (lo marca el arreglo de B3), responder 409 "Ya tienes un pago en curso para este ticket" en vez de borrarlo. El resto de holds abandonados se siguen reemplazando como hoy (se conserva el motivo original).
- **Riesgo:** bajo-medio. Depende de B3 (sin la marca no hay nada que proteger). Ventana de carrera mínima entre la consulta y el RPC; cerrarla del todo exige cambiar el RPC (migración), que no se propone ahora.
- **Mejora:** el pago en curso nunca pierde su reserva por un reintento.
- **Pruebas:** test del endpoint (hold en pago → 409; hold abandonado → se reemplaza). Real: abrir el pago en dos pestañas y pagar en la primera después de iniciar la segunda.

### B5 · La página de éxito web se rinde a los ~13 s — [Seguro]
- **Producción:** `/purchase/success` busca el pedido 5 veces con espera creciente (máx. ~13 s, `success/page.tsx` L87-100) y luego muestra **error**, aunque el pago fue correcto; el pedido lo crea el webhook, que puede tardar (arranque en frío, reintentos de Stripe). La app ya muestra "se están preparando".
- **Copia:** idéntica.
- **Impacto:** compradores que pagaron ven un error → compran de nuevo o escriben a soporte.
- **Arreglo:** seguir consultando hasta ~2 min con espera creciente, y desde los ~10 s mostrar un estado honesto: "Pago recibido. Tus tickets se están preparando; te llegan por correo y aparecerán en Mis tickets" con botón a Mis tickets. Error solo si el pago **no** se confirmó (estado del PaymentIntent). Entra en el éxito v2 ("You're in") de la 3.3.
- **Riesgo:** bajo. Solo front.
- **Mejora:** nadie que pagó ve un error.
- **Pruebas:** test con el endpoint de pedido devolviendo 404 varias veces y luego el pedido; y con 404 siempre → mensaje "se están preparando", no error.

### B7 · Sin reloj del hold en la web — [Probable → se confirma en código: no hay temporizador en `/purchase`]
- **Producción:** el hold dura 30 min y `/purchase` no lo muestra; el comprador se entera al fallar el pre-chequeo.
- **Copia:** idéntica.
- **Impacto:** frustración y reservas perdidas sin aviso.
- **Arreglo:** reloj "Tickets reservados por 12:34" en la pantalla de pago (prototipo), con aviso al quedar 5 min y, al llegar a 0, bloqueo del botón Pagar con "Tu reserva venció · Volver a elegir". Con B3, al pulsar Pagar la reserva se alarga (lo hace el servidor); el reloj lo refleja. Entra en la pantalla de pago v2 (3.3). También en la app (la hoja actual tampoco tiene reloj).
- **Riesgo:** bajo. Solo front (el vencimiento ya viene en `holds/details`).
- **Mejora:** el comprador sabe cuánto tiempo tiene.
- **Pruebas:** test con reloj simulado (aviso a 5 min, bloqueo a 0).

### Fuera por ahora (decisión de Kevin)
- **B8 · Último uso de un descuento cobrado dos veces** — el incremento de uso ocurre después del cobro; el segundo pedido falla tras cobrar. Riesgo real pero raro; el arreglo serio es reservar el uso con el hold (migración).
- **B9 · RSVP pagado en la app:** autoriza la tarjeta antes de enviar la RSVP; si el envío falla, la retención queda hasta el cron (6 h). Y [Adivinando] la aprobación podría sobrevender si no re-verifica cupo.
- **B6 · `/api/purchase/complete-hold` es código muerto** — sin riesgo para el usuario; se puede borrar en la limpieza final.
- **B11 · RLS de `promoter_links`** — ver B10: se cierra en la salida (fase 5).
- **Ya anotados para la fase 3 en `ESTADO_ACTUAL.md`:** `force-reduce` rechaza RSVPs aprobados; `approve` de RSVP no valida que el evento haya terminado. No entran en la 3.1 elegida; se revisan en la 3.4 (RSVP).

## 3. Flujo nuevo (prototipo) y entregas

| Entrega | Contenido | Web | App |
| --- | --- | --- | --- |
| 3.0 | Este análisis y plan | — | — |
| 3.1 | B2, B10, B3, B4 (+ tests) — sin cambiar el diseño | ✓ | ✓ |
| 3.2 | Hoja del tier: se abre al tocar un tier; cantidad, límite, promotor (check verde si vino por enlace, campo si no), aviso de 30 min, total antes de comisiones, Continuar = crear el hold. El descuento sale de esta hoja | ✓ | ✓ |
| 3.3 | Pantalla de pago: reloj (B7), evento, pedido, promotor con check, datos por ticket (formulario del organizador), descuento con estado aplicado, desglose (tickets, descuento, comisión con ⓘ, total), Pagar (Stripe). Éxito "You're in" con Ver tickets / Compartir / Listo (B5). Web en `/purchase` (misma URL); app como pantalla | ✓ | ✓ |
| 3.4 | Hoja de RSVP: formulario del organizador por invitado, número de invitados, cuándo se cobra; pagado → autorización de tarjeta como hoy | ✓ | ✓ |
| 3.5 | Cierre: interruptor, paridad, `PruebasReales/FASE_3_PAGOS.md` | ✓ | ✓ |

Principio: **la lógica de cobro no cambia** (mismos endpoints, mismo webhook, misma metadata); cambian las pantallas y los arreglos de §2. Todo detrás del interruptor del asistente (`ATTENDEE_V1` / `EXPO_PUBLIC_ATTENDEE_V1`).

## 4. Riesgos de la fase
- [Seguro] Es el único flujo que mueve dinero: cada entrega lleva tests del camino feliz y de los errores, y una prueba real con tarjeta de prueba antes de la siguiente.
- [Seguro] Las pruebas reales de la fase 2 (incluida la corrección 2.4 del checkout) siguen pendientes: la 3.2 reemplaza esa hoja, así que lo que se pruebe de ella vale para poco; **lo que sí hay que probar antes de la 3.3 es un pago real** de punta a punta en local.
- [Probable] Stripe Payment Element (web) y PaymentSheet (app) no se pueden probar en los tests automáticos más allá de simularlos.
- [Adivinando] Esfuerzo: 1,5–2,5 semanas (la valoración decía 1–2; se agregan los arreglos de §2).

## 5. 3.1 hecha (2026-10-28) — qué cambió de verdad

**Alcance:** son arreglos de bugs, **no** van detrás del interruptor del asistente: aplican a la v1 y a la v2 (web y app), porque el camino de cobro es el mismo.

| Bug | Web | App | Servidor |
| --- | --- | --- | --- |
| B10 | `EventDetail.validatePromoterCode` → `GET /api/promoter-validate` (ya no lee `promoter_links` desde el navegador; se quitó el import de Supabase del componente) | `useCheckout.validatePromoter` → `apiGetPublic("/api/promoter-validate…")` (nuevo `apiGetPublic` en `lib/api.ts`: el enlace del promotor puede abrirse sin sesión) | sin cambios (el endpoint ya existía) |
| B2 | Estado nuevo `"error"`. Continuar (v1 y hoja v2) deshabilitado mientras `"validating"`; `handlePurchaseClick` también lo frena. Error → "No pudimos validar el código (puedes comprar igual) · Reintentar" (v2 i18n; v1 en inglés) | Igual: `checkout()` no hace nada mientras `"validating"`; botón de pagar deshabilitado ("Checking promoter code…"); `"error"` con Retry; un código de enlace inválido ahora se ve como inválido en la hoja | — |
| B3 | `StripePaymentForm`: tras `elements.submit()` y antes de `confirmPayment`, `POST /api/holds/start-payment {hold_id, payment_intent_id}` (`StripePurchaseFlow` le pasa el id). Si falla, no se confirma (no hay cobro) y se muestra el motivo. RSVP no lo usa (no hay hold) | `useCheckout`: después de `holds/validate` y antes de abrir el PaymentSheet. Si falla, no se abre y la reserva se libera (catch de siempre) | **Nuevo** `POST /api/holds/start-payment`: dueño, no vencida, sin pedido → `mark_hold_payment_started(hold, "stripe:<pi>", 10)`. |
| B4 | Error `PAYMENT_IN_PROGRESS` → mensaje i18n en la hoja v2 (se reabre) | Mensaje del servidor en la hoja | `holds/create`: antes del RPC, si el usuario tiene un hold de ese tier sin pedido, `payment_in_progress = true` y empezado hace < 20 min → **409** `PAYMENT_IN_PROGRESS`. Si esa consulta falla, sigue como antes (no bloquea comprar) |

**Decisiones de implementación (para revisar):**
- [Seguro] **Tope contra abuso en start-payment** (no estaba en el análisis): sin él, llamar el endpoint en bucle alargaría la reserva +10 min cada vez y retendría inventario sin límite. Ahora: una segunda llamada dentro de 10 min no alarga (reintento tras tarjeta rechazada, doble toque) y una reserva con más de 60 min de vida no se alarga más (paga con lo que le queda).
- [Seguro] El id del PaymentIntent se guarda como `stripe:pi_…` en `datafast_checkout_id` (la única columna que la función escribe). `datafast/verify-payment` busca por igualdad con el id de Datafast, así que nunca coincide. Sin migración.
- [Seguro] Verificado en la base (`baseline.sql`): `cleanup_expired_holds` respeta 15 min de gracia desde `payment_started_at`; `cleanup_abandoned_payments` quita la marca a los 20 min; el webhook no mira `expires_at`. Con la marca, la fila existe cuando llega el webhook.
- [Probable] **Riesgo residual B4:** ventana mínima entre la consulta y el RPC (dos pestañas exactamente a la vez). Cerrarla exige cambiar el RPC (migración); no se hizo.
- [Probable] **Riesgo residual B3:** si el pago se queda >15 min dentro de Stripe (3DS muy lento) y otra compra dispara la limpieza, vuelve el caso viejo. Muy raro.
- **B11 sigue abierto:** la política anon de `promoter_links` se quita en la salida (fase 5), cuando las versiones viejas de la app ya no consulten directo.

**Tests:** web `holds-payment` 9 (start-payment: marca y alarga, sesión/cuerpo/dueño, vencida/usada, no re-alarga en 10 min, tope de 60 min, respuesta de la base; create: 409 con pago en curso, reemplaza la abandonada, no bloquea por otro usuario); `StripePaymentStart` 2 (orden validate → submit → start-payment → confirm; si falla no confirma); `EventCheckout` +1 (B2 web: espera, error con Reintentar, no bloquea) y los existentes migrados a `/api/promoter-validate`. App `CheckoutFixes` 4 (B10, B2, B3 orden, B3 fallo libera la reserva). Totales: web 918 ✓ (13 ✗ heredados: 6 `create-payment-intent`, 7 `purchase-page.integration` — fallan igual con los archivos de `HEAD` —, y `payment-protection` necesita Supabase real); app 167/167; lib 399/399; tsc web 0, lib 0, app 40 (heredados).

**No verificado:** un pago real de punta a punta (ver `PruebasReales/FASE_3_PAGOS.md`).

### 5.1 Ronda de Kevin (10-28 tarde)
- **Caso real "se perdieron 3 entradas" (RSVP pagada):** no era un bug: `stripe listen` estaba cerrado, el webhook `payment_intent.succeeded` nunca llegó al servidor local y la RSVP quedó "Aprobada" con el cobro capturado. Se recuperó reenviando el evento (`stripe events resend evt_…`). **Riesgo de producto anotado para la 3.4:** nada detecta una RSVP aprobada con pago capturado y sin pedido si el webhook falla más allá de los reintentos de Stripe (3 días) → propuesta: cron de conciliación.
- **B10 visible:** etiqueta del promotor en la página del evento (web `EventDetail`, app `PromoterChip`) antes del checkout: verde / comprobando / no válido / no se pudo comprobar · Reintentar.
- **Abrir en la app:** aviso en la web de teléfonos (`OpenInApp`): Android con `intent://…;package=com.projectflame.app;S.browser_fallback_url=…` (Chrome abre la app si está instalada, si no vuelve con `noapp=1` y se avisa); iOS con `project-flame://` y aviso si la página sigue visible. Lleva el `?promoter=`. iOS ya tenía enlaces universales; **Android App Links pendiente** (huella del certificado).
- **B7 adelantado en la web:** reloj de la reserva en `/purchase` (`HoldTimer`, regla `holdCountdown` en lib): aviso a 5 min, bloqueo de Pagar a 0 con "Volver a elegir", y sigue el alargue de B3 (`start-payment` devuelve el nuevo vencimiento). `holds/details` ahora devuelve `expires_at`. En la app llega con la pantalla de pago (3.3).
- Tests: lib 400; web 923 ✓ (+4 `EventPromoterAndApp`, +2 `EventCheckout`; 13 ✗ heredados); app 168 (+1 `PromoterChip`); tsc web 0, lib 0, app 40.

## 6. 3.2 + 3.3 hechas (2026-10-28) — pantalla de pago nueva

**Decisiones de Kevin (10-28):** (1) la 3.2 se une a la 3.3: la cantidad y "Ir al pago" ya están en la tarjeta del tier, así que no hay hoja intermedia; "Ir al pago" **reserva y abre la pantalla de pago**. (2) Los **datos por ticket** (formulario del organizador para compras pagadas) **quedan fuera** de esta entrega: hoy las compras pagadas no los guardan; necesitan migración (respuestas en la reserva y en cada ticket) + webhook → entrega aparte.

**Flujo nuevo (tickets, no RSVP):** tarjeta → −/+ → **Ir al pago** (o "Continuar al pago" en la barra) → `POST /api/holds/create` (con el promotor del enlace si es válido) → pantalla de pago:
- reloj de la reserva (B7) con aviso a 5 min y bloqueo de Pagar a 0 ("Tu reserva venció · Volver a elegir"); sigue el alargue de B3;
- evento (flyer, fecha, lugar), **pedido** (cantidad × tier, código de acceso ✓, promotor ✓);
- **promotor**: si la reserva no trae uno, un campo para agregarlo: se valida con `/api/promoter-validate` y el PaymentIntent se **re-crea llevándolo** (el webhook toma el promotor de la metadata del PI; el servidor da prioridad al de la reserva). Pagar espera mientras se valida (B2);
- **descuento** (lógica de siempre, re-crea el PI), **desglose** (tickets, descuento, comisión de servicio con ⓘ, total) y "Precio final…";
- **Pagar $X**: web = formulario de Stripe (validate → start-payment → confirm); app = `validate` → `start-payment` → PaymentSheet nativo. Gratis → "Obtener ticket gratis" (`complete-hold-free`, con el promotor escrito si lo hay).
- **Éxito:** web `/purchase/success` v2 "You're in" con Ver tickets / Compartir / Listo. **B5:** sigue buscando el pedido ~2 min con espera creciente y desde los 10 s dice "Pago recibido · tus tickets se están preparando" con "Ir a mis tickets"; **nunca** muestra error por un webhook lento. App: "You're in" honesto (los tickets los crea el webhook) con Ver tickets / Listo.
- **Volver** (app) libera la reserva (`holds/cancel`); cerrar la hoja de Stripe **no** la libera (se puede reintentar mientras el reloj corre).

**Dónde vive:** web `/purchase` y `/purchase/success` se sirven en v2 por la reescritura de URL (misma URL; `ATTENDEE_V1=true` vuelve a la v1). La lógica es la de `StripePurchaseFlow` (misma función, prop `v2`, vista `v2/attendee/purchase/PaymentV2.tsx`); `holds/details` ahora devuelve `expires_at`, `timezone` y `currency` del evento. App: ruta nueva `app/checkout/[holdId].tsx` → `PaymentScreen` + `hooks/usePaymentScreen.ts` (mismas llamadas que la web). La isla de pestañas se oculta en `/checkout/`.

**Qué NO cambió:** endpoints de cobro, webhook, metadata, comisiones. RSVP sigue con su hoja (web `CheckoutSheet`, app `CheckoutMainSheet`) hasta la 3.4. La v1 (`ATTENDEE_V1` / `EXPO_PUBLIC_ATTENDEE_V1`) intacta.

**Riesgos / pendientes:**
- [Probable] Si el comprador cierra la hoja de Stripe (app) **después** de tocar Pagar, la reserva queda marcada "pago en curso" hasta 20 min: si vuelve al evento sin usar "Volver" e intenta reservar el mismo tier, recibe "Ya tienes un pago en curso". "Volver" en la pantalla de pago libera la reserva y lo evita.
- [Seguro] El botón atrás de Android (hardware) no libera la reserva (vence sola a los 30 min). Se puede agregar si molesta.
- [Seguro] Gratis sin enlace: el promotor se puede escribir en la pantalla de pago (también para gratis).
- Datos por ticket: entrega aparte (migración).

**Tests:** web `PaymentV2` 7 (reloj, pedido, desglose, Pagar $X; promotor escrito → validado y PI re-creado; promotor de la reserva + descuento; reserva vencida bloquea; B5 espera creciente, mensaje honesto a los 10 s, "You're in" cuando llega el pedido, nunca error a los 2 min), `EventCheckout` reescrito (Ir al pago reserva directo con cantidad y promotor; RSVP mantiene su hoja; B2 bloquea reservar mientras valida), `attendee-lib` +1 (reescrituras `/purchase`). App `PaymentScreen` 6 (orden validate → start-payment → PaymentSheet; cerrar Stripe no libera; promotor escrito + descuento; gratis; vista; isla oculta). Totales: web 931 ✓ (13 ✗ heredados); app 174/174; lib 400/400; tsc web 0, lib 0, app 40 heredados.
