# Despliegue del front (AppServ)

La encuesta se publica en **https://losolivoscucuta.com/bigDay-encuesta/**, servida por **AppServ (Apache 2.2 en Windows)** desde `www/bigDay-encuesta`. La API ya corre en producción dentro de Mantix: `https://mantix-api.losolivoscucuta.com:8444/api/bigday/v1`. Este documento cubre solo el front (archivos estáticos); backend y PM2 no se tocan.

## Requisitos

- Node 20.19 o superior y `npm install` hecho en la raíz del repo.
- `rsync` y `bash` (macOS/Linux).
- El recurso compartido de AppServ montado en `/Volumes/AppServ` (o la ruta que se pase como destino).
- En Apache (AppServ): `AllowOverride` con `FileInfo` (MIME, cabeceras y caché) y `Options` (`Options -Indexes`), o `All`, para `www/bigDay-encuesta`. Con `AllowOverride None` el `.htaccess` se ignora: el sitio funciona, pero sin compresión ni caché. Si el `.htaccess` usa algo que el `AllowOverride` no permite, Apache responde 500 (ver "Si da error 500").
- Módulos recomendados (todo está dentro de `<IfModule>`, si falta alguno solo se pierde esa función): `mod_rewrite` (redirección www, ver abajo), `mod_deflate`, `mod_expires`, `mod_headers`, `mod_setenvif`.

## Redirección www → sin www (CORS)

La API solo acepta por CORS el origen `https://losolivoscucuta.com` (allowlist `CORS_ORIGIN` de Mantix). Si alguien abre `https://www.losolivoscucuta.com/bigDay-encuesta/`, la página carga pero **todo envío falla por CORS** (la respuesta queda pendiente en el dispositivo y nunca llega). Por eso el `.htaccess` redirige con 301:

```apache
<IfModule mod_rewrite.c>
  Options +FollowSymLinks
  RewriteEngine On
  RewriteCond %{HTTP_HOST} ^www\.losolivoscucuta\.com$ [NC]
  RewriteRule ^(.*)$ https://losolivoscucuta.com/bigDay-encuesta/$1 [R=301,L]
</IfModule>
```

- En un `.htaccess` la ruta que ve `RewriteRule` es relativa al directorio (sin `bigDay-encuesta/`), por eso el destino la antepone. La query (`?src=…`) se conserva sola.
- `Options +FollowSymLinks` es obligatorio: sin él (si el `httpd.conf` no lo da), Apache responde **403 a todo el sitio** ("Options FollowSymLinks and SymLinksIfOwnerMatch are both off, so the RewriteRule directive is also forbidden"). Necesita `AllowOverride Options`, igual que `Options -Indexes`.
- Sin `mod_rewrite` el bloque se ignora (no da 500): el sitio sigue en `www` sin redirigir. Verificado en Apache 2.4 local con y sin el módulo (`httpd -t`, `curl -H 'Host: www.losolivoscucuta.com'`).
- Comprobar en producción:

```bash
curl -sI 'https://www.losolivoscucuta.com/bigDay-encuesta/?src=whatsapp' | grep -iE '^(HTTP|location)'
# → HTTP/1.1 301 … y Location: https://losolivoscucuta.com/bigDay-encuesta/?src=whatsapp
```

- **Alternativa** (si AppServ no tiene `mod_rewrite` o la redirección no se puede activar): añadir el origen www a la allowlist de Mantix y reiniciar la API: `CORS_ORIGIN=https://losolivoscucuta.com,https://www.losolivoscucuta.com` en el `.env` de Mantix (ojo: si `CORS_ORIGIN` se define, sustituye a la lista por defecto; incluir todos los orígenes que Mantix ya usa).

## Cómo está configurado el build

- `web/vite.config.ts`: `base: '/bigDay-encuesta/'` (absoluta; las imágenes de `public/img/` se resuelven con `BASE_URL`).
- `web/.env.production`: `VITE_API_BASE=https://mantix-api.losolivoscucuta.com:8444/api/bigday/v1`. No es un secreto, por eso va en el repo.
- `web/public/.htaccess`: se copia a `dist/` en cada build. Solo usa directivas de Apache 2.2.
- La pantalla de gracias muestra los enlaces al video del evento (Instagram y Facebook), definidos en `web/src/lib/videoEvento.ts`. Ya no hay botón de compartir.

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

**Prueba manual en iPhone real** (obligatoria antes de difundir): abrir el enlace desde Safari, comprobar que cargan el logo y las aves, recorrer las 7 preguntas, enviar y ver la pantalla de gracias; después cerrar y volver a abrir (debe decir "ya respondiste"). Repetir con datos móviles. Hacerla **también en un iPhone con iOS 15** (o el más antiguo disponible): las pruebas e2e usan el WebKit de Playwright, que es mucho más reciente que el Safari de iOS 15, así que ese caso solo se cubre a mano (transiciones, `backdrop-filter`, scroll al cambiar de pregunta, envío). Hacer las pruebas con `?src=prueba` y borrarlas después (ver "Borrar las respuestas de prueba").

## Borrar las respuestas de prueba

Antes de difundir, Edwin (con un usuario de BD con `DELETE`, no el de la API) borra lo enviado con `?src=prueba`:

```sql
-- Primero contar y revisar qué se va a borrar:
SELECT COUNT(*), MIN(created_at), MAX(created_at) FROM serfuweb.bigday_respuestas WHERE origen = 'prueba';
-- Luego borrar:
DELETE FROM serfuweb.bigday_respuestas WHERE origen = 'prueba';
```

**Revisar el `WHERE` dos veces antes de ejecutar**: un `DELETE` sin él (o con otro valor) borra respuestas reales y no hay papelera. Si alguna prueba se hizo sin `?src=prueba`, identificarla por `uuid` o por fecha y borrarla con un `WHERE` igual de explícito.

## Rollback

**Front** (AppServ): volver a desplegar el commit anterior con el mismo script. Como el script copia sin `--delete`, los assets del build anterior siguen en el servidor y basta con restaurar su `index.html` (el script lo copia al final):

```bash
git log --oneline -5                 # elegir el commit bueno
git checkout <commit-bueno>
deploy/desplegar-front.sh            # sin --limpiar
git checkout feat/encuesta-bigday    # volver a la rama
```

No usar `--limpiar` durante un rollback (borraría los assets del build que se acaba de retirar, que pestañas abiertas aún podrían pedir).

**Backend** (Mantix). El módulo entró a `main` en **varias fusiones** de `feature/bigday`: `fce6851` (módulo), `5aab4fd` (DB_* y `bigday:migrate`), `2c1a4c2` (router y limitadores al cargar), más la de las correcciones finales (anotar su SHA al fusionar). Revertir solo una deja el código a medias. Dos opciones:

1. **Emergencia (la más simple, recomendada):** desactivar la ruta sin revertir nada. En `src/routes/index.js` de Mantix comentar la línea

   ```js
   // router.use('/bigday/v1', bigdayRoutes); // ← Módulo October Big Day (encuesta)
   ```

   (el `require('../bigday/routes')` puede quedarse: al cargarse no abre conexiones ni lanza), hacer commit y push a `origin/main` y redesplegar con `deploy-mantix`. `/api/bigday/v1/*` pasa a responder el 404 de Mantix y el resto de Mantix no cambia. Para reactivarla, descomentar y redesplegar.

2. **Reversión completa:** revertir **cada** fusión, de la más nueva a la más antigua, siempre con `-m 1` (el padre 1 es `main`):

   ```bash
   git checkout main && git pull
   git log --merges --oneline --grep 'feature/bigday'   # confirmar la lista y el orden
   git revert -m 1 <fusión-final>   # la de las correcciones finales
   git revert -m 1 2c1a4c2
   git revert -m 1 5aab4fd
   git revert -m 1 fce6851
   npx jest                          # Mantix sigue en verde
   git push origin main && deploy-mantix
   ```

   Ojo: si más adelante se quiere volver a fusionar `feature/bigday`, git considera esos commits ya integrados; habría que revertir los reverts (`git revert <sha-del-revert>`) en lugar de fusionar de nuevo.

En ambos casos la tabla `bigday_respuestas` y la vista pueden quedarse: no molestan a Mantix y conservan las respuestas ya recibidas. Mientras el backend esté desactivado, los envíos responden 404 y quedan pendientes en cada dispositivo, que los reintenta solo (no se pierden: el front solo descarta ante 400, 413 o 422).

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
