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

## Decisiones de Kevin (misma fecha, 15:31)
- D1: el organizador debe verse y funcionar desde la app (pantallas nativas, no web embebida).
- D2: Flame 2.0 reemplaza a `Flme_comp/`. Mientras tanto `Flme_comp/` queda congelada como referencia de comportamiento.
- D3: este proyecto ya es el entorno de desarrollo (fuera del git de producción, commits propios que Kevin pasará a limpio). Se agrega: tests de integración de los RPC de compra (fase 0) y un ensayo final de migraciones + TestFlight sobre staging (fase 5).
- D4: inglés por defecto como el prototipo, con selector de idioma (en/es) en Ajustes → i18n desde la fase 0, preferencia en `users.language` (incluye emails y push).
- Estimación revisada [Adivinando]: 4,5–6 meses con 1 persona a tiempo completo.

## Aclaraciones de Kevin (16:02)
- D2: `Flme_comp/` no se toca; queda como referencia de la versión antigua. "Reemplazar" = Flame 2.0 se construye con código nuevo.
- D3: hoy Kevin prueba la app mobile con `npx expo start` en `apps/mobile` y la usa en `localhost:8081` → eso es **Expo web en el navegador**, no la app nativa. Pago con Stripe nativo (`@stripe/stripe-react-native`), cámara del scanner (`expo-camera`), push (`expo-notifications`) y `expo-secure-store` no se comportan igual o no funcionan en web (solo hay 3 ramas `Platform.OS === 'web'` en mobile). Plan: Expo web para iterar UI; build local Android (ya resuelto el 07-15) para lo nativo; build iOS (EAS, no hay Mac) solo para el ensayo final, porque producción es solo iOS.
- D4: de acuerdo (inglés por defecto + selector en/es).

## Fase 0 — hecha (2026-10-08)
Todo aditivo: ninguna pantalla actual cambia. Verificado en un Postgres 16 + PostgREST locales con las 65 migraciones aplicadas.

| Pieza | Archivos | Verificación |
| --- | --- | --- |
| Tokens v2 | `packages/lib/src/design-tokens/flame-v2.ts`, namespace `v2-*` en `packages/ui/tailwind.config.js`, fuentes v2 en `apps/web/tailwind.config.ts` | Test de sincronía `design-tokens-v2.test.ts`; Tailwind 3 genera `bg-v2-ink`, `rounded-v2-card`, `font-v2-display`; tokens v1 intactos |
| i18n | `packages/lib/src/i18n/` (en/es tipados, `translate`, plurales, `resolveLanguage`), `apps/web/app/lib/i18n.tsx`, `apps/mobile/lib/i18n.tsx` (provider + `useI18n`) | `i18n.test.ts`; TypeScript falla si `es.ts` no tiene todas las claves o si se usa una clave inexistente. Sin librerías nuevas |
| Idioma del usuario | `supabase/migrations/20261008170000_add_users_language.sql` (`users.language` en/es, default en) | Aplicada sobre las 65 migraciones; CHECK rechaza otros valores; idempotente |
| Tests de holds | `apps/web/__tests__/integration/purchase-holds.test.ts` (15 tests) | 15/15 verdes contra PostgREST + Postgres; una mutación del RPC (quitar límite por usuario) los pone en rojo |

`packages/lib`: tsc 0 errores, 195/195 tests (antes 176).

**Hallazgo (bug real, no corregido):** el "Sold out" manual del organizador (`is_manually_sold_out`) solo se respeta en la UI. Ni `atomic_create_hold_with_stage_validation` ni `POST /api/holds/create` lo validan → una llamada directa a la API puede reservar y comprar un tier marcado como agotado. Documentado con `it.fails` en el test. Corregir en fase 3 (o antes si Kevin lo prioriza).
**Observación menor:** un tier `is_hidden` sin `secret_code` también se puede reservar por API (la ruta solo exige código si existe).

**Pendiente de Kevin (en su PC):**
1. `supabase migration list` (verificar que las 65 existentes figuran como aplicadas) y luego `supabase migration up` para aplicar solo la de idioma. **No usar `supabase db reset`**: borra la BD y `supabase/seed/` está vacío, se perdería el seed de prod anonimizado (~54k filas).
2. `pnpm --filter @project-flame/lib test` y `pnpm --filter web test:integration` (con `.env.local` apuntando al Supabase local; el test de holds se niega a correr contra `*.supabase.co`).
3. Fuentes para mobile cuando arranque la fase 1: `pnpm --filter mobile add @expo-google-fonts/inter @expo-google-fonts/inter-tight` (no se instaló nada desde aquí: el entorno remoto es Linux y rompería los binarios de Windows en `node_modules`).

**Siguiente:** fase 1 — organizador web. Primera pantalla v2 monta `I18nProvider` y carga Inter / Inter Tight.

## Snapshot de prod en dev y `migration list` (16:37)
- Pauta existente: `2026-07-07-dev-environment-setup.md`. Método = **schema por migraciones** (`supabase db reset`) + **datos de un pg_dump de prod, solo-datos y anonimizado** (`supabase/seed/backup.sql`, ~95MB) cargado con `psql`, + SQL manual (Stripe de orgs a NULL, remapeo de `clerk_id`).
- ⚠️ `supabase/seed/` está **vacía** desde el 2026-07-17: el `backup.sql` ya no está en el proyecto y el script de anonimización nunca se guardó. Si la BD local se borra, no hay cómo recargar esos datos sin un dump nuevo de prod.
- `supabase migration list` sin flags compara contra el proyecto **vinculado en la nube** → "no project ref". Para la BD local: `supabase migration list --local`, o consultar `supabase_migrations.schema_migrations` con psql. **No** hacer `supabase link` contra prod.
- Conteo real: 65 migraciones (igual que `Flme_comp`); el "66" de docs anteriores era un error de conteo.
