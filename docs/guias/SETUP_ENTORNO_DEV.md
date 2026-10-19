# Guía — Levantar el entorno de desarrollo desde el baseline limpio (`Flme_comp`)

**Fecha:** 2026-07-15. Destila las sesiones 07-07 → 07-15 separando lo **indispensable** de lo
que fue troubleshooting o errores (ver `docs/actual/ESTADO_ACTUAL.md` §3).
Alcance: solo desarrollo. Nada de esto toca producción.

## 0. Principios (leer antes de ejecutar)

1. **`Flme_comp/` manda.** Cualquier duda de comportamiento se resuelve mirando el baseline,
   no la copia de trabajo anterior.
2. **Commit inicial ANTES de tocar nada.** El levantamiento anterior se hizo sin un solo
   commit y así pasó inadvertida la corrupción de 2 archivos y una migración de auth que
   divergía de prod. Con un commit del baseline, cada cambio indispensable queda como diff
   revisable (`git diff` = tu lista real de divergencias).
3. **NO tocar el mecanismo de auth mobile.** `apps/mobile/lib/supabase-auth.ts`,
   `apps/mobile/hooks/useUserRole.ts` y `supabase/config.toml` se quedan como en el baseline.
   El acceso mobile→Supabase se resuelve en el **dashboard de Clerk** (JWT template, §4.3),
   no en código. Lección de la sesión 2026-07-15 (2).
4. Los `.env` son la única pieza "secreta"; están gitignored. Nunca copiar valores desde
   `flame-envs.md(f)` (son secretos LIVE de producción).

## 1. Prerrequisitos

| Herramienta | Nota |
| --- | --- |
| Node ≥ 20 + pnpm 9 | `corepack enable` |
| Supabase CLI | `scoop install supabase` o binario |
| Docker Desktop | lo usa `supabase start` |
| Stripe CLI | para `stripe listen` |
| ngrok | webhook de Clerk hacia localhost (authtoken completo desde dashboard.ngrok.com/get-started/your-authtoken, no el ID corto `cr_...`) |
| Cuentas | Clerk (app test propia), Stripe (cuenta test propia), Brevo (opcional), Expo (solo si EAS) |

**Solo para mobile Android (build local):**

| Requisito | Nota |
| --- | --- |
| Android Studio + SDK | `ANDROID_HOME = C:\Users\<u>\AppData\Local\Android\Sdk`; carpeta `platform-tools` (con guion) en PATH |
| JDK 17 Temurin | `choco install temurin17`. El pin real va en `gradle.properties` (§7); tener JDK 24 instalado rompe prefab si el daemon lo agarra |
| LongPathsEnabled=1 | registro de Windows (ayuda, pero el fix real de MAX_PATH es hoisted, §7) |
| Celular con depuración USB | verificar con `adb devices` |

## 2. Repo limpio + cambios indispensables al código

```powershell
# desde la copia limpia del baseline (contenido de Flme_comp como raíz de trabajo)
git init && git add -A && git commit -m "baseline producción"
```

Cambios mínimos, cada uno con su porqué. Aplicar → commit por separado.

### 2.1 Indispensables para web local

| Archivo | Cambio | Por qué |
| --- | --- | --- |
| `apps/web/next.config.ts` | Agregar a `images.remotePatterns` (solo si `NODE_ENV !== "production"`): `http://127.0.0.1:54321` y `http://localhost:54321`, path `/storage/v1/object/**` | `next/image` bloquea el storage local; sin esto toda imagen subida en dev rompe |

### 2.2 Indispensables solo si vas a probar checkout con orgs de Ecuador

| Archivo | Cambio | Por qué |
| --- | --- | --- |
| `packages/lib/src/stripe/connect-countries.ts` | `DEFAULT_CONNECT_COUNTRY` `"EC"` → `"US"` | Las cuentas Stripe test nuevas son Accounts v2 y rechazan el agreement `recipient` para EC. Alternativa sin tocar código: elegir US al conectar cada org de prueba |

### 2.3 Indispensables solo para build Android local

| Archivo | Cambio | Por qué |
| --- | --- | --- |
| `.npmrc` (raíz, nuevo) | `node-linker=hoisted` → borrar `pnpm-lock.yaml` y TODOS los `node_modules` → `pnpm install` | pnpm isolated genera rutas >300 chars; CMake/prefab muere por MAX_PATH (`CXX1428 ... CreateProcess error=2`) |
| `package.json` (raíz) | `pnpm.overrides` — alinear **todas** las copias de React a una sola versión **y** anclar NativeWind + su runtime: `"react": "19.1.0"`, `"react-dom": "19.1.0"`, `"react-server-dom-*": "19.1.0"`, `"nativewind": "4.2.1"`, `"react-native-css-interop": "0.2.1"` | El lockfile hoisted dejaba una copia anidada de React dentro de `react-native-css-interop` (runtime de NativeWind) con versión distinta a la raíz → dos instancias en el bundle → `useContext of null`. **No bastó tocar solo `react`/`react-dom`**: los caret ranges de `nativewind`/`css-interop` volvían a flotar una versión que reintroducía el React anidado, así que hubo que fijarlos exactos para que pnpm dedupe a una sola instancia. [Seguro] aplicado — build Android corriendo. Ojo: el plan inicial de la sesión 07-15 (subir todo a `19.1.4`) se descartó; la solución final **alineó a `19.1.0`**, lo que también movió web a esa versión (coherente con los overrides `react-server-dom-*`). Los pines `@types/react` 18.3.x son aparte (compat web, ver 07-13) — no tocar. |
| `apps/mobile` | `pnpm exec expo install expo-build-properties` (NUNCA `pnpm add`, instala versión incompatible con SDK 54) | requerido por el cambio siguiente |
| `apps/mobile/app.json` | plugin `expo-build-properties` con `android.packagingOptions.exclude: ["META-INF/versions/9/OSGI-INF/MANIFEST.MF"]` | dos jars (okhttp/jspecify) traen el mismo archivo → build falla |
| tras regenerar lockfile | `pnpm exec expo install --fix` en `apps/mobile` | los caret ranges flotan versiones (reanimated saltó a 4.5.1, incompatible con RN 0.81) |

### 2.4 Opcionales (recomendados)

`apps/web/app/components/StripePaymentForm.tsx`: loguear `type/code/message/decline_code/param`
del error de Stripe (el overlay de Next serializa el objeto cross-origin como `{}`).
`apps/mobile/app.config.ts` projectId de EAS: **no se necesita** para build local; solo si
vuelves a EAS (proyecto propio vía `eas init`, id en `.env` como `EAS_PROJECT_ID`).

### 2.5 Qué NO replicar del levantamiento anterior

- Migración a third-party auth (`supabase-auth.ts`, `useUserRole.ts`, `[auth.third_party.clerk]`
  en `config.toml`) — diverge de prod y causó el bug de `fetchUserProfile`.
- Perfiles/keys de `eas.json` — EAS quedó descartado (sin staging, colas free tier).
- `eas-cli` como devDependency.

## 3. Supabase local

```bash
supabase start          # primera vez descarga contenedores
supabase db reset       # aplica las 66 migraciones desde cero
supabase status         # anota: API URL, anon key, service_role key, JWT secret
```

**Seed (opcional pero muy recomendado — datos realistas):** reutilizar
`supabase/seed/backup.sql` del levantamiento anterior (dump de prod ya normalizado y
anonimizado, ~54k filas solo `public.*`). Si no existe, rehacerlo desde un dump nuevo
siguiendo `docs/sesiones/2026-07-07-dev-environment-setup.md` (descartar DDL y schemas
internos, anonimizar PII incluyendo JSON libre).

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/seed/backup.sql
```

**SQL post-seed obligatorio** (Studio en `http://127.0.0.1:54323`):

```sql
-- Las cuentas Connect del seed son de prod: inválidas con sk_test → "No such destination"
UPDATE public.organizations
SET stripe_account_id = NULL, stripe_charges_enabled = false, stripe_payouts_enabled = false;
```

Los `clerk_id` del seed son de producción y no existen en tu Clerk test. Para operar como un
usuario semilla (p. ej. un organizador con eventos):

```sql
UPDATE public.users SET clerk_id = '<User ID de tu Clerk test>', email = '<tu email de prueba>'
WHERE email = 'seed.userNNNN@test.flme.dev';
```

## 4. Clerk (instancia de desarrollo)

1. Crear aplicación en Clerk (modo test) → anotar `pk_test_...` y `sk_test_...`.
2. Crear tu usuario de prueba (sign-up normal) → anotar su User ID para el remapeo del §3.
3. **JWT template `supabase` — CRÍTICO, sin esto mobile no lee Supabase:**
   Dashboard → Configure → **JWT Templates** → New template → nombre exacto `supabase`,
   algoritmo **HS256**, signing key = **JWT secret de `supabase status`**, claims:
   `{ "role": "authenticated" }` (`sub` va por defecto; RLS compara `sub` con
   `users.clerk_id`). Si el preset "Supabase" no aparece (deprecado por Clerk), un template
   en blanco con ese nombre/clave/claims es equivalente — es lo que usa producción.
4. **Webhook** (sync users → tabla `users`): `ngrok http 3000` → en Clerk Dashboard →
   Webhooks → endpoint `https://<subdominio>.ngrok-free.dev/api/webhooks/clerk`, eventos
   `user.created/updated/deleted` → copiar el `whsec_...` a `CLERK_WEBHOOK_SECRET`.
   La URL de ngrok cambia en cada arranque (free): actualizar el endpoint o confiar en el
   sync JIT (`resolveDbUserFromClerkId`), que cubre el alta en la primera llamada autenticada.

## 5. Stripe (cuenta test)

1. Anotar `pk_test_...` / `sk_test_...` (Developers → API keys).
2. **Activar Connect** (dashboard.stripe.com/connect) — sin esto `stripe.accounts.create()` falla.
3. En Connect → Express: onboarding de orgs de prueba con país **US** (EC choca con
   Accounts v2, §2.2).
4. Webhook local: `stripe listen --forward-to localhost:3000/api/webhooks/stripe` → copiar el
   `whsec_...` que imprime a `STRIPE_WEBHOOK_SECRET`. **Debe estar corriendo durante toda
   prueba de compra** — el ticket lo crea el webhook, no el navegador.

## 6. `.env` (solo desarrollo)

### 6.1 `apps/web/.env`

| Variable | Valor dev | Fuente |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` | `supabase status` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key local | `supabase status` |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role local | `supabase status` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | `pk_test_` / `sk_test_` | Clerk §4 |
| `CLERK_WEBHOOK_SECRET` | `whsec_...` | endpoint ngrok §4.4 |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `SIGN_UP_URL` | `/auth/sign-in` / `/auth/sign-up` | fijo |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` / `STRIPE_SECRET_KEY` | `pk_test_` / `sk_test_` | Stripe §5 |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | `stripe listen` §5.4 |
| `NEXT_PUBLIC_APP_URL` / `SITE_URL` / `BASE_URL` | `http://localhost:3000` | fijo |
| `QR_SIGNATURE_SECRET` | `openssl rand -hex 32` | necesario para QR de tickets |
| `CRON_SECRET` | `openssl rand -hex 32` | solo si pruebas rutas cron a mano |
| `BREVO_API_KEY` + `BREVO_SENDER_EMAIL`/`FROM_EMAIL`/`SUPPORT_EMAIL` | opcional | sin esto no salen emails (la app no rompe). Cuenta Brevo gratuita + sender verificado si quieres probarlos |
| `MAINTENANCE_MODE` | `false` | fijo |
| Sentry / `GOOGLE_PLACES_API_KEY` / `EXPO_ACCESS_TOKEN` / `DATAFAST_*` / `TEST_*` | vacíos | no necesarios en dev |

### 6.2 `apps/mobile/.env`

| Variable | Valor dev | Nota |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` (emulador) o `http://<IP LAN>:54321` (device físico) | el device NO ve 127.0.0.1; con USB puedes usar localhost + `adb reverse tcp:54321 tcp:54321` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | anon key local | igual que web |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_...` | igual que web |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` | igual que web; si falta, el checkout crashea |
| `EXPO_PUBLIC_API_URL` | `http://localhost:3000` (+ `adb reverse tcp:3000 tcp:3000`) o `http://<IP LAN>:3000` | la API web debe estar corriendo |
| `EXPO_PUBLIC_APP_URL` | `http://localhost:3000` | links compartibles |
| `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` | vacío | usado en código pero falta en `.env.example` (gotcha conocido) |

Las `EXPO_PUBLIC_*` de un dev-client las inyecta **Metro desde este `.env`** — no hacen falta
EAS env vars para desarrollo local.

## 7. Levantar

### Web

```bash
pnpm install
pnpm dev          # o: cd apps/web && pnpm dev  → http://localhost:3000
# en paralelo: stripe listen --forward-to localhost:3000/api/webhooks/stripe
# en paralelo (si pruebas sync de Clerk): ngrok http 3000
```

### Mobile (Android, build local — EAS descartado)

```bash
cd apps/mobile
npx expo prebuild --platform android        # genera android/ (gitignored)
```

Post-prebuild, SIEMPRE (los archivos son autogenerados y se pierden con prebuild limpio):

- `android/local.properties` → `sdk.dir=C:/Users/<u>/AppData/Local/Android/Sdk`
- `android/gradle.properties` → agregar línea sola:
  `org.gradle.java.home=C:/Program Files/Eclipse Adoptium/jdk-17.0.17.10-hotspot`
  (fija el **Daemon JVM**; verificar con `gradlew --version` → línea "Daemon JVM". El
  `JAVA_HOME` de la shell NO basta). En PowerShell usar `Add-Content -Value '...'`, no `echo >>`.

```bash
adb reverse tcp:8081 tcp:8081               # Metro por USB
npx expo run:android                        # compila dev-client + instala + arranca Metro
# siguientes veces (sin cambios nativos): npx expo start --dev-client -c
```

Tras el primer login en la app: cerrar sesión y volver a entrar si ves errores de token
(Clerk cachea el JWT).

## 8. Checklist de verificación

1. `http://localhost:3000` carga y lista eventos del seed.
2. Sign-up en web → la fila aparece en `public.users` (webhook ngrok o JIT).
3. Imagen de un evento del storage local se ve (valida §2.1).
4. Compra test: tarjeta `4242 4242 4242 4242`, con `stripe listen` corriendo → orden + ticket
   creados (el webhook es quien los crea; sin `stripe listen`, éxito de pago sin ticket).
5. Mobile: app abre sin `Invalid environment config` (`.env` inyectado por Metro), login
   Clerk funciona, y el perfil carga sin `No JWT template exists with name: supabase`
   (valida el template del §4.3).
6. `git status` — la lista de archivos modificados debe coincidir con §2. Todo lo demás es
   sospechoso.

## 9. Diagnóstico rápido de errores conocidos

| Síntoma | Causa | Fix |
| --- | --- | --- |
| `No JWT template exists with name: supabase` | falta el template en Clerk dev | §4.3 |
| 401/RLS con template creado | secret o claim `role` mal | firmar con JWT secret de `supabase status`, claim `role: "authenticated"` |
| `[supabase] Invalid environment config: Required` | la app corre un APK standalone (bundle embebido), no el dev-client con Metro | usar el build de `expo run:android`, no un `preview` viejo |
| `useContext of null` | React duplicado (css-interop anidado) | overrides §2.3 + `expo start -c` |
| `CXX1428 ... CreateProcess error=2` | MAX_PATH por pnpm isolated | `.npmrc` hoisted §2.3 |
| prefab falla con warning de JDK | Daemon JVM en JDK 24 | pin `org.gradle.java.home` §7 |
| `Invalid src prop ... hostname "127.0.0.1"` | falta remotePatterns local | §2.1 |
| `No such destination` al pagar | `stripe_account_id` de prod en el seed | SQL post-seed §3 |
| `recipient` agreement rechazado (EC) | Accounts v2 en cuenta test | país US §5.3 |
| 401 "session expired" en mobile contra prod | URL sin `www` (307 pierde `Authorization`) | siempre `https://www.flme.co` |
| Pago ok pero sin ticket | `stripe listen` no corría | §5.4 |
