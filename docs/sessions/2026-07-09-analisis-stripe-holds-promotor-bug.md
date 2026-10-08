# Sesión 2026-07-09 — Flujo de compra Stripe (hold/RSVP) + bug confirmado de código promotor

## Contexto
Continuación del análisis de código del proyecto (ver `2026-07-08-levantamiento-visor.md`). Esta sesión se enfocó en:
1. Entender el "hold" y su expiración (dos conceptos distintos, no confundir).
2. Trazar el flujo completo de compra directa (order vía hold) y el flujo RSVP (auth & manual capture).
3. Validar contra código una hipótesis de bug reportada por Kevin sobre el código promotor en el flujo de hold.

No se editó código en esta sesión — solo lectura/documentación.

---

## 1. Los dos "hold" del sistema (no confundir)

| | Hold de inventario (`holds` table) | Autorización de tarjeta Stripe |
|---|---|---|
| Duración | **30 min fijos**, hardcodeado (`apps/web/app/api/holds/create/route.ts:240` → `p_expires_minutes: 30`; default también 30 en `atomic_create_hold_with_stage_validation` SQL) | Depende de la red de la tarjeta (Visa ~5 días, otras ~7 días) vía `charge.capture_before` |
| Aplica a | Reserva de cupo/inventario (ambos flujos: compra directa y RSVP) | Solo al flujo **RSVP** (`capture_method: "manual"`) |
| Extensión | No existe — no hay endpoint de renovación | N/A |
| Limpieza | `cleanup_expired_holds()` (SQL), lazy, invocada al crear un hold nuevo o al consultar disponibilidad. Gracia de 15 min si `payment_in_progress = TRUE` | Cron `apps/web/app/api/cron/monitor-payment-authorizations/route.ts`, corre cada 6h. Notifica al organizador 48h antes de expirar; auto-cancela el PaymentIntent 12h antes del límite real |
| Validación en pago | `create-payment-intent/route.ts:366-371` — si `hold.expires_at < now` → 400 "Hold has expired" | `paymentIntent.status === "requires_capture"` + `capture_before` |

No hay ningún punto del código donde ambos mecanismos se sincronicen — son independientes.

---

## 2. Flujo de compra directa (hold → order, captura automática)

1. **Selección de tickets** (`EventDetail.tsx`): si viene `?promoter=CODE` en la URL, se valida contra `promoter_links` y se guarda en estado local.
2. **Crear hold** — `POST /api/holds/create` → RPC `atomic_create_hold_with_stage_validation(p_expires_minutes=30, p_promoter_code=...)`. Aquí se persiste `holds.promoter_code` **de forma definitiva** (snapshot al momento de creación del hold).
3. **Ventana de pago** (`StripePurchaseFlow.tsx`, `mode: "hold"`) — llama a `POST /api/purchase/create-payment-intent` con `holdId`. El backend:
   - Valida `hold.expires_at` no vencido.
   - `capture_method` automático (NO manual) — se fuerza `isRsvp = false` aunque el body traiga `flow: "rsvp"` por error.
   - Arma `metadata.promoterCode = hold.promoter_code || promoterCode(body) || undefined` (línea 420 de `create-payment-intent/route.ts`).
   - Crea el `PaymentIntent` (destination charge, `transfer_data.destination = org.stripe_account_id`).
4. **Usuario paga** (Stripe Elements) → Stripe dispara `payment_intent.succeeded`.
5. **Webhook** (`apps/web/app/api/webhooks/stripe/route.ts`, `handlePaymentIntentSucceeded` → `createOrderAndTicketsFromHold`):
   - Lee `hold` desde DB por `holdId`.
   - Llama a `createOrder(...)` (`apps/web/app/lib/orders.ts`), que lee `promoterCode` **desde `paymentIntent.metadata`** (no desde la tabla `holds` de nuevo) y lo graba en `orders.promoter_code`.
   - Incrementa inventario, genera tickets/QR, envía email.
   - Borra el `hold` (ya no se necesita).

**Punto clave:** el valor de `orders.promoter_code` queda fijado en el momento en que se crea (o recrea) el `PaymentIntent` — específicamente por la expresión `hold.promoter_code || promoterCode(body) || undefined`. Cualquier cambio posterior en la UI que no dispare una nueva llamada a `create-payment-intent` con un valor distinto es invisible para el backend.

---

## 3. Flujo RSVP (auth & manual capture)

1. `POST /api/rsvp` crea el registro `rsvps` (status `pending`), captura `promoter_code` igual que el hold (snapshot al crear la RSVP).
2. Ventana de pago (`StripePurchaseFlow.tsx`, `mode: "rsvp"`, con `token`) → `create-payment-intent` con `flow: "rsvp"` → `capture_method: "manual"` (autoriza pero no cobra).
3. El organizador aprueba/rechaza desde `apps/web/app/api/organizer/rsvps/[id]/approve|reject`.
   - Aprobar → captura el PaymentIntent → Stripe dispara `payment_intent.succeeded`.
4. Webhook → como no hay `holdId` en metadata, busca la RSVP por `stripe_payment_intent_id` → `createOrderAndTicketsFromRsvp` → mismo `createOrder()`, mismo mecanismo de `promoterCode` vía `paymentIntent.metadata`.
5. Si el organizador no actúa: cron `monitor-payment-authorizations` notifica (48h antes) y auto-cancela (12h antes de expirar la autorización real de la tarjeta), liberando el hold de inventario asociado.

**Conclusión:** ambos flujos (hold y RSVP) comparten exactamente el mismo mecanismo de fijación del `promoter_code` — el bug descrito abajo aplica a los dos, aunque fue reportado sobre el flujo de hold.

---

## 4. Bug confirmado: código promotor en la ventana de Stripe (flujo hold)

### Hipótesis de Kevin
1. Si se incluye el código promotor **antes** de la ventana de pago → se guarda en el hold.
2. Si estaba en el hold y se **quita** en la ventana de Stripe → igual se guarda (persiste el del hold).
3. Si **no** estaba en el hold y se **agrega** en la ventana de Stripe → no se guarda.

### Validación con código — CONFIRMADO, y la causa raíz es más específica de lo esperado

No es un problema de "qué gana, hold o body" en el backend únicamente — el frontend **nunca llega a enviar** el valor editado por el usuario. Cadena completa:

**a) Backend decide el ganador así** (`apps/web/app/api/purchase/create-payment-intent/route.ts:420`):
```ts
promoterCode: hold.promoter_code || promoterCode || undefined,
```
Si `hold.promoter_code` existe (truthy), siempre gana — sin importar qué venga en el body.

**b) El frontend (`StripePurchaseFlow.tsx`) tiene una UI de código promotor editable pero está desconectada del pago:**
- Estado local `promoterInput` / `promoterStatus` (líneas 86-134) con `validatePromoterCode()` (valida contra `/api/promoter-validate`) y `clearPromoter()` (limpia solo el estado local).
- **Las tres llamadas a `create-payment-intent`** (carga inicial línea 221, aplicar promo línea 308, quitar promo línea 373) **hardcodean `promoterCode: purchaseDetails.promoter_code`** — el valor que vino del hold vía `GET /api/holds/details`, **nunca `promoterInput`**.
- Es decir: el input de código promotor que el usuario ve y usa en la ventana de Stripe (con su check verde "válido") es **cosmético**. Escribir, validar o quitar un código ahí no dispara ninguna petición que lo persista.

**c) Consecuencia exacta por escenario:**

| Escenario | `hold.promoter_code` (DB) | Qué pasa en el body enviado | Resultado en `orders.promoter_code` |
|---|---|---|---|
| 1. Código venía por URL antes del hold | `"COD1"` | `promoterCode: hold.promoter_code` (siempre) | `"COD1"` ✅ se guarda — **confirma punto 1** |
| 2. Estaba en el hold, usuario lo "quita" en la ventana de Stripe (`clearPromoter()`) | `"COD1"` (sin cambios en DB) | `promoterCode: purchaseDetails.promoter_code` = `"COD1"` (el clear nunca se envía) | `"COD1"` ✅ persiste igual — **confirma punto 2** |
| 3. No estaba en el hold, usuario lo escribe/valida en la ventana de Stripe | `null` | `promoterCode: purchaseDetails.promoter_code` = `null` (lo tipeado en `promoterInput` nunca se envía) | `null` ❌ no se guarda — **confirma punto 3** |

Los tres puntos de la hipótesis quedan confirmados por lectura directa del código, no por inferencia de comportamiento en runtime.

### Impacto en la vista de organizador / promotores

`GET /api/organizer/promoter-links` (`apps/web/app/api/organizer/promoter-links/route.ts:85-92`) calcula `total_tickets_sold` y `total_revenue_cents` por promotor haciendo `orders.eq("promoter_code", link.promoter_code)`. Como la atribución depende 100% de `orders.promoter_code`, el bug se traduce directamente en:

- **Escenario 2** (código en el hold, "quitado" en Stripe): el promotor recibe crédito por una venta que el comprador creía haber desvinculado de él. Puede inflar las métricas de un promotor y, si hay comisiones atadas a `promoter_links`, generar pagos indebidos.
- **Escenario 3** (código agregado en Stripe, no estaba en el hold): la venta **no cuenta para ningún promotor**, aunque el usuario vio el check verde de "código válido aplicado". El promotor pierde crédito legítimo y el reporte de `promoter-links` subestima su desempeño real.

### Alcance
- Confirmado en el flujo de **hold** (compra directa). Por construcción idéntica (`purchaseDetails.promoter_code` también se usa en `mode: "rsvp"`, líneas 221/308/373 son compartidas por ambos modos del mismo componente), el mismo problema aplica al flujo **RSVP** — no se revisó por separado con el mismo nivel de detalle, pero la ruta de código es la misma función/componente.
- No se tocó ninguna línea de código; esto es solo diagnóstico.

### Dónde estaría el fix (para cuando se decida abordarlo — no implementado)
- Backend: `create-payment-intent/route.ts:420` debería priorizar el valor explícito del request (`promoterCode` del body) sobre `hold.promoter_code`, o bien exponer un endpoint para actualizar `holds.promoter_code` cuando cambie en la ventana de pago.
- Frontend: las 3 llamadas en `StripePurchaseFlow.tsx` deberían enviar `promoterStatus === "valid" ? promoterInput : undefined` en lugar de `purchaseDetails.promoter_code`, y `clearPromoter()` debería disparar una re-creación del PaymentIntent sin promoter (similar a `handleRemovePromoCode`).

---

## Archivos clave referenciados
- `apps/web/app/api/holds/create/route.ts`
- `apps/web/app/api/purchase/create-payment-intent/route.ts`
- `apps/web/app/api/webhooks/stripe/route.ts`
- `apps/web/app/lib/orders.ts`
- `apps/web/app/components/StripePurchaseFlow.tsx`
- `apps/web/app/components/EventDetail.tsx`
- `apps/web/app/api/organizer/promoter-links/route.ts`
- `apps/web/app/api/cron/monitor-payment-authorizations/route.ts`
- `apps/web/app/lib/stripe/constants.ts`
- `supabase/migrations/20260414222258_revert_hold_rpc_jwt_assertion.sql`
- `supabase/migrations/20260128000000_baseline.sql` (`cleanup_expired_holds`)

## Pendiente para próxima sesión
- Confirmar si el mismo bug de promotor aplica igual en el flujo RSVP con un trace dedicado (`token` en vez de `session`).
- Decidir si el fix se hace en backend (prioridad de request), frontend (conectar `promoterInput` al request), o ambos.
