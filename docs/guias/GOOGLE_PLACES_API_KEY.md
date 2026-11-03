# Llave de Google Places para el lugar del evento

Usada por `/api/places/venues` y `/api/places/venues/[placeId]` (Crear/Editar evento, web y app).
La llave vive **solo en el servidor** (`GOOGLE_PLACES_API_KEY`); el navegador y la app nunca la ven.
Mismo proceso para **desarrollo** (tu cuenta) y **producción** (otra cuenta/proyecto): una llave por entorno.

## Pasos (≈15 min)

1. **Proyecto**: entra a <https://console.cloud.google.com/> → selector de proyectos → *New project* → nombre `flame-dev` (en producción `flame-prod`).
2. **Facturación**: *Billing* → enlaza una cuenta de facturación (pide tarjeta; sin ella la API responde error). Con el uso de organizadores creando eventos quedas dentro de lo gratis por mes.
3. **Activar la API**: *APIs & Services → Library* → busca **"Places API (New)"** → *Enable*. (No hace falta "Places API" legacy ni "Maps JavaScript API".)
4. **Crear la llave**: *APIs & Services → Credentials → Create credentials → API key*. Copia el valor.
5. **Restringir la llave** (en la misma llave → *Edit*):
   - *API restrictions* → **Restrict key** → marca solo **Places API (New)**.
   - *Application restrictions*: **None** en desarrollo (las llamadas salen de tu PC/servidor local). En producción tampoco sirven "HTTP referrers" (la llama el servidor, no el navegador); deja *None* y protégela con el punto 6. Nunca la pongas en variables `NEXT_PUBLIC_*` ni `EXPO_PUBLIC_*`.
6. **Tope de gasto** (recomendado):
   - *APIs & Services → Places API (New) → Quotas*: baja "Requests per day" de Autocomplete y Place Details a algo como **1.000/día** en dev.
   - *Billing → Budgets & alerts*: presupuesto de **USD 10/mes** con alertas al 50/90/100 %.
7. **Ponerla en el proyecto**:
   - Local: `apps/web/.env` → `GOOGLE_PLACES_API_KEY=<tu llave>` y reinicia `pnpm dev`.
   - Producción: Vercel → proyecto web → *Settings → Environment Variables* → `GOOGLE_PLACES_API_KEY` solo en *Production* (y otra de dev en *Preview* si quieres) → redeploy.
   - La app no necesita nada: llama a la API web.

## Comprobar

Crear evento → elige ciudad → escribe 3 letras del lugar: aparecen sugerencias. Sin llave el campo sigue siendo texto libre (la API responde 503 `PLACES_NOT_CONFIGURED`, a propósito).

## Costos (referencia 2026, verificar en la consola)

- Facturación **por sesión**: escribir + elegir = 1 sesión (Autocomplete + 1 Place Details *Essentials*, solo `id,formattedAddress`).
- Tramo gratis por producto: 10.000 Autocomplete y 10.000 Place Details Essentials al mes. Búsquedas abandonadas se cobran por consulta (USD 2,83 / 1.000 pasado lo gratis).
- El link "Abrir en Maps" lo arma la app (Maps URLs): **no** consume la API.

## Ojo

- El campo de ciudad **v1** (`/api/places/autocomplete`, Places API legacy) no funciona con una llave nueva: Google ya no deja activar la API legacy en proyectos nuevos. La v2 ya no lo usa (ciudad desde la lista).
- [Probable] Términos de Google: el `place_id` se puede guardar indefinidamente; la dirección se guarda como dato del evento que el organizador confirmó (puede editarla escribiendo otro lugar).
