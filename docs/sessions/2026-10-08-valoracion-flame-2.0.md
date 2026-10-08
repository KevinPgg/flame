# 2026-10-08 — Valoración Flame 2.0

**Qué se hizo:** análisis de la carpeta `flame-2.0/` (prototipo HTML del rediseño, datos mock) contra el código y la BD actuales. Documento completo: `docs/features/FLAME_2_0_VALORACION.md`.

**Hallazgos clave:**
- `flame-2.0/` es una especificación visual en un solo `index.html` (JS vanilla), no código reutilizable: el front se reescribe en Next/Expo.
- Stage 1 = mismas funciones, rediseñadas; Stage 2 (flag `FX`) = transferencias, social, recaps, mapa, add-ons → fuera de alcance.
- El prototipo pone al **organizador solo en web responsive** y la app solo para asistentes (el botón "Manage" abre la web). Hoy la app iOS tiene herramientas de organizador y va por delante de la web → decisión D1 pendiente.
- La mayoría es solo front. Ítems con migración: follows, saved events, line-up/artistas, categorías, búsqueda ampliada, invitaciones de equipo (estado "Invited"), numeración de tickets (toca el RPC de compra), preferencias de usuario.
- Ya existen en BD: `notifications`, `checkins`, visibilidad/sold-out de tiers, `stripe_fee_cents`, `logo_url`/`cover_image_url` de org.
- Breakdown financiero agrava el N+1 de revenue si no se hace batch antes.

**Plan propuesto:** F0 decisiones + tokens → F1 organizador web → F2 asistente → F3 checkout/códigos (fix bug promoter antes) → F4 funcionalidad nueva con migraciones → F5 QA/release. Estimación baja-confianza: 3–4,5 meses con 1 persona a tiempo completo.

**Pendiente de Kevin:** D1 dónde vive el organizador · D2 relación con la versión base `Flme_comp/` · D3 staging/tests antes de F3–F4 · D4 idioma/i18n.
