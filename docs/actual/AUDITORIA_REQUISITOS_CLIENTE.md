# Auditoría: requisitos del cliente vs. Flame 2.0 (2026-11-02)

Fuente: lista del cliente (3 fases) contrastada con el prototipo `flame-2.0/index.html` y el código actual (web v2 + app v2).
Leyenda: ✅ hecho · 🟡 parcial · ❌ falta · 🧪 hecho pero sin prueba real de Kevin.

> Las "fases" del cliente **no** son nuestras fases internas (0–5). Mapeo abajo.

## Fase 1 del cliente — pasar lo existente al diseño nuevo

| Requisito | Estado | Dónde / nota |
| --- | --- | --- |
| Sistema de diseño | ✅ | fase 0 |
| Navegación island + encabezado que se esconde | ✅ | fases 1b/2 |
| Home | ✅ | 2.2 |
| Selector de ciudad | 🟡 | 2.2. Lista plana de ciudades; el prototipo agrupa **por país** (ver "Nuevos países y ciudades") |
| Explore | ✅🧪 | 2.5 + 4.4 (artistas, seguidores, recientes). Categorías **descartadas** por Kevin (el prototipo las tenía) |
| Página del evento | ✅🧪 | 2.4 + corrección 10-28 + corazón (4.1) + seguir (4.2) + line-up (4.3) |
| Checkout y RSVP | ✅ | fase 3 |
| Tickets, You, notificaciones | ✅ | 2.3, 2.6 |
| Panel del organizador completo | ✅ | fases 1/1b |

## Fase 2 del cliente — cambios de funcionamiento

| Requisito | Estado | Dónde / nota |
| --- | --- | --- |
| Crear evento más simple | ✅ | 1/1b.4 |
| Tiers numerados en pestaña propia | ✅ | |
| Compra por tier (selector del tier, access code en el evento, descuento en checkout) | ✅🧪 | 3.1–3.3 + corrección 10-28: "¿Tienes código de acceso?" en hoja, descuento y promotor en el checkout. Pendiente solo la prueba real (`PruebasReales/FASE_3_PAGOS.md`) |
| RSVP con un solo interruptor | ✅ | |
| Datos separados por organizador | ✅ | |
| Escáner que busca cualquier evento | 🟡 | App: lista de **tus** eventos escaneables, sin buscador; el código de acceso vive en otra pantalla (v1). El prototipo tiene **un solo campo "nombre del evento o código de acceso"**. Web no escanea (decisión de Kevin 10-16) |
| Menú del organizador en 4 (Events, RSVPs, Scan, Manage) | ✅ | App: 4. Web: 3 (sin Scan, por la misma decisión) — explicarlo al cliente. Manage solo para dueño/admin |

## Fase 3 del cliente — funciones nuevas

| Requisito | Estado | Dónde / nota |
| --- | --- | --- |
| Formulario de registro por tier | ✅🧪 | 3.4 + preguntas por entrada (migración `20261029120000`, pendiente de aplicar) |
| RSVP con preguntas por invitado | ✅🧪 | 3.4 (`_guests`) |
| Links de promotor en lote | ✅🧪 | fase 4 (pegar lista + QR) |
| Pestaña Breakdown por evento | ✅ | 1b.2a / web |
| Manage organization | 🟡 | Hub hecho (Equipo, Pagos, Ajustes). **Faltan las filas Finance y Communications** |
| Payouts con números reales | ✅ | Saldos reales de Stripe Connect (multi-país). Lo que el prototipo muestra de "transferencias bancarias cobradas directo" no existe en Flame |
| Finance | ❌ | Prototipo: total de la organización (ingresos, tickets, vía promotores, disponible para retirar) + tabla por evento. Solo lectura |
| Communications (SMS y correo) | ❌ / ⚠️ alcance | **En el prototipo es solo una pantalla "Coming soon"** (límites de correos de marketing y SMS). El cliente lo escribe como si fuera envío real de SMS y correo: confirmar alcance |
| Editar perfil | 🟡 | Hoy el botón lleva a Ajustes/cuenta. Prototipo: hoja con nombre, **@usuario**, ciudad y color de avatar |
| Nuevos países y ciudades | 🟡 | Prototipo: Ecuador, Estados Unidos, España, Panamá, Portugal, México, con ciudades agrupadas. Hoy: ciudad en texto libre, sin país en el evento, lista plana; faltan zonas horarias de Lisboa y Panamá (Madrid sí). Monedas: USD/EUR/MXN ya cubren esos países |

## Qué falta (para cumplir) — propuesta en orden de riesgo

1. **Finance** (web + app). Solo lectura, sin migración: suma por evento de lo que ya calcula Desglose/Compras + saldo de Payouts. Riesgo bajo.
2. **Communications como en el prototipo**: fila en Manage + pantalla "Próximamente". Riesgo nulo. El envío real de SMS/correo masivo es un **producto aparte** (proveedor SMS, costos por mensaje, opt-out, consentimiento, límites anti-spam): cotizar y decidir con el cliente.
3. **Países y ciudades**: catálogo `país → ciudades` en `packages/lib` (sin migración: el país se deduce de la ciudad; ciudades fuera del catálogo van a "Otras"); selector agrupado por país en Inicio (web y app); selector de ciudad en Crear evento con el catálogo (sigue aceptando otra); zonas `Europe/Lisbon` y `America/Panama`.
4. **Editar perfil**: hoja con nombre, @usuario, ciudad y color/foto. Requiere migración (`users.username` único). **Choca con una decisión de Kevin (10-27)**: la ciudad de Inicio se guarda solo en el celular; la "ciudad del perfil" sería otra cosa (pública, en el perfil) — decidir.
5. **Escáner**: buscador en la lista de eventos + campo único "evento o código de acceso" que abre el flujo de código si coincide con uno (mantiene separado el acceso sin cuenta, como decidió Kevin).

## Mejoras (no pedidas, recomendadas)

- Antes que nada: **pruebas reales de las fases 2, 3 y 4** — todo lo marcado 🧪 cumple en código pero no está validado.
- Explore: si el cliente echa de menos las categorías, se pueden reintroducir como filtro sin migración solo si los organizadores las eligen al crear (requiere columna) — hoy descartadas.
- Communications real: no venderlo como incluido; sale caro de operar.
