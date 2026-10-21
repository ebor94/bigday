# Despliegue del front (AppServ)

La encuesta se publica en **https://losolivoscucuta.com/bigDay-encuesta/**, servida por **AppServ (Apache 2.2 en Windows)** desde `www/bigDay-encuesta`. La API ya corre en producción dentro de Mantix: `https://mantix-api.losolivoscucuta.com:8444/api/bigday/v1`. Este documento cubre solo el front (archivos estáticos); backend y PM2 no se tocan.

## Requisitos

- Node 20.19 o superior y `npm install` hecho en la raíz del repo.
- `rsync` y `bash` (macOS/Linux).
- El recurso compartido de AppServ montado en `/Volumes/AppServ` (o la ruta que se pase como destino).
- En Apache (AppServ): `AllowOverride` con `FileInfo` (MIME, cabeceras y caché) y `Options` (`Options -Indexes`), o `All`, para `www/bigDay-encuesta`. Con `AllowOverride None` el `.htaccess` se ignora: el sitio funciona, pero sin compresión ni caché. Si el `.htaccess` usa algo que el `AllowOverride` no permite, Apache responde 500 (ver "Si da error 500").
- Módulos recomendados (todo está dentro de `<IfModule>`, si falta alguno solo se pierde esa función): `mod_deflate`, `mod_expires`, `mod_headers`, `mod_setenvif`.

## Cómo está configurado el build

- `web/vite.config.ts`: `base: '/bigDay-encuesta/'` (absoluta; las imágenes de `public/img/` se resuelven con `BASE_URL`).
- `web/.env.production`: `VITE_API_BASE=https://mantix-api.losolivoscucuta.com:8444/api/bigday/v1`. No es un secreto, por eso va en el repo.
- `web/public/.htaccess`: se copia a `dist/` en cada build. Solo usa directivas de Apache 2.2.
- El enlace de compartir (`location.origin + location.pathname`) resulta en `https://losolivoscucuta.com/bigDay-encuesta/`, sin el `?src=` de quien respondió.

## Compilar y desplegar

```bash
# Simulación: compila y muestra qué se copiaría, sin escribir en el servidor
deploy/desplegar-front.sh --simular

# Despliegue real (destino por defecto: /Volumes/AppServ/www/bigDay-encuesta)
deploy/desplegar-front.sh

# Otro destino, y borrando los assets con hash que ya no existen en el build nuevo
deploy/desplegar-front.sh --limpiar /ruta/destino
DESTINO=/ruta/destino deploy/desplegar-front.sh
```

El script:

1. Falla con un mensaje claro si el destino (o `www/`) no existe, es decir, si AppServ no está montado.
2. Ejecuta `npm run build -w @bigday/web` (con `.env.production`).
3. Comprueba que `dist/index.html` referencia `/bigDay-encuesta/assets/`, que el bundle contiene la URL de la API de producción y que existe `dist/.htaccess`.
4. Copia con `rsync` (sin `--delete`), dejando `index.html` para el final.
5. Solo con `--limpiar`: borra en `assets/` los archivos con nombre hasheado de Vite (`nombre-XXXXXXXX.ext`, 8 caracteres) que no están en el build nuevo; cualquier otro archivo de `assets/` o del destino se deja intacto. Ejecútalo fuera de hora pico: pestañas abiertas con el build anterior aún podrían pedir sus chunks viejos. Sin `--limpiar` nunca se borra nada.

## Si da error 500

Un 500 al abrir el sitio casi siempre es el `.htaccess` (una directiva no permitida por el `AllowOverride` de AppServ). Antes y después de desplegar:

1. Prueba `curl -I https://losolivoscucuta.com/bigDay-encuesta/` y, si da 500, abre el `error.log` de AppServ (`C:\AppServ\Apache2.2\logs\error.log`, según la instalación): indica la directiva y la línea que Apache rechaza ("not allowed here").
2. Si es `Options -Indexes`: coméntala (`# Options -Indexes`) en el `.htaccess` del servidor y vuelve a probar. No se pierde nada importante: `index.html` ya evita el listado del directorio. Lo mismo para la línea que señale el log (suele ser `AddType`, `Header` o `Expires*` si falta `FileInfo`).
3. Último recurso: quita el `.htaccess` del servidor. El sitio funciona igual, solo sin compresión, caché ni cabeceras de seguridad. Después pide a quien administra AppServ ajustar `AllowOverride` y vuelve a copiarlo.

## Verificación tras desplegar

```bash
# 1) index.html: 200, sin caché
curl -sI https://losolivoscucuta.com/bigDay-encuesta/

# 2) un asset con hash: Content-Encoding: gzip y Cache-Control inmutable
ASSET=$(curl -s https://losolivoscucuta.com/bigDay-encuesta/ | grep -o 'assets/[^"]*\.js' | head -1)
curl -sI -H 'Accept-Encoding: gzip' "https://losolivoscucuta.com/bigDay-encuesta/$ASSET"

# 3) salud de la API
curl -s https://mantix-api.losolivoscucuta.com:8444/api/bigday/v1/health
# → {"estado":"ok","bd":"ok"}

# 4) CORS (preflight real del navegador)
curl -si -X OPTIONS \
  -H 'Origin: https://losolivoscucuta.com' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type' \
  https://mantix-api.losolivoscucuta.com:8444/api/bigday/v1/respuestas
```

Esperado en (4): `HTTP/1.1 204`, `Access-Control-Allow-Origin: https://losolivoscucuta.com` y `Access-Control-Allow-Headers` que incluya `Content-Type` (idealmente también `Access-Control-Allow-Methods` con `POST`). Si falta, el navegador bloqueará el envío aunque la API esté sana: revisar `CORS_ORIGIN` en el `.env` de Mantix.

Esperado en (1): `Cache-Control: no-cache` y las cabeceras `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`. Esperado en (2): `Content-Encoding: gzip` y `Cache-Control: public, max-age=31536000, immutable`.

**Prueba manual en iPhone real** (obligatoria antes de difundir): abrir el enlace desde Safari, comprobar que cargan el logo y las aves, recorrer las 7 preguntas, enviar y ver la pantalla de gracias; después cerrar y volver a abrir (debe decir "ya respondiste"). Repetir con datos móviles. Para no ensuciar los resultados, avisar a Edwin de que se borren las respuestas de prueba o hacerlas con `?src=prueba`.

## Enlaces y QR por origen

El parámetro `?src=` queda guardado como `origen` en cada respuesta:

| Canal | URL completa |
| --- | --- |
| QR de la entrada | `https://losolivoscucuta.com/bigDay-encuesta/?src=qr-entrada` |
| WhatsApp | `https://losolivoscucuta.com/bigDay-encuesta/?src=whatsapp` |
| Instagram | `https://losolivoscucuta.com/bigDay-encuesta/?src=instagram` |

Generar el QR con la URL del QR de la entrada (cualquier generador que no acorte ni redirija el enlace).

## Consultar resultados y CSV

Los endpoints están en la misma API y requieren el token `BIGDAY_RESULTS_TOKEN` del `.env` de Mantix (nunca en este repo):

```bash
API=https://mantix-api.losolivoscucuta.com:8444/api/bigday/v1
export BIGDAY_RESULTS_TOKEN='...'   # el valor del .env de Mantix

# Resumen en JSON (totales, distribución, NPS, matriz P2×P3, últimas frases)
curl -s -H "Authorization: Bearer $BIGDAY_RESULTS_TOKEN" "$API/resultados"

# CSV completo
curl -s -H "Authorization: Bearer $BIGDAY_RESULTS_TOKEN" "$API/resultados.csv" -o bigday-respuestas.csv
```

Sin token o con uno incorrecto la API responde 401; si `BIGDAY_RESULTS_TOKEN` no está definido en el servidor, 503. La API no guarda IP ni user-agent en claro (solo hashes con sal) y los resultados no los exponen.

## Superset

Conectar la base `serfuweb` y usar la vista `vw_bigday_resumen` (migración `002_vista_superset.sql` del módulo `src/bigday` de Mantix). Para Superset conviene el usuario de solo lectura definido (comentado) en `003_usuario_minimo.sql`: `bigday_superset`, con `GRANT SELECT` únicamente sobre `serfuweb.vw_bigday_resumen`. Edwin lo crea manualmente como administrador; la contraseña va solo en el gestor de contraseñas o en la conexión de Superset, nunca en el repo.

## Pendiente (TODO Edwin): `mosquero.webp`

La imagen hero del Mosquero Bermellón (ilustración del afiche exportada a WebP, ≤ 150 KB) debe guardarse en `web/public/img/mosquero.webp`. La bienvenida la usa automáticamente en cuanto existe; mientras tanto muestra el ave SVG propia. Al agregarla, volver a desplegar.

## Pruebas locales de la subruta

`npm run test:e2e` construye y sirve el build bajo `http://localhost:4173/bigDay-encuesta/` con la API simulada (`page.route`). `e2e/produccion.spec.ts` comprueba assets 200 bajo la subruta, logo cargado y que el envío va a la API de producción con `origen: 'qr-entrada'` (simulado, nunca se envía un POST real). `npm run lighthouse -w @bigday/web` y `npm run peso -w @bigday/web` también usan la subruta.
