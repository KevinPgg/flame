# Documentación de Flame

Ordenada por relevancia: de arriba hacia abajo, de lo que se lee siempre a lo que solo se consulta.

| Carpeta | Qué hay | Cuándo leerla |
| --- | --- | --- |
| [`actual/`](actual/) | `ESTADO_ACTUAL.md` (estado del proyecto; §0 = Flame 2.0), `ARQUITECTURA.md` (arquitectura de producción), `FLAME_2_0_VALORACION.md` (plan y decisiones del rediseño), `FASE_3_PAGOS.md` (bugs de cobro, flujo y plan de la fase 3), `FLAME_PLATFORM_OVERVIEW.md` (resumen para stakeholders) | **Siempre**, para retomar el trabajo |
| [`sesiones/`](sesiones/) | Registro de cada sesión de trabajo (`YYYY-MM-DD-tema.md`) e índice en su `README.md` | Para saber qué se hizo, por qué y qué quedó pendiente |
| [`PruebasReales/`](PruebasReales/) | Listas de pruebas manuales por fase, para ejecutar en el PC con datos reales | Antes de cerrar una fase o de pasar cambios a producción |
| [`guias/`](guias/) | Cómo hacer las cosas: entorno de desarrollo (`SETUP_ENTORNO_DEV.md`), DNS, email, Apple Sign In, OTA, rendimiento, SEO, modo mantenimiento | Al configurar o operar algo |
| [`historico/`](historico/) | Lo heredado del equipo anterior: changelogs de fixes por mes, features, Datafast (legacy), seguridad, docs de testing, TODOs triados, migraciones del proyecto, versiones iOS, reportes | Solo para consultar el porqué de un comportamiento existente |

## Reglas

- Un documento de estado y uno de arquitectura (`actual/`): se actualizan, no se duplican.
- Cada sesión deja su `.md` en `sesiones/` y actualiza el índice.
- Cada entrega suma sus casos de prueba manual en `PruebasReales/` en el mismo commit.
- Lo que deja de ser vigente pasa a `historico/`; no se borra.

Otros docs fuera de esta carpeta: `apps/web/stripe-implementation/` (Stripe Connect), `Levantamiento/` (visor del levantamiento técnico, foto del 2026-07-08), `Flme_comp/` (baseline de producción, no se toca).
