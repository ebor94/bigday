#!/usr/bin/env bash
# Compila el front y lo copia al servidor AppServ (Apache 2.2) montado en esta máquina.
# Uso: deploy/desplegar-front.sh [--limpiar] [--simular] [DESTINO]
#   DESTINO   Carpeta de destino (también por variable DESTINO).
#             Por defecto: /Volumes/AppServ/www/bigDay-encuesta
#   --limpiar Tras copiar, borra de assets/ solo los archivos con nombre hasheado de Vite
#             (nombre-XXXXXXXX.ext, 8 caracteres de hash) que no están en el build nuevo.
#             Cualquier otro archivo se deja intacto. Ejecutar fuera de hora pico: pestañas
#             abiertas con el build anterior podrían pedir aún sus chunks viejos.
#   --simular Muestra qué se copiaría (rsync --dry-run) sin escribir en el destino.
# Sin --limpiar nunca se borra nada en el destino (no se usa rsync --delete).
set -euo pipefail

SUBRUTA="/bigDay-encuesta/"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$RAIZ/web/dist"

LIMPIAR=0
SIMULAR=0
ARG_DESTINO=""
for arg in "$@"; do
  case "$arg" in
    --limpiar) LIMPIAR=1 ;;
    --simular) SIMULAR=1 ;;
    -h|--help) sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "Opción desconocida: $arg" >&2; exit 2 ;;
    *) ARG_DESTINO="$arg" ;;
  esac
done
DESTINO="${ARG_DESTINO:-${DESTINO:-/Volumes/AppServ/www/bigDay-encuesta}}"
DESTINO="${DESTINO%/}"

# 1) El destino debe existir: la unidad de red tiene que estar montada.
#    Se comprueba el padre (www/) para no crear la carpeta en un volumen que no está montado.
if [ ! -d "$DESTINO" ]; then
  PADRE="$(dirname "$DESTINO")"
  if [ ! -d "$PADRE" ]; then
    echo "ERROR: no existe '$DESTINO' ni su carpeta superior '$PADRE'. ¿Está montado AppServ?" >&2
    echo "       Monta el recurso compartido o indica otro destino: $0 /ruta/destino" >&2
    exit 1
  fi
  if [ "$SIMULAR" -eq 0 ]; then
    echo "ERROR: no existe '$DESTINO'. Créala en el servidor (o con mkdir) y vuelve a ejecutar." >&2
    exit 1
  fi
fi

# 2) Build de producción (Vite lee web/.env.production).
echo "==> Compilando el front..."
(cd "$RAIZ" && npm run build -w @bigday/web)

# 3) El build debe referenciar la subruta de producción.
if ! grep -q "src=\"${SUBRUTA}assets/" "$DIST/index.html"; then
  echo "ERROR: dist/index.html no referencia '${SUBRUTA}assets/'. ¿Cambió 'base' en web/vite.config.ts?" >&2
  exit 1
fi
if ! grep -rqF "mantix-api.losolivoscucuta.com:8444/api/bigday/v1" "$DIST/assets"; then
  echo "ERROR: el build no contiene la URL de la API de producción. Revisa web/.env.production." >&2
  exit 1
fi
if [ ! -f "$DIST/.htaccess" ]; then
  echo "ERROR: falta dist/.htaccess (debe venir de web/public/.htaccess)." >&2
  exit 1
fi
echo "==> Build correcto: referencia ${SUBRUTA} y la API de producción."

# 4) Copia. Sin --delete. Se omiten permisos/propietarios (el destino suele ser SMB/Windows).
OPC=(-rtv --no-perms --no-owner --no-group)
[ "$SIMULAR" -eq 1 ] && OPC+=(--dry-run)
echo "==> Copiando web/dist/ -> $DESTINO/"
# index.html al final: así nadie recibe un index que apunta a assets aún no copiados.
rsync "${OPC[@]}" --exclude '/index.html' "$DIST/" "$DESTINO/"
rsync "${OPC[@]}" "$DIST/index.html" "$DESTINO/index.html"

# 5) Limpieza opcional: solo assets/ con hash que ya no existen en el build nuevo.
if [ "$LIMPIAR" -eq 1 ]; then
  if [ -d "$DESTINO/assets" ]; then
    echo "==> Limpiando assets viejos en $DESTINO/assets"
    while IFS= read -r archivo; do
      # Solo nombres con el patrón de hash de Vite: nombre-XXXXXXXX.ext
      [[ "$archivo" =~ ^.+-[A-Za-z0-9_-]{8}\.[A-Za-z0-9.]+$ ]] || continue
      if [ ! -e "$DIST/assets/$archivo" ]; then
        if [ "$SIMULAR" -eq 1 ]; then
          echo "(simulación) se borraría assets/$archivo"
        else
          rm -f -- "$DESTINO/assets/$archivo" && echo "borrado assets/$archivo"
        fi
      fi
    done < <(cd "$DESTINO/assets" && find . -maxdepth 1 -type f -exec basename {} \;)
  fi
fi

echo "==> Listo. Verifica: curl -I https://losolivoscucuta.com${SUBRUTA}"
