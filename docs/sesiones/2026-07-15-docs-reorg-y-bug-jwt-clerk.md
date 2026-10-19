# Sesión 2026-07-15 (2) — Consolidación de docs vs `Flme_comp` + bug JWT Clerk/Supabase

## Qué se hizo

1. **Diff completo copia de trabajo vs `Flme_comp/`** (baseline intacto de producción).
   Resultado en `docs/actual/ESTADO_ACTUAL.md` §3: adaptaciones de entorno legítimas
   (envs, EAS propio, expo-build-properties, next/image local, hoisted, connect-countries US,
   seed) y **una divergencia funcional no alineada a prod**: migración de la auth mobile→Supabase
   a third-party Clerk (`supabase-auth.ts`, `useUserRole.ts`, `config.toml`).

2. **Consolidación de docs:**
   - `docs/actual/ARQUITECTURA.md` — fusiona ESTRUCTURA + ENLACE_SERVICIOS + WORKFLOW
     (eliminados). Nuevo §4 documenta el mecanismo real de auth de producción:
     **Clerk JWT template `supabase`** (HS256 con el JWT Secret de Supabase), NO third-party.
   - `docs/actual/ESTADO_ACTUAL.md` — fusiona los dos estados (general 07-07 + mobile
     07-08, eliminados) y agrega estado del entorno dev, divergencias y bugs abiertos.
   - `docs/sesiones/README.md` — índice de sesiones. El contenido de
     `sessions/cambios/2026-07-07-cambios-codigo.md` quedó cubierto por ESTADO_ACTUAL §3.1
     (carpeta `cambios/` eliminada).

3. **Diagnóstico del bug reportado** (`[useUserProfile] fetchUserProfile failed … No JWT
   template exists with name: supabase`):
   - El mensaje corresponde al código **baseline** (`getToken({ template: "supabase" })` en
     `Flme_comp/apps/mobile/lib/supabase-auth.ts`): el bundle que corre en el teléfono ejecuta
     el flujo de template contra la instancia Clerk dev (`upright-peacock-32`), que **no tiene**
     el template `supabase`. Producción funciona porque su instancia Clerk sí lo tiene.
   - La migración a third-party auth hecha en la copia de trabajo no aplica al escenario real y
     además dejó los archivos **corruptos en el mount** (`supabase-auth.ts` truncado a media
     cadena, `useUserRole.ts` con null-padding; ambos conservan el byte-size exacto del
     original — patrón de escritura in-place/sync fallida).
   - **Fix acordado (alineado a prod), entregado por chat:** restaurar ambos archivos desde
     `Flme_comp`, quitar `[auth.third_party.clerk]` de `supabase/config.toml` (+ reiniciar
     supabase), crear en Clerk dev el JWT template `supabase` (HS256, signing key = JWT secret
     del Supabase local vía `supabase status`, claims con `role: "authenticated"`), reiniciar
     Metro con `-c` y re-login en la app.

4. **Guía de re-levantamiento desde baseline limpio:** `docs/guias/SETUP_ENTORNO_DEV.md` —
   separa cambios indispensables (next/image local, hoisted+overrides, expo-build-properties,
   connect-countries US) de lo que NO se debe replicar (third-party auth, EAS), e incluye
   Supabase/Clerk (JWT template)/Stripe/Brevo y ambos `.env` de desarrollo.

## Pendiente
- Kevin aplica el fix del JWT template y confirma que `fetchUserProfile` funciona.
- Heredados: fix React duplicado (overrides 19.1.4, sin confirmar), rotación de secretos
  `flame-envs`, confirmación B1–B10, Stripe EC/Accounts v2.

## Para retomar en un chat nuevo
"Lee `docs/sesiones/README.md` y `docs/actual/ESTADO_ACTUAL.md`; seguimos desde el bug
JWT (sesión 2026-07-15 (2))".
