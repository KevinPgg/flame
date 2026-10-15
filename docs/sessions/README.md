# Índice de sesiones

Para retomar en un chat nuevo: leer `docs/EstadoActual/ESTADO_ACTUAL.md` (estado + divergencias
vs baseline `Flme_comp/`) y la última sesión de esta lista. Arquitectura de producción:
`docs/arquitectura/ARQUITECTURA.md`.

## Convención de commits (desde 2026-10-12)

Claude **no** hace commits: al final de cada entrega deja el comando listo y Kevin lo ejecuta.

- Formato: `tipo(alcance): resumen breve en español` — tipos: `feat`, `fix`, `test`, `docs`, `chore`, `refactor`. Alcances habituales: `db`, `lib`, `web-v2`, `mobile`, `docs`.
- Un commit por cambio lógico (p. ej. un fix de base de datos separado de pantallas nuevas), para poder revertir uno sin arrastrar el otro.
- `git add` con rutas explícitas en vez de `git add .`, para no meter por accidente archivos locales o de prueba.
- Rama de trabajo: `master` (copia de desarrollo, fuera del git de producción).

| Sesión | Tema | Estado |
| --- | --- | --- |
| [2026-07-07-dev-environment-setup.md](2026-07-07-dev-environment-setup.md) | Setup entorno local: Supabase + seed prod anonimizado, Clerk test + ngrok, registro de cambios de código de esa sesión (next.config, StripePaymentForm, seed, config Stripe test) | Entorno operativo |
| [2026-07-08-levantamiento-visor.md](2026-07-08-levantamiento-visor.md) | Visor HTML de levantamiento técnico en `Levantamiento/` (explorador, flujos, integraciones, riesgos) | Operativo; JSONs son foto del 07-08 |
| [2026-07-09-analisis-stripe-holds-promotor-bug.md](2026-07-09-analisis-stripe-holds-promotor-bug.md) | Los dos "holds" (inventario 30 min vs autorización de tarjeta), trace compra directa y RSVP, **bug de promoter confirmado por código** | Diagnóstico completo; fix no implementado |
| [2026-07-09-auditoria-bugs-holds-promoter.md](2026-07-09-auditoria-bugs-holds-promoter.md) | Auditoría B1–B10 de holds/promoter/checkout | B1–B6 confirmados por código; B7–B10 probables; falta confirmación de Kevin |
| [2026-07-13-android-eas-build-troubleshooting.md](2026-07-13-android-eas-build-troubleshooting.md) | Primer intento build Android vía EAS (proyecto EAS propio, perfil `development-staging`) | Superada por la sesión del 07-15 (EAS descartado) |
| [2026-07-15-android-build-local-resuelto-debug-js.md](2026-07-15-android-build-local-resuelto-debug-js.md) | Build local Android RESUELTO (adb, MAX_PATH→hoisted, JDK 17 pin). Gotchas Windows/pnpm/Gradle | App conecta a Metro; quedó bug React duplicado (fix indicado, sin confirmar) |
| [2026-07-15-docs-reorg-y-bug-jwt-clerk.md](2026-07-15-docs-reorg-y-bug-jwt-clerk.md) | Consolidación de docs contra baseline `Flme_comp/` + diagnóstico bug JWT template Clerk/Supabase en mobile | Docs consolidados; fix del bug entregado en chat, pendiente de aplicar |
| [2026-07-21-analisis-porcentaje-ia.md](2026-07-21-analisis-porcentaje-ia.md) | ¿% de IA usado en el repo? Sin git no es medible; señales (`.cursor/rules`, ~148k líneas) → estimación baja-confianza 70–90%. Prueba del mecanismo de memoria del proyecto | Conclusión metodológica; Kevin decide git-attribution vs auditoría de calidad |
| [2026-08-04-reporte-intervencion-ia.md](2026-08-04-reporte-intervencion-ia.md) | Reporte Word de intervención de IA por evidencia (.cursor + docs, ~691 fixes, BugBot); sección crítica pagos/auth/BD/integraciones. Entregable: `docs/reportes/Reporte_Intervencion_IA_Flame.docx` | Reporte entregado (local); pendiente decisión Kevin sobre auditoría dirigida |
| [2026-10-08-valoracion-flame-2.0.md](2026-10-08-valoracion-flame-2.0.md) | Valoración del prototipo `flame-2.0/` (rediseño): impacto por cambio, plan en 6 fases, decisiones D1–D4. Doc: `docs/features/FLAME_2_0_VALORACION.md` | Fase 0 hecha · fix sold-out + RPC holds · **fase 1**: `/v2/organizer` (dashboard) y detalle de evento v2 con 6 pestañas; falta Enviar tickets y RSVPs |
