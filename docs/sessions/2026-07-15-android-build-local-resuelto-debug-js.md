# Sesión 2026-07-15 — Build local de mobile (Android): RESUELTO el muro nativo, ahora debugging JS

## Contexto
Continuación de `2026-07-13-android-eas-build-troubleshooting.md`. Objetivo: **levantar la app mobile (Expo/RN, `apps/mobile`) en Android para pruebas de uso**. En la sesión del 13 se estaba intentando vía EAS y no conectaba; hoy se **abandonó EAS**, se pasó a **build local (`expo run:android`)** y se resolvió toda la cadena de infraestructura nativa. La app ya **compila, instala y conecta a Metro**. Quedó pendiente un error de JavaScript (React duplicado) cuyo fix ya está indicado pero **sin confirmar**.

## Decisión clave: EAS descartado, build local
Motivos: (1) Kevin **no tiene entorno staging** (`staging.flme.co`), (2) EAS free tier con cola >2h por build, (3) en un dev-client el JS lo sirve el Metro local, así que las `EXPO_PUBLIC_*` salen del `.env` local de todos modos. Conclusión: el build local no es el plan B, es el correcto. El APK que estaba instalado en el celular era el **standalone `preview`** (no un dev-client) — por eso ignoraba a Metro y crasheaba con su bundle embebido. Un `expo run:android` genera un dev-client de verdad que sí engancha a Metro.

## Muros resueltos hoy, en orden

1. **adb / ANDROID_HOME**
   - La carpeta del SDK estaba mal nombrada `platformtools` (sin guion) → renombrada a `platform-tools`. Se corrigió también la entrada del PATH y se quitó una copia suelta rara en `C:\Program Files (x86)\platform-tools`.
   - Faltaba crear `ANDROID_HOME = C:\Users\User\AppData\Local\Android\Sdk`.
   - El celular (Xiaomi, `23129RA5FL`) se ve con `adb devices` por USB. Metro por USB: `adb reverse tcp:8081 tcp:8081` + `npx expo start --dev-client --host localhost`.

2. **Muro SDK (Gradle "SDK location not found")**
   - Fix: crear `apps/mobile/android/local.properties` con `sdk.dir=C:/Users/User/AppData/Local/Android/Sdk`, y `ANDROID_HOME` presente en la terminal.

3. **Muro MAX_PATH (Windows 260 chars) — la causa del `[CXX1428] ... prefab_command.bat ... CreateProcess error=2`**
   - pnpm en modo **isolated** (default) generaba rutas de ~305 caracteres (carpetas `.pnpm/@shopify+react-native-skia@...hash.../node_modules/...`). CMake/prefab no podía lanzar el `.bat`.
   - `LongPathsEnabled=1` en el registro ayudó a medias (el lanzador nativo de Gradle lo ignora), **no fue el fix real**.
   - **FIX REAL:** `.npmrc` en la raíz con `node-linker=hoisted` → node_modules plano → rutas ~170 chars. Requirió borrar `pnpm-lock.yaml` + **todos** los `node_modules` (raíz y de cada paquete) + `pnpm install`. El lockfile además estaba roto por un merge conflict, así que se regeneró entero.

4. **Consecuencia del lockfile regenerado: reanimated flotó**
   - `react-native-reanimated: "^4.1.6"` (caret) saltó a `4.5.1`, incompatible con RN 0.81.5.
   - Fix: `pnpm exec expo install --fix` (realineó versiones a las compatibles con SDK 54).

5. **Muro JDK — `WARNING: A restricted method in java.lang.System has been called`**
   - Mecánica real (del stacktrace con `--stacktrace`): `com.android.build.gradle.tasks.GeneratePrefabPackagesKt.reportErrors` **trata cualquier línea de la salida del subproceso prefab como error fatal**. El JDK 24 imprime ese warning al cargar nativo → prefab "falla".
   - Causa raíz: **el daemon de Gradle corría en JDK 24** (Oracle, `C:\Program Files\Java\jdk-24`), NO en el 17. `java -version` en la shell decía 17, pero `gradlew --version` mostraba `Daemon JVM: C:\Program Files\Java\jdk-24`. Cambiar `JAVA_HOME`/PATH no bastó (había un JAVA_HOME apuntando a jdk-24 que ganaba, probablemente en variables de sistema).
   - Se instaló Temurin **JDK 17** (`choco install temurin17`) → `C:\Program Files\Eclipse Adoptium\jdk-17.0.17.10-hotspot`.
   - **FIX DEFINITIVO:** pin en `apps/mobile/android/gradle.properties`:
     `org.gradle.java.home=C:/Program Files/Eclipse Adoptium/jdk-17.0.17.10-hotspot`
     Esto fuerza el **Daemon JVM** a 17 sin importar el enredo de variables de entorno. (El `Launcher JVM` puede quedar en 24, no importa; el build y prefab corren en el Daemon.)
   - Ojo: la línea debe ir **sola**. PowerShell rompe `echo x>>archivo` con espacios; se usó `Add-Content -Value '...'` y luego un `-replace` para separar la línea que se había pegado a `MANIFEST.MF`.

## RESULTADO
La app **compila, instala en el celular, y conecta a Metro** (aparece bundling). El error de `[supabase] Invalid environment config: Required` **desapareció** (el `.env` local se inyecta bien vía Metro).

## Error JS actual (en debugging, NO confirmado el fix)
```
ERROR [TypeError: Cannot read property 'useContext' of null]
  exports.useContext (node_modules\react-native-css-interop\node_modules\react\cjs\react.development.js)
  interop (react-native-css-interop\dist\runtime\native\native-interop.js)
```
- Causa: **React duplicado**. React raíz (hoisted, app+web) = **19.1.4**; copia anidada en `react-native-css-interop` (runtime de NativeWind) = **19.1.0**. Dos instancias en el mismo bundle → dispatcher de hooks null.
- **Fix indicado (pendiente de confirmar):** en `package.json` de la raíz, agregar a `pnpm.overrides`:
  `"react": "19.1.4"`, `"react-dom": "19.1.4"` → `pnpm install` → verificar que `node_modules\react-native-css-interop\node_modules\react` ya no existe → reiniciar Metro con `pnpm exec expo start --dev-client -c`. Es solo JS, no requiere recompilar nativo. Web no cambia (ya está en 19.1.4, y coincide con los overrides `react-server-dom-*`).

## Estado de archivos tocados
- **`.npmrc` (raíz)**: creado, `node-linker=hoisted`. (Cambia cómo instala TODO el monorepo, incluida la web — hacer smoke test de web.)
- **`package.json` (raíz)**: `pnpm.overrides` — agregando `react`/`react-dom` = `19.1.4` (pendiente confirmar).
- **`pnpm-lock.yaml`**: regenerado por completo (diff grande, esperado).
- **`apps/mobile/package.json`**: versiones realineadas por `expo install --fix` (reanimated, etc.).
- **`apps/mobile/android/local.properties`**: `sdk.dir=...` (gitignored, autogenerado).
- **`apps/mobile/android/gradle.properties`**: línea `org.gradle.java.home=...jdk-17...` (gitignored, autogenerado — **se pierde si se corre `expo prebuild` limpio**; hay que re-agregarla, o migrarla a `expo-build-properties` para que persista).
- **Entorno Windows** (fuera del repo): `ANDROID_HOME` creado; `platform-tools` renombrado; Temurin 17 instalado; `JAVA_HOME` apuntando al 17; `LongPathsEnabled=1` en registro (reversible); PATH ajustado.
- Nada commiteado aún (Kevin revisa cambios en local antes de commitear, por regla del proyecto).

## Próximos pasos — orden para la siguiente sesión
1. **Confirmar el fix del React duplicado**: aplicar los overrides `react`/`react-dom` 19.1.4, `pnpm install`, verificar que la copia anidada se fue, reiniciar Metro `-c`, abrir app. Ver si el `useContext of null` desaparece.
2. **Seguir el debugging JS en caliente** (hot reload por Metro, sin más Gradle) a medida que aparezcan errores de runtime.
3. **Persistir el pin de JDK**: `org.gradle.java.home` vive en `android/gradle.properties`, que es autogenerado. Si se re-prebuild, re-agregar. Evaluar moverlo a un mecanismo durable.
4. **Limpiar el enredo de JDK 24**: revisar si aún hay `JAVA_HOME` de sistema apuntando a `C:\Program Files\Java\jdk-24`; idealmente dejar solo el 17.
5. Pendientes heredados del 13-jul: `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` falta en `.env`/`.env.example`; `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` ya se completó (Kevin lo puso, es su key real).

## Gotchas aprendidos (para no repetir vueltas)
- **pnpm isolated + Windows + RN nativo = muerte por MAX_PATH.** Usar `node-linker=hoisted`.
- **El JVM que importa es el `Daemon JVM`, lo fija `org.gradle.java.home`, NO el `JAVA_HOME` de la shell.** Verificar siempre con `gradlew --version` → línea `Daemon JVM`.
- **dev-client vs standalone**: un APK standalone (`preview`) ignora Metro y corre su bundle embebido. Para pruebas con hot reload hace falta un build `developmentClient: true` (el `expo run:android` local lo genera).
- **Metro por USB**: `adb reverse tcp:8081 tcp:8081` + `--host localhost` (evita Wi-Fi/firewall).
- **PowerShell**: `%VAR%` no expande (usar `$env:VAR`); `echo x>>archivo` se rompe con espacios (usar `Add-Content -Value '...'`).
- **Regenerar el lockfile flota versiones** dentro de los caret ranges → puede romper compat (reanimated). `expo install --fix` para realinear a SDK 54.

## Para retomar en un chat nuevo
Decirle a Claude: "Lee `docs/sessions/2026-07-15-android-build-local-resuelto-debug-js.md` y seguimos desde el paso 1 (confirmar el fix del React duplicado en mobile)." El build nativo ya está resuelto; de aquí en adelante es iterar JS por Metro.
