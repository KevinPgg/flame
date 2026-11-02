# Sesión 2026-10-31 — roles admin, IPs de desarrollo, comisiones Stripe y red

## 1. Elevar un usuario a admin
- Auth es **Clerk**, no Supabase Auth. El usuario se identifica por `users.clerk_id` y el claim `sub` del JWT; el rol se cambia en `public.users`, no en Authentication.
- `users.role = 'admin'` es **admin de plataforma** y casi no se usa (p. ej. `event_scanners`, `order_errors`). Lo que gobierna la app es `organization_members.role` (`owner`/`admin`/`organizer`).
- `useUserRole` (mobile) ignora `users.role` para la vista: exige **fila en `organization_members` con rol de hosting + `organizations.approved = true`**. Caché de 5 min (`staleTime`).
- Para un admin completo: (1) `update users set role='admin'`, (2) fila en `organization_members`, (3) organización aprobada.
- Bug latente: la política "Admins can manage order errors" compara `users.id = auth.uid()`, que con Clerk no coincide.
- Los proyectos Supabase conectados por MCP (`NE-db`, `Sapo`) NO son la BD de Flme.

## 2. IPs de desarrollo / `.env`
- `.env` no admite listas con coma; para cambiar de red: comentar/descomentar líneas o usar `.env.<red>` copiado a `.env.local`.
- `EXPO_PUBLIC_*` se incrustan al compilar: reiniciar con `npx expo start -c`.
- Las **URLs de storage se guardan completas en BD** (`events.image_url` con la IP vieja). Al cambiar de IP hay que reescribirlas con `replace(...)`. Mejora propuesta: guardar solo la ruta del objeto y construir la URL al leer.
- Web `.env` usa `192.168.100.57`; `192.168.2.63` quedó comentada.

## 3. Importes de pago (Stripe)
- Fórmula: `total = base_con_descuento + base×%/100 + fijo` (`packages/lib/src/stripe/fees.ts`, `calculateFee`), usada en `apps/web/app/api/purchase/create-payment-intent/route.ts`.
- Defaults: 10 % + fijo por moneda (USD 99¢, EUR 99¢, GBP 75¢, **MXN 1800**, DOP 6000, COP 420000). Sobrescribible por evento con `events.markup_percent` / `markup_fixed_cents`.
- Modelo: *destination charges* sin `on_behalf_of`; `transfer_data.amount` = base con descuento (Guaranteed Net); sin `application_fee_amount`. Flame es comerciante registrado y paga la comisión de Stripe.
- Moneda = la del evento/tier (no USDT). Stripe convierte a USD la liquidación de la plataforma; la transferencia al organizador va en su moneda.
- Caso analizado: ticket MX$12, descuento 25 % → base 9.00 + 0.90 + 18.00 fijo = **MX$27.90** (no son impuestos). Transferencia al organizador MX$9.00.
- **Riesgo/decisión pendiente:** el fijo no se descuenta y en tickets baratos supera el precio del ticket. Propuestas: precio mínimo por moneda o tope `min(fijo, X % de la base)`; revisar qué `markup_*` tienen los eventos reales.

## 4. App mobile sin datos en red nueva
- Síntoma: UI carga, listas vacías, `TypeError: Network request failed`, sin peticiones en la API.
- Causa: Windows clasificó la red nueva como **Pública** y bloqueó los puertos 3000/54321 (Metro 8081 sí respondía). Solución: `Set-NetConnectionProfile -NetworkCategory Private` (se repite en cada red nueva).
- Builds `debug`/`debugOptimized` ya permiten HTTP (`usesCleartextTraffic`); un build release/EAS no.
