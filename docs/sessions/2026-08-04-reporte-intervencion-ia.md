# Sesión 2026-08-04 — Reporte de intervención de IA (evidencia .cursor + docs)

## Qué se hizo
Análisis basado en evidencia real (no en las carpetas creadas por la asesoría: EstadoActual,
arquitectura) para estimar el grado de intervención de IA en el proyecto. Entregado como
**Word**: `docs/reportes/Reporte_Intervencion_IA_Flame.docx` (guardado local, sin present_files).

## Evidencia clave recogida
- **`.cursor/rules/`** (idéntico en working copy y `Flme_comp`): 3 `.mdc`, 1.165 líneas.
  `project-flame-master.mdc` (545 líneas, `alwaysApply: true`, `globs **/*`) = manual operativo
  de agente IA: migración 8 semanas a monorepo Turborepo + Expo iOS + Stripe, metodología por
  fases 1–7, Completion/Web Parity Gate, triage de comentarios, Sección 10 auth "DO NOT BREAK".
- **Revisión IA automatizada (Cursor BugBot)**: `BUGBOT_FIX_ROUTER.md`, `HYBRID_ROUTER_SOLUTION.md`
  (8 menciones), "automated PR review", prompt verify-first.
- **Docs generadas con IA**: 143 archivos (excl. nuestras carpetas), 54.291 líneas.
  Changelogs mensuales: ~691 fixes numerados ene–jul 2026 (Feb 290, Mar 186, Abr 153, May 28,
  Jun 16, Jul 11, Ene 7). Pico Feb–Mar = fase intensiva de migración.
- **Sesiones jul-2026** = IA en depuración/operación (holds/promoter, build Android, JWT Clerk).

## Sección crítica (servicios sensibles) — densidad de menciones
Supabase 66 · Datafast 58 · Stripe 51 · Clerk 34 · webhooks 26 · Brevo 10.
Riesgo concentrado donde la IA fue más activa:
- **Pagos** (Stripe Connect + Datafast legacy): clase de bug precios "$25→$23,14"
  (`extractBasePriceHistorical`) → **5 fixes** (Feb #2173, Mar #298, Abr #151, Abr #441, May #2).
- **Auth** (Clerk/Supabase JWT): webhook silencioso `user.created` (CLERK_WEBHOOK_SYNC_FAILURE_FIX,
  28-oct-2025, HTTP 406, service_role_key); JWT template ausente (jul-2026).
- **BD** (Supabase/RLS): RPC `get_event_with_tiers` con `to_jsonb(tt)` exponía `secret_code`.
- **Integraciones**: Brevo (EMAIL_DELIVERABILITY, EMAIL_520_ERROR_GUIDE); webhooks = riesgo transversal.

## Conclusión (se mantiene)
Sin git no hay % de líneas defendible. La IA fue el **método de desarrollo primario** (verificable
en artefactos), penetración muy alta, autonomía moderada (dirección humana real). Rango de baja
confianza: 70–90% de líneas pasaron por IA. Recomendado: recuperar git del repo original;
auditoría dirigida de los 4 dominios sensibles; tests sobre clases de bug reincidentes.

## Para retomar en un chat nuevo
"Lee `docs/sessions/README.md` y esta sesión (2026-08-04). El reporte está en
`docs/reportes/Reporte_Intervencion_IA_Flame.docx`. Si Kevin quiere un número real: git del repo
original o auditoría de calidad."
