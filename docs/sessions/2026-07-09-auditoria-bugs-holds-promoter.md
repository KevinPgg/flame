# Sesión 2026-07-09 — Auditoría de bugs: holds, promoter, checkout

Candidatos a bug encontrados leyendo el código real (pendientes de confirmación por Kevin). Numerados para referencia.

## Confirmados por lectura de código [Seguro]

**B1 — El campo de promoter en /purchase (web) está desconectado del checkout.**
`StripePurchaseFlow.tsx`: el input valida contra `/api/promoter-validate` y muestra "válido", pero `promoterInput` **nunca se envía al servidor**. Todas las llamadas a `create-payment-intent` (líneas ~205, ~295, ~360) mandan `details.promoter_code` (congelado del hold). Consecuencias: (a) agregar un código en /purchase no atribuye la venta; (b) "Clear promoter" es cosmético — el server prioriza `hold.promoter_code` (`complete-hold` L168, `create-payment-intent` L420), la venta sigue atribuida al promotor del hold.

**B2 — Carrera de validación del promoter en la página del evento.**
`EventDetail.tsx` L154-219, L745: con `?promoter=X` el estado inicia "validating" (async); `effectivePromoterCode` solo cuenta con status "valid" y el botón de compra NO se bloquea durante la validación. Click rápido → hold sin promoter → atribución perdida en silencio. Si la query falla (RLS anon a `promoter_links`, red), status → "idle" y el código se descarta sin aviso.

**B3 — El webhook no verifica `expires_at` del hold.**
`webhooks/stripe/route.ts`: `createOrderAndTicketsFromHold` emite tickets de un hold expirado si la fila aún existe; que exista depende de si otro usuario disparó `cleanup_expired_holds` (se ejecuta en cada `holds/create`). Resultado no determinista: a veces tickets de hold vencido, a veces ghost order + refund. `increment_tier_quantity_sold` sí tiene tope de capacidad (OVERFLOW) → no hay oversell real, pero produce "pago capturado + createOrder falla" → manual review.

**B4 — Crear un hold cancela el hold activo previo del mismo usuario en el mismo tier.**
RPC `20260414222258` L~110. Dos pestañas/dispositivos: la 2ª mata el hold de la 1ª; pagar en la 1ª → webhook no encuentra hold → ghost order + reembolso automático. Usuario cobrado y reembolsado sin tickets ni explicación.

**B5 — La página de éxito web se rinde a los ~13s.**
`purchase/success/page.tsx`: 5 reintentos con backoff a `/api/orders/{pi}`; el ticket lo crea el webhook. Webhook lento (cold start / retry Stripe) → usuario que pagó ve error. Mobile muestra "being prepared" (honesto).

**B6 — `/api/purchase/complete-hold` es código muerto.**
Ningún cliente lo llama (web depende del webhook; mobile solo usa `complete-hold-free`). Su lógica diverge del webhook (él sí valida expiración). Nota: el flows.json del Levantamiento lo tenía como paso del flujo — corregir.

## Probables [Probable]

**B7 — Sin countdown del hold en web.** Hold de 30 min, ningún timer en /purchase. El pre-flight `holds/validate` en `StripePaymentForm` evita pagar con hold vencido, pero el usuario lo descubre al fallar el submit.

**B8 — Promo codes: carrera en usage_limit.** Validación al inicio (`validate-promo-code`), incremento post-pago (`orders.ts` L617+). Dos compradores simultáneos con el último uso pasan ambos; el constraint DB `usage_count <= usage_limit` hace fallar el 2º incremento DESPUÉS de cobrar.

**B9 — RSVP pago (mobile): autorización huérfana + sin reserva de inventario.** `useCheckout` autoriza la tarjeta (manual capture) ANTES de enviar el RSVP; si `POST /api/rsvp` falla, la retención queda sin RSVP hasta el cron (cada 6h). Además el flujo RSVP no crea hold — [Adivinando] si `approve` no re-verifica disponibilidad, se puede sobrevender al aprobar.

**B10 — Doble camino de validación de promoter.** EventDetail consulta supabase directo desde el browser (depende de RLS anon en `promoter_links`); StripePurchaseFlow usa `/api/promoter-validate`. Si RLS no permite el select anon, la atribución por URL en web muere siempre (por B2 el hold nunca recibe el código).

## Verificado como correcto (no son bugs)
- `per_user_limit` acumulativo (cuenta orders previos y cancela holds propios) — RPC abril 2026.
- Check-in QR atómico (`.is("checked_in_at", null)`).
- Ghost orders + refund automático para PI huérfanos / metadata inválida.
- Web sí valida hold pre-pago (`StripePaymentForm` L66-90); mobile igual antes del PaymentSheet.

## Estado
Pendiente: Kevin confirma/descarta B1-B10. Tras confirmación → actualizar `Levantamiento/data/risks.json` y corregir flows.json (B6).
