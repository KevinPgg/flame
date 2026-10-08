# Sesión 2026-07-13 — Compilar mobile para Android (EAS) + debug de env vars sin resolver

## Contexto
Continuación de la sesión de análisis de código (ver `2026-07-09-analisis-stripe-holds-promotor-bug.md`). Kevin pidió compilar la app mobile (Expo/RN) para Android por primera vez, en modo desarrollo (solo pruebas de uso/funcionalidad, no producción). Terminó siendo una sesión larga de troubleshooting de infraestructura EAS + env vars que **no se resolvió del todo** — queda pendiente para la próxima.

## Lo que se hizo, en orden

1. **Git**: el repo no tenía `.git` en ningún lado (ni raíz ni `apps/mobile`). Se inicializó en la raíz del monorepo (correcto — `apps/mobile` depende de `packages/lib`/`packages/ui` vía `workspace:*`, un repo aislado en `apps/mobile` no los hubiera incluido).

2. **Cuenta EAS**: el `projectId` hardcodeado en `apps/mobile/app.config.ts`/`app.json` (`5558474d-83a3-41fb-bb90-3c652ce37885`) pertenece a otra cuenta (probablemente `hello@flme.co`, la que aparece en `eas.json` → `submit.production.ios`). Kevin no tiene acceso. Se optó por crear un proyecto EAS nuevo bajo su propia cuenta (`kevinpgg`) vía `eas init`, en vez de pedir acceso al proyecto original — **esto significa que este proyecto EAS nuevo está completamente aislado**: no comparte historial de builds, credenciales de firma, ni canal de OTA updates con producción/TestFlight. Correcto para pruebas, pero no confundir a futuro.
   - `app.config.ts` ya soporta esto de forma dinámica sin tocar código: `process.env.EAS_PROJECT_ID ?? "<hardcoded>"`. El id nuevo se guardó en `apps/mobile/.env` (gitignored).

3. **`eas.json`**: se agregó un perfil nuevo, `development-staging` (developmentClient: true, distribution internal, `"environment": "preview"`, apunta a `staging.flme.co`) — para tener un dev-client con hot reload en vez de tener que descargar un APK nuevo por cada cambio de JS. Los perfiles preexistentes:
   - `development` → localhost:3000 (requiere backend local)
   - `development-device` → **`https://www.flme.co` (¡producción real, no staging!)** — ojo con este si se usa a futuro
   - `preview` → `staging.flme.co`, el que se compiló primero como APK standalone

4. **Primer build (`preview`) falló** por conflicto de empaquetado Android: dos jars (`okhttp3:logging-interceptor:5.3.2` y `org.jspecify:jspecify:1.0.0`) traen el mismo archivo `META-INF/versions/9/OSGI-INF/MANIFEST.MF`. Fix: se agregó el plugin `expo-build-properties` a `app.json` con `android.packagingOptions.exclude`. **Este plugin se instaló con `pnpm add` (sin pasar por `expo install`) y quedó en la versión `57.0.3` — completamente incompatible con el SDK 54 del proyecto (debería ser `~1.0.10`).** `expo doctor` lo confirmó. **Pendiente corregir**: `npx expo install expo-build-properties` (no `pnpm add`).

5. **Segundo build (`development-staging`) sí compiló e instaló**, pero al abrir la app: `Error: [supabase] Invalid environment config: Required; Required`. Viene de `apps/mobile/lib/supabase.ts` (valida `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` con Zod).

6. **Diagnóstico del error de Supabase — descartado uno por uno, sigue sin resolverse:**
   - ❌ No es que falten las EAS Environment Variables del proyecto nuevo (se crearon vía `eas env:create --scope project --environment preview --name ... --value ...` para Supabase) — pero esto solo afecta builds en la nube, no la sesión local de Metro.
   - ❌ No es el `.env` local — existe, contenido correcto (confirmado leyendo el archivo), un solo archivo (`Get-ChildItem -Force *.env*` solo muestra `.env`, sin `.env.local` compitiendo).
   - ❌ No es encoding UTF-16 (se verificó con `Get-Content -Encoding Byte`, son bytes ASCII normales).
   - ❌ No es el directorio de ejecución (confirmado `apps/mobile` en el prompt).
   - ❌ No es que Metro no cargue el `.env` — el log de `npx expo start --dev-client --clear` sí muestra `env: export EXPO_PUBLIC_SUPABASE_URL EXPO_PUBLIC_SUPABASE_ANON_KEY EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY EXPO_PUBLIC_API_URL`.
   - ❌ No es Android vs iOS (el inlining de `EXPO_PUBLIC_*` es igual en ambas plataformas).
   - ❌ Probablemente no es Expo Go vs dev-client — el mismo error salió en ambos.
   - **Sin confirmar todavía**: si el celular realmente está conectando a *esta* sesión de Metro. Presionar `a` en la terminal de `expo start` falló con `Error: El sistema no puede encontrar la ruta especificada` (adb no está en el PATH de Windows — Android Studio está instalado pero no configurado en PATH/`ANDROID_HOME`). Al abrir la app manualmente desde el ícono del celular, no mostró pantalla de "Enter URL manually" — se cerró sola y volvió a mostrar el mismo error. **No se confirmó si aparece actividad en la terminal de Metro al abrir la app** (última pregunta pendiente de responder).

7. **Callejón sin salida explorado y descartado**: abrir el proyecto en "web" desde Expo Go para buscar más pistas — falla siempre por `@stripe/stripe-react-native` (importa módulos nativos `codegenNativeComponent`/`codegenNativeCommands` que no existen en web). No aporta información nueva, no seguir por ahí.

8. **`expo doctor` corrido sobre el build de EAS** reveló, aparte de `expo-build-properties`:
   - `eas-cli` como devDependency del proyecto — Expo recomienda no hacerlo, usar `npx`/`cli.version` en `eas.json` en su lugar. No bloqueante, decisión pendiente de Kevin.
   - Varios mismatches de versión menores (`@stripe/stripe-react-native`, `expo-router`, `expo-updates`, etc.) — no se tocaron, dejar para después con `npx expo install --check`.
   - `@types/react` en 18.3.x vs esperado 19.1.x — viene del `pnpm.overrides` en el `package.json` raíz (intencional para compat con web/Next.js), **no tocar sin revisar impacto cruzado con web**.
   - Warning de `metro.config.js` sobre `watchFolders` — es la config custom del monorepo (ya existía, no se tocó esta sesión), probablemente falso positivo esperado por el setup multi-paquete.

## Estado de archivos tocados
- `apps/mobile/app.json`: se agregó el plugin `expo-build-properties` con `packagingOptions.exclude` para el conflicto OSGI-INF.
- `apps/mobile/eas.json`: se agregó el perfil `development-staging`.
- `apps/mobile/.env`: creado localmente por Kevin (gitignored), con IP LAN real (`192.168.2.63`) para Supabase local, API local, Clerk, y `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` **vacío** (pendiente completar).
- Nada de esto se subió a git todavía (no se pidió commit explícito en esta sesión).

## Próximo paso — orden recomendado para la siguiente sesión

1. **Arreglar la versión de `expo-build-properties`**: `cd apps/mobile && npx expo install expo-build-properties` (no `pnpm add`).
2. **Responder la pregunta pendiente**: abrir la app del dev-client en el celular mientras se mira la terminal de Metro — ¿aparece actividad (bundling, request) o no aparece nada? Esto determina si el celular está tocando Metro en absoluto.
3. **Configurar Android Studio / `adb`** (Kevin ya lo tiene instalado, falta asociarlo):
   - `npx expo prebuild --platform android` desde `apps/mobile` (genera carpeta `android/` local, gitignored, aplicando ya el fix de `expo-build-properties`).
   - Abrir `apps/mobile/android` en Android Studio.
   - Agregar `platform-tools` del SDK al `PATH` de Windows + variable `ANDROID_HOME`, para que `adb` funcione tanto desde Android Studio como desde la terminal (`a` en `expo start`).
   - Con Android Studio corriendo la app (su propio adb interno), usar **Logcat** para ver el stack trace completo alrededor del crash de Supabase — mucho más detalle que el resumen truncado de la pantalla "Enviar comentarios" del teléfono.
4. Una vez resuelto el crash de Supabase: completar `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (vacío en `.env`) y `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` (usado en código, faltante en `.env`/`.env.example`), y crear esas mismas keys como EAS Environment Variables del proyecto nuevo (scope `preview`) para que los builds en la nube también las tengan.
5. Opcional / no urgente: decidir si sacar `eas-cli` de dependencies (`pnpm remove eas-cli`), correr `npx expo install --check` para los demás mismatches de versión, agregar `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` a `.env.example` para que no se vuelva a perder.

## Para retomar en un chat nuevo
Decirle a Claude: "Lee `docs/sessions/2026-07-13-android-eas-build-troubleshooting.md` y seguimos desde el paso 2 (verificar si el celular conecta a Metro)". El resto de contexto del proyecto (bug de código promotor, hallazgo de que `QRScannerModal.tsx` está huérfano en web, etc.) está en los otros `.md` de `docs/sessions/`.
