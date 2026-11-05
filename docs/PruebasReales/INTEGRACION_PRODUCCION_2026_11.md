# Pruebas reales · Integración de cambios de producción (2026-11-05)

Rama `integracion/prod-2026-11`. `[ ]` = falta. Dispositivos: 💻 PC (navegador) · 🌐📱 navegador del celular · 📱 app.

## 0. Preparación
1. **Migraciones** (BD local):
   - Si tu BD local ya tenía la `20261008180000`: `supabase migration up --include-all` (aplica las 5 de producción, que tienen fecha anterior, y la nueva `20261105120000`).
   - Alternativa limpia: `supabase db reset` (borra datos locales).
   - Comprobar en Studio (`http://127.0.0.1:54323` → SQL):
     - `select column_name from information_schema.columns where table_name='ticket_tiers' and column_name='sold_out_changed_at';` → 1 fila.
     - `select oid::regprocedure from pg_proc where proname='create_rsvp_atomic';` → **solo 1** (la de 9 args).
     - `select has_function_privilege('anon','atomic_create_hold_with_stage_validation(uuid,uuid,uuid,integer,uuid,integer,character varying)','execute');` → `false`.
2. `pnpm install` no hace falta (no hay dependencias nuevas). Reinicia `pnpm dev` y Metro (`npx expo start -c`).
3. `stripe listen --forward-to localhost:3000/api/webhooks/stripe` en otra terminal.

## 1. Sold out manual en el servidor
- [ ] 💻 Organizador v2 → evento → Tiers → marcar un tier pagado como **Sold out**. En Studio, `ticket_tiers.sold_out_changed_at` queda con la hora actual (UTC); al desmarcarlo vuelve a `NULL`.
- [ ] 💻 Con el tier en sold out, abrir el evento en otra pestaña que ya lo tenía cargado (antes de marcarlo) e intentar **Ir al pago** → error "sold out", no se crea fila en `holds`.
- [ ] 📱 Igual en la app (pantalla de evento abierta antes de marcar el sold out).
- [ ] 💻 Tier RSVP en sold out → enviar solicitud → mensaje "sold out" (sin barras `\"` en el texto) y no se crea fila en `rsvps`.
- [ ] 💻 Tier RSVP con etapas casi agotado (pide más de lo disponible) → mensaje con precio tipo **$30.00**, no `$30.0000000000000000`.
- [ ] 💻 Una reserva creada **antes** de marcar el sold out se puede pagar hasta que vence (comportamiento esperado de producción).

## 2. RSVP pagado: duplicado y aprobación
- [ ] 📱 Enviar una RSVP pagada; reenviar la misma (doble toque o reintento) → aviso de "ya tienes una solicitud" y **la primera sigue autorizada** (Stripe Dashboard test → el PaymentIntent sigue en *requires_capture*, no *canceled*).
- [ ] 📱 Organizador en la app → RSVPs → **Aprobar** → aprueba sin "timeout" (ahora espera hasta 75 s).
- [ ] 💻 Subir el precio del tier **después** de que el asistente autorizó y antes de aprobar → la aprobación funciona (valida contra el precio cotizado) y el pago no se cancela.

## 3. Moneda de la orden
- [ ] 💻 Compra en un evento en **MXN** o **EUR** (tarjeta `4242…`) → en Studio `orders.currency` = `MXN`/`EUR` (antes quedaba `USD`). Igual en un RSVP pagado aprobado y en un ticket gratis.
- [ ] 💻 El correo de confirmación muestra la misma moneda que la orden.

## 4. Stripe Connect: "Mi país no está en la lista"
- [ ] 💻 Organizador v2 → Pagos (organización sin Stripe) → el selector de país tiene al final **Mi país no está en la lista** → Conectar abre Stripe y Stripe pide el país.
- [ ] 📱 Igual en la app → Manage → Pagos.
- [ ] 💻 Elegir un país de la lista sigue funcionando como antes.

## 5. Crear evento v1 en la app (cambios de producción)
- [ ] 📱 Crear evento (v1) en EUR → el campo de precio dice la moneda del evento (no "USD"); escribir el precio y tocar **Crear** sin salir del campo → el tier se guarda con ese precio (no 0).

## 6. Página del organizador (asistente) con flyers grandes
- [ ] 📱 App → tocar un organizador (desde un evento o Inicio) → Próximos: tarjetas grandes como en Inicio (organizador arriba, flyer 4:5 con título, fecha y precio, corazón y compartir); Pasados igual que antes.
- [ ] 🌐📱 Web en el celular → `/organizer/<slug>` → una tarjeta grande por fila.
- [ ] 💻 Web en PC → dos tarjetas grandes por fila; Pasados máximo 3 por fila.
- [ ] 💻 Compartir de una tarjeta → copia `…/events/<slug>` y aparece "copiado" abajo (o hoja nativa en el celular).
