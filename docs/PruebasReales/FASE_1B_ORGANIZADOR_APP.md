# Fase 1b — Organizador en la app · pruebas reales

Lista viva: se amplía con cada entrega de la fase 1b. Prueba en el build local de Android (celular) y, para pantallas,
en Expo web (`localhost:8081`). Mismo formato que la fase 1.

## Heredado de la fase 1 (necesita la app)
- [ ] Ajustes → Scan Tickets → código del evento → escanea ese evento sin cuenta. Tras "Nuevo código" en la web, el código viejo deja de funcionar al siguiente escaneo.
- [ ] Con sesión de un miembro o de una persona agregada: escanea su evento; una persona agregada a otro evento → "You can't scan tickets for this event".
- [ ] (Emergencia) `SCANNER_ACCESS_CODES=off` en `apps/web/.env` y reinicio: el código deja de dar acceso (403).
- [ ] Descubrir (`localhost:8081`): "carnaval" encuentra "Carnával" y al revés (también en el panel del organizador y RSVPs de la app actual).

## Cosas conocidas
- Push en Android: sin FCM el build no obtiene token (`[notifications] Failed to get Expo push token` en consola). No es fallo; ver la sesión 2026-10-22.
