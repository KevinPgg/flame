# Sesión 2026-07-21 — Pregunta: ¿en qué % se usó IA en el repo? + prueba de memoria de proyecto

## Qué se hizo

1. **Análisis del baseline `Flme_comp/`** para estimar cuánta IA se usó en el proyecto.
   Señales recogidas (todo por inspección de archivos, no por historial):
   - **Sin historial git utilizable:** `git log` en `Flme/` devuelve *"branch master does not
     have any commits yet"*; `Flme_comp/` es copia de carpeta sin `.git` propio. → No hay
     autoría por commit, ni trailers `Co-Authored-By`, ni diffs. Se pierde la única fuente
     objetiva de atribución.
   - **Desarrollo asistido por IA confirmado:** `Flme_comp/.cursor/rules/` con 3 `.mdc`
     extensos (`project-flame-master.mdc` 47 KB, `flame-design-system.mdc` 31 KB,
     `nextjs-typescript.mdc` 8 KB) → setup deliberado de Cursor con reglas de contexto grandes.
   - **Escala:** ~700 archivos de código, ~148k líneas (web 93k, mobile 38k, supabase 10k,
     lib 5k, ui 1k).

2. **Conclusión metodológica (se mantiene):** el "porcentaje de IA" **no es una métrica
   medible** con lo que hay en el repo. Cualquier cifra exacta es inventada. Estimación por
   señales (baja confianza): probablemente 70–90% de líneas pasaron por generación/autocompletado
   de IA, pero con dirección arquitectónica y edición humana en casi todo — donde está el valor.
   El número solo es engañoso sin ese matiz.

3. **Alternativas medibles ofrecidas** (pendientes de que Kevin elija):
   - (a) Si existe el repo original **con git**, reconstruir autoría real por commit.
   - (b) Métricas de calidad objetivas sobre el código actual: cobertura de tests, duplicación,
     complejidad, TODOs, consistencia de patrones. (= la pregunta real detrás de "cuánta IA".)

## Sobre el "SI SE PUEDE"
Esta nota es la prueba del mecanismo de memoria del proyecto: guardar contexto en
`docs/sesiones/*.md` para poder abrir un chat nuevo sin perder el hilo. Lo que **no** cambió es
la conclusión técnica: medir el % de IA sigue sin ser posible sin git; lo que "sí se puede" es
persistir el contexto de la sesión, no fabricar una métrica.

## Pendiente
- Kevin decide si quiere (a) atribución por git del repo original, o (b) auditoría de calidad
  del código.
- Heredados de sesiones previas siguen abiertos (bug JWT template, React duplicado, rotación
  de secretos, confirmaciones B1–B10, Stripe).

## Para retomar en un chat nuevo
"Lee `docs/sesiones/README.md` y esta sesión (2026-07-21). Sobre el % de IA: no es medible sin
git; si quiero un número real, decidir entre atribución por git del repo original o auditoría
de calidad del código."
