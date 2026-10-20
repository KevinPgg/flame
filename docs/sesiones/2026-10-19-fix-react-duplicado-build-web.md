# 2026-10-19 — Fix React duplicado en `next build` local (ESTADO_ACTUAL §4, punto 6)

## Síntoma
`pnpm --filter web build` (check de build de producción de la Fase 1) compila y pasa lint/tipos, y falla en
`Error occurred prerendering page "/404"` → `TypeError: Cannot read properties of null (reading 'useContext')`.

## Causa (verificada en disco)
- `node_modules/react` y `react-dom` = 19.1.0 (los usa la app, vía `pnpm.overrides`).
- `node_modules/next/node_modules/react` y `react-dom` = **19.1.4** (copia anidada por `node-linker=hoisted`).
- El `package.json` raíz declaraba `next` sin `react`; el lockfile conserva variantes de `next@15.5.9` resueltas con 19.1.4.
- El prerender de `/404` usa la copia anidada → dos instancias de React → contexto `null`.
- Los avisos de Sentry (`disableLogger`, `global-error`, `sentry.client.config.ts`) y el de `tailwind.config.ts` (`MODULE_TYPELESS_PACKAGE_JSON`) NO son la causa; no bloquean el build.
- `not-found.tsx`, `layout.tsx`, `package.json` de web y `instrumentation.ts` son idénticos a `Flme_comp/`; la divergencia está en los `pnpm.overrides` de la raíz.

## Cambio aplicado
`package.json` (raíz): `devDependencies` + `"react": "19.1.0"`, `"react-dom": "19.1.0"`.

## Verificación pendiente (Kevin, local)
1. `pnpm install` en la raíz.
2. Comprobar que ya no existe `node_modules\next\node_modules\react` ni `react-dom`. Si reaparece: borrar `node_modules` y reinstalar (el lockfile arrastra variantes con 19.1.4).
3. `pnpm --filter web build` pasa completo.
4. Build/arranque Android sin regresiones (mobile exige React 19.1.0).
5. Commit propio, solo si 3 y 4 pasan.

## Commit sugerido
```
git add package.json pnpm-lock.yaml docs/actual/ESTADO_ACTUAL.md docs/PruebasReales/FASE_1_ORGANIZADOR_WEB.md docs/sesiones/2026-10-19-fix-react-duplicado-build-web.md docs/sesiones/README.md
git commit -m "fix(web): alinear react/react-dom 19.1.0 en la raíz para evitar React duplicado en next build"
```

## Pendiente anotado
- ESTADO_ACTUAL §4 punto 5 sigue diciendo "overrides 19.1.4 pendiente", pero `docs/guias/SETUP_ENTORNO_DEV.md` §2.3 indica que se alineó a 19.1.0 y está aplicado. Reconciliar después de verificar Android.
- Lockfile: tras `pnpm install` debería perder las variantes `next@15.5.9(...react@19.1.4)`; revisar el diff.
