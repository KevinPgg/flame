# Pruebas reales

Pruebas manuales que hay que hacer en el PC de Kevin con datos reales de desarrollo (Supabase local, Clerk test, Stripe test, celular Android con el build local). Complementan los tests automáticos: cubren lo que un test no ve (Stripe, correos, cámara, permisos con usuarios reales, cómo se ve).

- Un archivo por fase o bloque de trabajo. Cada entrega agrega sus casos al archivo de su fase **en el mismo commit**.
- Formato: `- [ ]` por caso, agrupados por pantalla; marca `[x]` cuando pase. Si algo falla, anota debajo: pantalla, qué hiciste, qué esperabas, qué pasó y el error de consola.
- "Cosas conocidas" al final de cada archivo: lo que no es fallo de esa prueba.
- **Dispositivo:** cada sección dice dónde se prueba: 📱 **Celular** (build Android local con Metro), 🌐 **Web** (`localhost:3000`), o 📱/🌐 si da igual. Desde la fase 1b (app nativa) el dispositivo principal es el celular.

| Archivo | Alcance | Estado |
| --- | --- | --- |
| [FASE_1_ORGANIZADOR_WEB.md](FASE_1_ORGANIZADOR_WEB.md) | Organizador web v2: redirecciones, menú, panel, evento, crear/editar, tiers, equipo, escáner (configuración), ajustes, payouts, RSVPs, permisos, idioma, errores | Cerrada (10-22). Ronda 3 (10-26, Manage/Ajustes/soporte web): **aprobada 10-27**. Abierto: ingresos v1↔v2 (v1 se conserva). Casos de app → FASE_1B |
| [FASE_1B_ORGANIZADOR_APP.md](FASE_1B_ORGANIZADOR_APP.md) | Organizador en la app (Expo): se llena con cada entrega de la 1b; ya incluye los casos de app heredados de la fase 1 | **Cerrada y aprobada (10-27)** |
| [FASE_2_ASISTENTE.md](FASE_2_ASISTENTE.md) | Asistente web + app (fase 2): se llena con cada entrega (2.1 marco y campana web) | En curso |
- [FASE_3_PAGOS.md](FASE_3_PAGOS.md) — fase 3 (pagos): 3.1 arreglos B2, B10, B3, B4.
- [FASE_4_FUNCIONALIDAD_NUEVA.md](FASE_4_FUNCIONALIDAD_NUEVA.md) — fase 4: CSRF de pagos en la app, promotores en lote + QR, etiquetas de estado, 4.1 Guardar eventos, 4.2 Seguir organizadores, 4.3 Line-up, 4.4 Búsqueda, 4.5 Invitaciones de equipo.
