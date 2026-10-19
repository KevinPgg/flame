# Sesión 2026-07-08 — Visor de levantamiento técnico en /Levantamiento/

## Qué se construyó
Visor HTML+CSS+JS de **solo lectura** en `Levantamiento/` para revisar todo el proyecto:

- **Explorador**: árbol de archivos real del repo (índice generado, node_modules/.git excluidos) con búsqueda, visor con highlight.js (CDN, degrada a texto plano) y numeración de líneas. Lee los archivos reales vía fetch — no copia nada.
- **Flujos**: 10 flujos trazados función humana ↔ API ↔ código (auth Clerk↔Supabase, crear evento, compra Stripe camino crítico, RSVP, check-in QR, payouts Connect, promos, notificaciones/crons, admin orgs, Datafast legacy). Toggle para trazar hacia atrás. Archivos clicables que abren en el explorador.
- **Integraciones**: 14 tarjetas (Clerk, Supabase, Stripe/Connect, Datafast legacy, Vercel, Expo/EAS, Brevo+Postmark, Expo Push, Sentry, Tailwind, Turborepo/pnpm, TanStack, Zod, otros) con env vars, versiones y archivos de config.
- **Riesgos (semáforo)**: R1–R12 desde `docs/actual/ESTADO_ACTUAL_2026-07-07.md` §5 y `docs/historico/security/`. Rojo: paridad iOS→web. Verdes: camino de pago, seguridad QR/Storage, packages/lib.
- **Mejoras**: M1–M11 desde EstadoActual §7 + backlogs de `docs/historico/todos/`.

## Decisiones (acordadas con Kevin)
- **Acceso live, no snapshot**: los archivos se consultan reales vía HTTP; lo único generado es `data/files-index.json` + 4 JSON curados de análisis (foto del 2026-07-08).
- **Alcance completo**: web + mobile + supabase.
- Servidor propio dependency-free (`tools/server.mjs`, GET-only, anti path-traversal, puerto 8077) porque file:// bloquea fetch. `serve.bat` regenera índice + sirve + abre navegador.

## Cómo se usa / mantiene
- Doble clic en `Levantamiento/serve.bat` → `http://localhost:8077/Levantamiento/`.
- Archivos nuevos: regenerar índice con `node Levantamiento/tools/build-index.mjs`.
- Los JSON de análisis (`flows/integrations/risks/improvements.json`) son foto del 2026-07-08; actualizar cuando cambie el estado real.

## Verificado
Servidor 200 en visor/JSONs/archivos (incl. rutas con `[id]`), path traversal 404, POST 405, sintaxis JS ok, y **todos los paths referenciados en los 4 JSON existen en el repo**.

## Contexto útil para próximas sesiones
- Fuente de verdad del estado del proyecto: `docs/actual/` (2026-07-07 general, 2026-07-08 mobile).
- Datafast está marcado `@legacy` en el propio código; Stripe es el gateway oficial.
- Sigue pendiente de la sesión anterior: secretos de producción en `flame-envs.mdf` (ver `docs/sesiones/2026-07-07-dev-environment-setup.md`).
