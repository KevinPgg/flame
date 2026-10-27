# 2026-10-26 · Hub Manage, Ajustes únicos y cola de soporte en la web v2

**Contexto:** Kevin dio por **cerrada la fase 1b** (decisión 10-26; la ronda 3 de pruebas reales de la app se completa en paralelo, ver `PruebasReales/FASE_1B_ORGANIZADOR_APP.md`) y pidió, antes de la fase 2, llevar a la web v2 lo acordado el 10-23: el hub **Manage**, los **Ajustes únicos** de la persona y la **cola de soporte 2.0**, con el mismo diseño que la app.

## Qué cambió (web v2)
- **Menú lateral** (`OrganizerShell`): Eventos · RSVPs · **Manage** (owner/admin; resaltado también en Equipo, Pagos y Ajustes de organización). Equipo, Pagos y Ajustes ya no son entradas sueltas. Al pie, "Mi cuenta" pasa a **Ajustes** (`/v2/account`); el avatar del encabezado igual.
- **Hub Manage** `/v2/organizer/manage?org=` (`organizer/manage/ManageView.tsx` + `page.tsx`, solo owner/admin; el resto vuelve a Eventos): filas Equipo (N miembros), Pagos (disponible / "Conecta Stripe para cobrar") y Ajustes; mismas claves de caché que Equipo y Pagos. Equipo, Pagos y Ajustes de organización vuelven a Manage con ← y migas `Organización › Manage › …`.
- **Ajustes únicos** `/v2/account` (`account/AccountView.tsx`, mismas secciones que la app): Cuenta (Clerk, solo lectura + "Contraseña, e-mails y seguridad" → perfil de Clerk), Idioma, **Notificaciones** (`GET/PUT /api/me/notification-preferences`; grupo de organizador solo si perteneces a alguna organización; las obligatorias bloqueadas; si falla, vuelve atrás con mensaje), **Aprobación de organizadores** (solo soporte, con el número pendiente), Cerrar sesión y **Eliminar cuenta** (dos confirmaciones, `DELETE /api/user/delete`).
- **Cola de soporte 2.0** `/v2/support/organizations` (`support/organizations/`): Pendientes / Rechazadas con conteo, buscador si hay más de 4 (nombre o e-mail, sin tildes), Aprobar y Eliminar con confirmación, Rechazar con motivo opcional, errores de la API en la tarjeta. Misma API admin que v1 (la API decide quién es soporte). La sección v1 en `/profile` sigue existiendo.
- `routes.manage`, `routes.supportQueue`; íconos grid, bell, globe, shield.

## Tests
- `__tests__/setup.ts`: `configure({ asyncUtilTimeout: 4000 })`. **Causa encontrada:** con 2 CPU, `findBy`/`waitFor` (1 s por defecto) hacían fallar al azar Payouts, Dashboard, EditEvent y OrganizerShell (en cada corrida fallaban tests distintos; aislados pasan). No era la lógica: Payouts fallaba igual con los archivos del último commit.
- Nuevos: `ManageHub.test.tsx` (5), `SupportQueue.test.tsx` (7). Actualizados: `OrganizerShell.test.tsx` (Manage en vez de Equipo/Pagos; Ajustes al pie; Manage activo en sub-páginas), `Settings.test.tsx` (16: título "Ajustes", perfil de Clerk, notificaciones invitado/organizador y vuelta atrás, eliminar cuenta y su error, entrada de soporte solo para soporte).
- **Verificado:** web v2 205 tests en verde (por lotes; Dashboard, EditEvent y OrganizerShell confirmados aislados), vitest lib 377/377, `tsc` web 0. **No verificado:** aspecto real en el navegador, Clerk `openUserProfile`, borrar una cuenta real.

## Hallazgo de la ronda 3 (nota de Kevin en 1b.7)
"El rechazo aparece solo para el admin; el organizador no ve la razón". El rechazo guarda `rejection_reason` pero no avisaba (decisión antigua "solo e-mail al aprobar"). **Corrección (10-27):** aquí se dijo que la organización rechazada quedaba como "pendiente" para siempre; es falso: `/api/organizations` (y `useUserOrgs` en la app) **ocultan** las rechazadas, así que desaparecía sin explicación. Resuelto el 10-27 con la notificación de rechazo (ver abajo).

## Pendiente
- Pruebas reales de esta entrega: `PruebasReales/FASE_1_ORGANIZADOR_WEB.md` → "Ronda 3 · Manage, Ajustes y soporte en la web".
- Decisiones abiertas: índice único de `stripe_account_id`; textos de notificaciones en el idioma del usuario (D4); logs de la subida de flyer en la app.
- Siguiente: **fase 2** (asistente; incluye Mis tickets con swipe).

## 10-27 · Pedidos de Kevin antes de la fase 2 (app + API)
**Reportó Kevin:** (1) Notificaciones (app): "Clear all" no borra nada; con no leídas debe confirmar, con leídas puede borrar sin preguntar. (2) Perfil (app): deslizar para recargar no actualiza "Aprobación de organizadores" (en la web sí, recargando). (3) No llega ninguna notificación al aprobar o rechazar una organización; ¿entra como invitado u organizador? (4) Iniciar sesión con Google (app): pantalla "Unmatched Route" con `project-flame://callback?created_session_id=…` aunque la sesión sí inicia.

**Causas y cambios**
- (1) [Seguro] `useNotifications.dismissAll` juntaba los ids **dentro** de un `setNotifications(prev => …)`; React lo ejecuta después, así que la lista estaba vacía al revisarla y **nunca se borraba nada** en la base (solo desaparecían de la pantalla hasta recargar). Ahora toma la lista actual, borra, y si falla la devuelve y lo dice ("No pudimos borrar tus notificaciones"). `NotificationsOverlay`: con no leídas pide confirmación ("¿Borrar todas las notificaciones? N siguen sin leer…"); todas leídas → borra directo. Título, "Marcar todo como leído" y "Borrar todo" traducidos (`inbox.*`). La política de borrado (RLS) ya permitía borrar las propias.
- (2) El refresco del Perfil ahora recarga también las consultas `["admin"]` (estado de soporte + listas). En la pantalla de aprobaciones, deslizar recarga Pendientes **y** Rechazadas (antes solo la pestaña visible).
- (3) Tipos nuevos `organization_approved` y `organization_rejected` (`packages/lib`): **siempre activos** y listados en Ajustes → Notificaciones → **"Como organizador"** (una organización pendiente ya cuenta como membresía; las rechazadas no). `app/lib/org-review-notification.ts` envía notificación en la app + push **en el idioma del dueño** (`users.language`, textos `pushes.*`; primera notificación que respeta D4). Aprobar: además del e-mail de siempre; al tocarla abre el panel de esa organización. Rechazar: el texto lleva el motivo completo (la tarjeta no lo corta) y no navega (la organización ya no aparece en ninguna lista). Re-rechazar envía otra (con el motivo nuevo). Sin migración: `notifications.type` es texto libre.
- (4) [Probable] Android entrega el regreso de Google también a Expo Router, que no tiene pantalla `callback`. **Mismo código en producción** (`Flme_comp`). Nuevo `app/+native-intent.tsx` + `lib/oauth-callback.ts`: el enlace `…://callback` se descarta con la app abierta (Clerk ya lo leyó) y, si abriera la app en frío, va al inicio.

**Tests:** app 104/104 (+4 `Inbox`, +7 `oauth-callback`, +1 `deep-links`); web: `org-review-notification` 3 nuevos, `Settings` 16, `SupportQueue` 7, `notification-preferences` 3; lib 377; tsc web 0, app 40 (sin nuevos). **No verificado:** el push real en el celular, el login con Google en el dispositivo (el fix depende de que Android entregue el enlace como se describe).

