# Pruebas reales

Pruebas manuales que hay que hacer en el PC de Kevin con datos reales de desarrollo (Supabase local, Clerk test, Stripe test, celular Android con el build local). Complementan los tests automáticos: cubren lo que un test no ve (Stripe, correos, cámara, permisos con usuarios reales, cómo se ve).

- Un archivo por fase o bloque de trabajo. Cada entrega agrega sus casos al archivo de su fase **en el mismo commit**.
- Formato: `- [ ]` por caso, agrupados por pantalla; marca `[x]` cuando pase. Si algo falla, anota debajo: pantalla, qué hiciste, qué esperabas, qué pasó y el error de consola.
- "Cosas conocidas" al final de cada archivo: lo que no es fallo de esa prueba.

| Archivo | Alcance | Estado |
| --- | --- | --- |
| [FASE_1_ORGANIZADOR_WEB.md](FASE_1_ORGANIZADOR_WEB.md) | Organizador web v2: redirecciones, menú, panel, evento, crear/editar, tiers, equipo, escáner (configuración), ajustes, payouts, RSVPs, permisos, idioma, errores | Pendiente de ejecutar |
